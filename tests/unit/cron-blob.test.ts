/**
 * Wiring test for the nightly sweep's prototype-basket phase.
 *
 * The pure halves are covered in blob-sweep.test.ts. What this checks is the bit
 * that only exists inside the route: that a blob basket is actually found,
 * fetched, folded back in, saved, and turned into a notification — and that
 * everything else in somebody's basket survives the round trip untouched.
 *
 * Everything with a side effect is mocked. This test must never reach the real
 * database or a real retailer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtoDb } from "@/lib/merge-basket";

const DAY = 86_400_000;
/**
 * Real wall-clock, deliberately. The route calls Date.now() when it decides what
 * is due, so a fixture pinned to a made-up constant in the future makes every
 * item look freshly checked and the whole phase silently does nothing.
 */
const NOW = Date.now();

/** Steph's basket, as the prototype actually stores it. */
function basket(): ProtoDb {
  return {
    profiles: [{ id: "pr_1", name: "Steph" }],
    current: "pr_1",
    items: {
      pr_1: [
        {
          id: "it_coat",
          name: "Wool coat",
          url: "https://example.com/coat",
          cur: "£",
          price: 120,
          targetPrice: 100,
          priceHistory: [{ t: NOW - 9 * DAY, p: 120 }],
          lastChecked: NOW - 8 * DAY,
          bought: false,
        },
        {
          id: "it_bought",
          name: "Already bought",
          url: "https://example.com/x",
          cur: "£",
          price: 40,
          bought: true,
        },
      ] as never,
    },
    lists: { pr_1: [{ id: "l_win", name: "Winter" }] as never },
    settings: { deleted: { it_gone: 1 }, lastSaved: 42 },
  };
}

const db = {
  saved: null as ProtoDb | null,
  moments: [] as Array<Record<string, unknown>>,
};

vi.mock("@/lib/db", () => ({
  prisma: {
    item: { findMany: vi.fn(async () => []), update: vi.fn() },
    list: { findMany: vi.fn(async () => []) },
    user: {
      findMany: vi.fn(async () => [{ id: "u1", demoBackup: basket(), monthlyBudget: 20_000 }]),
      findUnique: vi.fn(async () => ({ demoBackup: basket() })),
      update: vi.fn(async ({ data }: { data: { demoBackup: ProtoDb } }) => {
        db.saved = data.demoBackup;
        return {};
      }),
    },
    moment: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        db.moments.push(...data);
        return { count: data.length };
      }),
    },
  },
}));

const extract = vi.fn(async () => ({
  extracted: { priceMinor: 8_900, currency: "GBP", availability: "in", method: "jsonld" },
  blocked: false,
}));
vi.mock("@/lib/extract", () => ({ extractWithFallback: (...a: unknown[]) => extract(...(a as [])) }));

const pushed = vi.fn(async () => 1);
vi.mock("@/lib/push", () => ({ pushToUser: (...a: unknown[]) => pushed(...(a as [])) }));

async function runCron() {
  const { GET } = await import("@/app/api/cron/price-check/route");
  return GET(
    new Request("https://baskit.test/api/cron/price-check", {
      headers: { authorization: "Bearer test-secret" },
    }),
  );
}

describe("nightly sweep — prototype baskets", () => {
  // The route pulls in the generated Prisma client and paces itself between
  // stores, so the 5s default trips on the first run and its writes then bleed
  // into the next test. Give it room.
  vi.setConfig({ testTimeout: 30_000 });

  beforeEach(() => {
    db.saved = null;
    db.moments = [];
    extract.mockClear();
    pushed.mockClear();
    process.env.CRON_SECRET = "test-secret";
  });

  it("checks a blob item the row sweep could never see, and saves the new price", async () => {
    const res = await runCron();
    const body = (await res.json()) as Record<string, number>;

    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledWith("https://example.com/coat", 15_000);
    expect(body.blobUsers).toBe(1);
    expect(body.blobAttempted).toBe(1);
    expect(body.blobUpdated).toBe(1);
    expect(body.blobChanged).toBe(1);

    const coat = db.saved!.items!.pr_1.find((i) => i.id === "it_coat")!;
    expect(coat.price).toBe(89);
    expect(coat.priceHistory).toHaveLength(2);
    expect(coat.priceHistory!.at(-1)!.p).toBe(89);
    expect(coat.stock).toBe("in");
  });

  it("leaves the rest of the basket exactly as it found it", async () => {
    await runCron();
    const before = basket();
    expect(db.saved!.lists).toEqual(before.lists);
    expect(db.saved!.settings).toEqual(before.settings);
    expect(db.saved!.profiles).toEqual(before.profiles);
    // The bought item is neither fetched nor rewritten.
    expect(db.saved!.items!.pr_1.find((i) => i.id === "it_bought")).toEqual(
      before.items!.pr_1.find((i) => i.id === "it_bought"),
    );
  });

  it("raises a notification that names the item and its target price", async () => {
    await runCron();
    expect(db.moments).toHaveLength(1);
    const m = db.moments[0];
    expect(m.kind).toBe("price_drop");
    expect(m.title).toBe("Wool coat dropped to £89");
    expect(m.body).toContain("at or below your target of £100");
    expect(m.deeplink).toBe("/prototype.html#item=it_coat");
    expect(m.itemId).toBeNull();
    expect(pushed).toHaveBeenCalled();
  });

  it("refuses to write a price quoted in another currency", async () => {
    extract.mockResolvedValueOnce({
      extracted: { priceMinor: 8_900, currency: "USD", availability: null, method: "jsonld" },
      blocked: false,
    } as never);

    const body = (await (await runCron()).json()) as Record<string, number>;
    expect(body.blobRefused).toBe(1);
    expect(body.blobUpdated).toBe(0);

    const coat = db.saved!.items!.pr_1.find((i) => i.id === "it_coat")!;
    expect(coat.price).toBe(120); // untouched
    expect(coat.lastChecked).toBeGreaterThanOrEqual(NOW); // but stamped, so not retried nightly
    expect(db.moments).toHaveLength(0);
  });

  it("stays silent when the price has not moved", async () => {
    extract.mockResolvedValueOnce({
      extracted: { priceMinor: 12_000, currency: "GBP", availability: null, method: "jsonld" },
      blocked: false,
    } as never);

    const body = (await (await runCron()).json()) as Record<string, number>;
    expect(body.blobUpdated).toBe(1);
    expect(body.blobChanged).toBe(0);
    expect(db.moments).toHaveLength(0);
  });

  it("refuses to run at all without the cron secret", async () => {
    delete process.env.CRON_SECRET;
    expect((await runCron()).status).toBe(503);
  });
});
