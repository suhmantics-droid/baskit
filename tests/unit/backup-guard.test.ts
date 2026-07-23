import { describe, it, expect } from "vitest";
import { countItems, wouldWipeBasket } from "../../lib/backup-guard";

/** A basket shaped exactly like the prototype's, items keyed by profile id. */
const basket = (counts: number[]) => ({
  profiles: counts.map((_, i) => ({ id: `pr${i}`, name: `P${i}` })),
  current: "pr0",
  lists: {},
  settings: {},
  items: Object.fromEntries(
    counts.map((n, i) => [`pr${i}`, Array.from({ length: n }, (_, j) => ({ id: `it${i}_${j}`, name: "thing" }))]),
  ),
});

describe("countItems", () => {
  it("sums items across every profile", () => {
    expect(countItems(basket([9]))).toBe(9);
    expect(countItems(basket([3, 4, 2]))).toBe(9);
  });

  it("reads an empty basket as zero, not as a crash", () => {
    expect(countItems(basket([]))).toBe(0);
    expect(countItems(basket([0]))).toBe(0);
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, {}, [], "nope", 7, { items: null }, { items: [] }, { items: { a: "no" } }]) {
      expect(countItems(junk)).toBe(0);
    }
  });
});

describe("wouldWipeBasket", () => {
  it("blocks an empty basket replacing a populated one", () => {
    expect(wouldWipeBasket(basket([0]), basket([9]))).toBe(true);
    expect(wouldWipeBasket(basket([]), basket([1]))).toBe(true);
  });

  it("allows a first save when nothing is stored yet", () => {
    expect(wouldWipeBasket(basket([0]), null)).toBe(false);
    expect(wouldWipeBasket(basket([0]), basket([0]))).toBe(false);
  });

  it("allows every normal save, including shrinking a basket", () => {
    expect(wouldWipeBasket(basket([9]), basket([9]))).toBe(false);
    expect(wouldWipeBasket(basket([1]), basket([9]))).toBe(false); // deleting down to one is fine
    expect(wouldWipeBasket(basket([12]), basket([9]))).toBe(false);
  });

  it("never blocks when the stored copy is unreadable", () => {
    expect(wouldWipeBasket(basket([0]), "corrupt")).toBe(false);
  });
});
