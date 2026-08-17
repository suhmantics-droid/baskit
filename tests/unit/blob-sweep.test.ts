import { describe, expect, it } from "vitest";
import {
  HOT_MS,
  SLOW_MS,
  WARM_MS,
  applyBlobPrice,
  collectDue,
  isNotifiableDrop,
  protoLatestPrice,
} from "../../lib/blob-sweep";
import type { ProtoDb } from "../../lib/merge-basket";

const NOW = 1_800_000_000_000;
const SLOW = new Set(["argos.co.uk", "next.co.uk"]);

function db(items: Record<string, unknown>[]): ProtoDb {
  return {
    profiles: [{ id: "pr_1", name: "Steph" }],
    current: "pr_1",
    items: { pr_1: items as never },
    lists: { pr_1: [] },
    settings: {},
  };
}

const coat = {
  id: "it_coat",
  name: "Wool coat",
  url: "https://example.com/coat",
  cur: "£",
  price: 120,
  priceHistory: [{ t: NOW - 10 * 86_400_000, p: 140 }, { t: NOW - 5 * 86_400_000, p: 120 }],
  lastChecked: NOW - 3 * 86_400_000,
  bought: false,
};

describe("protoLatestPrice", () => {
  it("prefers the newest history point over the flat field", () => {
    expect(protoLatestPrice(coat as never)).toBe(120);
  });

  it("falls back to the flat price when there is no history", () => {
    expect(protoLatestPrice({ id: "x", price: 42 } as never)).toBe(42);
    expect(protoLatestPrice({ id: "x" } as never)).toBeNull();
  });
});

describe("collectDue", () => {
  it("finds items the row sweep could never see", () => {
    const due = collectDue(db([coat]), NOW, SLOW);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ profileId: "pr_1", itemId: "it_coat", price: 120, currency: "£" });
  });

  it("skips items with no link, and ones already bought or let go", () => {
    const out = collectDue(
      db([
        { id: "a", cur: "£", price: 10 }, // no url
        { ...coat, id: "b", bought: true },
        { ...coat, id: "c", letGo: true },
      ]),
      NOW,
      SLOW,
    );
    expect(out).toEqual([]);
  });

  it("checks a never-checked item and one with a target price on the hot tier", () => {
    const fresh = { ...coat, id: "new", lastChecked: null };
    const targeted = { ...coat, id: "tgt", targetPrice: 90, lastChecked: NOW - HOT_MS - 1 };
    const ids = collectDue(db([fresh, targeted]), NOW, SLOW).map((t) => t.itemId);
    expect(ids).toEqual(expect.arrayContaining(["new", "tgt"]));
  });

  it("leaves an untargeted item alone until the warm interval elapses", () => {
    const justChecked = { ...coat, lastChecked: NOW - (WARM_MS - HOUR()) };
    expect(collectDue(db([justChecked]), NOW, SLOW)).toEqual([]);
    const overdue = { ...coat, lastChecked: NOW - (WARM_MS + 1) };
    expect(collectDue(db([overdue]), NOW, SLOW)).toHaveLength(1);
  });

  it("backs off to weekly for stores known to block plain fetches", () => {
    const argos = { ...coat, url: "https://www.argos.co.uk/x", lastChecked: NOW - (WARM_MS + 1) };
    expect(collectDue(db([argos]), NOW, SLOW)).toEqual([]);
    const ancient = { ...argos, lastChecked: NOW - (SLOW_MS + 1) };
    expect(collectDue(db([ancient]), NOW, SLOW)).toHaveLength(1);
  });

  it("takes the stalest first and honours the batch cap", () => {
    const many = [1, 2, 3, 4, 5].map((n) => ({
      ...coat,
      id: "it_" + n,
      lastChecked: NOW - n * 30 * 86_400_000,
    }));
    const out = collectDue(db(many), NOW, SLOW, 2);
    expect(out.map((t) => t.itemId)).toEqual(["it_5", "it_4"]);
  });

  it("sweeps every profile in the blob, not just the current one", () => {
    const two: ProtoDb = {
      ...db([coat]),
      items: { pr_1: [coat] as never, pr_2: [{ ...coat, id: "it_other" }] as never },
    };
    expect(collectDue(two, NOW, SLOW).map((t) => t.profileId).sort()).toEqual(["pr_1", "pr_2"]);
  });

  it("survives an empty or malformed blob rather than throwing", () => {
    expect(collectDue(null, NOW)).toEqual([]);
    expect(collectDue({} as ProtoDb, NOW)).toEqual([]);
  });
});

describe("applyBlobPrice", () => {
  const target = { profileId: "pr_1", itemId: "it_coat", currency: "£" };

  it("writes a fallen price in major units and appends to history", () => {
    const out = applyBlobPrice(db([coat]), target, { priceMinor: 9_900, currency: "GBP" }, NOW);
    expect(out.applied).toBe(true);
    expect(out.changed).toBe(true);
    expect(out.previous).toBe(120);
    expect(out.next).toBe(99);

    const item = out.blob.items!.pr_1[0];
    expect(item.price).toBe(99);
    expect(item.priceHistory).toHaveLength(3);
    expect(item.priceHistory!.at(-1)).toEqual({ t: NOW, p: 99 });
    expect(item.lastChecked).toBe(NOW);
  });

  it("records the check without a history point when nothing moved", () => {
    const out = applyBlobPrice(db([coat]), target, { priceMinor: 12_000, currency: "GBP" }, NOW);
    expect(out.applied).toBe(true);
    expect(out.changed).toBe(false);
    expect(out.blob.items!.pr_1[0].priceHistory).toHaveLength(2);
    expect(out.blob.items!.pr_1[0].lastChecked).toBe(NOW);
  });

  it("REFUSES to overwrite when the page quotes a different currency", () => {
    const out = applyBlobPrice(db([coat]), target, { priceMinor: 9_900, currency: "USD" }, NOW);
    expect(out.applied).toBe(false);
    expect(out.refused).toBe("currency_mismatch");
    // Price untouched, but the check is stamped so it is not retried nightly.
    expect(out.blob.items!.pr_1[0].price).toBe(120);
    expect(out.blob.items!.pr_1[0].lastChecked).toBe(NOW);
  });

  it("treats the stored symbol and the ISO code as the same currency", () => {
    const rupees = { ...coat, cur: "₹", price: 6000, priceHistory: [{ t: NOW - 1, p: 6000 }] };
    const out = applyBlobPrice(
      db([rupees]),
      { ...target, currency: "₹" },
      { priceMinor: 550_000, currency: "INR" },
      NOW,
    );
    expect(out.applied).toBe(true);
    expect(out.next).toBe(5_500);
    expect(out.blob.items!.pr_1[0].cur).toBe("₹");
  });

  it("does not mutate the basket it was handed", () => {
    const original = db([coat]);
    const before = JSON.stringify(original);
    applyBlobPrice(original, target, { priceMinor: 100, currency: "GBP" }, NOW);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("leaves everything else in the basket exactly as it was", () => {
    const rich: ProtoDb = {
      ...db([coat, { ...coat, id: "it_other", price: 55 }]),
      lists: { pr_1: [{ id: "l1", name: "Winter" }] as never },
      settings: { deleted: { it_gone: NOW }, lastSaved: 123 },
    };
    const out = applyBlobPrice(rich, target, { priceMinor: 9_900, currency: "GBP" }, NOW);
    expect(out.blob.lists).toEqual(rich.lists);
    expect(out.blob.settings).toEqual(rich.settings);
    expect(out.blob.profiles).toEqual(rich.profiles);
    expect(out.blob.items!.pr_1[1]).toEqual(rich.items!.pr_1[1]);
  });

  it("skips an item that vanished between collecting and writing", () => {
    const out = applyBlobPrice(db([]), target, { priceMinor: 100, currency: "GBP" }, NOW);
    expect(out.applied).toBe(false);
    expect(out.refused).toBe("missing");
  });
});

describe("isNotifiableDrop", () => {
  it("notifies on hitting a target price, however small the move", () => {
    expect(isNotifiableDrop(90.5, 90, 90)).toBe(true);
  });

  it("notifies on a pound off, or five percent", () => {
    expect(isNotifiableDrop(120, 119, null)).toBe(true);
    expect(isNotifiableDrop(200, 189, null)).toBe(true);
  });

  it("stays quiet on pennies, rises and unknowns", () => {
    expect(isNotifiableDrop(120, 119.5, null)).toBe(false);
    expect(isNotifiableDrop(120, 130, null)).toBe(false);
    expect(isNotifiableDrop(null, 100, null)).toBe(false);
  });
});

function HOUR() {
  return 3_600_000;
}
