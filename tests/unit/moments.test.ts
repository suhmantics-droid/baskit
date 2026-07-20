import { describe, it, expect } from "vitest";
import { evaluateMoments, type Moment } from "../../lib/moments";
import { makeItem, NOW, DAY } from "./fixtures";

const kinds = (ms: Moment[]) => ms.map((m) => m.kind);

describe("evaluateMoments — target hit", () => {
  it("fires once when price is at or below target", () => {
    const ms = evaluateMoments(makeItem({ price: 7000, targetPrice: 8000 }), { now: NOW });
    expect(kinds(ms)).toEqual(["target_hit"]);
    expect(ms[0].dedupeKey).toBe("target_hit:it1:8000");
  });

  it("does not fire when price is above target", () => {
    const ms = evaluateMoments(makeItem({ price: 9000, targetPrice: 8000 }), { now: NOW });
    expect(kinds(ms)).not.toContain("target_hit");
  });
});

describe("evaluateMoments — sale", () => {
  it("ranks a closing sale above an open-ended one", () => {
    const item = makeItem({ domain: "nike.com", price: 5000 });
    const closing = evaluateMoments(item, {
      now: NOW,
      sale: { found: true, text: "20% off", endsAt: NOW + DAY },
    });
    expect(kinds(closing)).toEqual(["sale"]);
    expect(closing[0].priority).toBe(4);

    const open = evaluateMoments(item, {
      now: NOW,
      sale: { found: true, text: "20% off", endsAt: NOW + 10 * DAY },
    });
    expect(open[0].priority).toBe(3);
  });

  it("ignores a domain with no active sale", () => {
    const ms = evaluateMoments(makeItem({ domain: "nike.com", price: 5000 }), {
      now: NOW,
      sale: { found: false },
    });
    expect(ms).toEqual([]);
  });
});

describe("evaluateMoments — cool-off finished", () => {
  it("fires when elapsed, affordable and still a good decision", () => {
    const item = makeItem({ cooldownDays: 7, waitUntil: NOW - DAY, status: "later" });
    const ms = evaluateMoments(item, { now: NOW });
    expect(kinds(ms)).toEqual(["cooloff_done"]);
    expect(ms[0].dedupeKey).toBe(`cooloff_done:it1:${NOW - DAY}`);
  });

  it("does not fire when the decision is weak", () => {
    // impulse (-18) + cool-off elapsed (+12) = 44, below the Leaning-yes threshold.
    const item = makeItem({ priority: "impulse", cooldownDays: 7, waitUntil: NOW - DAY });
    const ms = evaluateMoments(item, { now: NOW });
    expect(kinds(ms)).not.toContain("cooloff_done");
  });

  it("does not fire while still cooling off", () => {
    const item = makeItem({ cooldownDays: 7, waitUntil: NOW + 3 * DAY, status: "later" });
    expect(kinds(evaluateMoments(item, { now: NOW }))).not.toContain("cooloff_done");
  });
});

describe("evaluateMoments — back in stock", () => {
  it("fires on out→in and low→in transitions", () => {
    const item = makeItem({ stock: "in", price: 5000 });
    expect(kinds(evaluateMoments(item, { now: NOW, previousStock: "out" }))).toEqual([
      "back_in_stock",
    ]);
    expect(kinds(evaluateMoments(item, { now: NOW, previousStock: "low" }))).toEqual([
      "back_in_stock",
    ]);
  });

  it("does not fire when it was already in stock", () => {
    const item = makeItem({ stock: "in", price: 5000 });
    expect(evaluateMoments(item, { now: NOW, previousStock: "in" })).toEqual([]);
  });
});

describe("evaluateMoments — budget window", () => {
  it("surfaces an affordable, well-scoring want-now item", () => {
    const item = makeItem({ status: "want", price: 5000 });
    const ms = evaluateMoments(item, {
      now: NOW,
      budget: 20000,
      budgetWindow: { id: "2026-07", label: "Payday" },
    });
    expect(kinds(ms)).toEqual(["budget_window"]);
    expect(ms[0].dedupeKey).toBe("budget_window:it1:2026-07");
  });

  it("skips items priced above the budget", () => {
    const item = makeItem({ status: "want", price: 50000 });
    const ms = evaluateMoments(item, {
      now: NOW,
      budget: 20000,
      budgetWindow: { id: "2026-07" },
    });
    expect(kinds(ms)).not.toContain("budget_window");
  });
});

describe("evaluateMoments — guards and dedupe", () => {
  it("generates nothing for a bought item", () => {
    const item = makeItem({ price: 7000, targetPrice: 8000, bought: true });
    expect(evaluateMoments(item, { now: NOW })).toEqual([]);
  });

  it("produces the same dedupeKey across repeated evaluations", () => {
    const item = makeItem({ price: 7000, targetPrice: 8000 });
    const keys = new Set<string>();
    for (const m of evaluateMoments(item, { now: NOW })) keys.add(m.dedupeKey);
    for (const m of evaluateMoments(item, { now: NOW })) keys.add(m.dedupeKey);
    expect(keys.size).toBe(1); // the crossing never fires twice
  });
});
