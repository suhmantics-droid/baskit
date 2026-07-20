import { describe, it, expect } from "vitest";
import {
  childrenOf,
  descendantIds,
  subtreeIds,
  itemsInSubtree,
  listSpent,
  listBought,
  capState,
  allocation,
  allocationBar,
  childCapsAllocated,
} from "../../lib/budget";
import { makeItem, makeList } from "./fixtures";
import type { Item, List } from "../../lib/types";

// Christmas → Mum / Dad / Kids, mirroring the prototype's sample tree.
const lists: List[] = [
  makeList({ id: "xmas", name: "Christmas", parentId: null, cap: 50000 }),
  makeList({ id: "mum", name: "Mum", parentId: "xmas", cap: 15000 }),
  makeList({ id: "dad", name: "Dad", parentId: "xmas", cap: 15000 }),
  makeList({ id: "kids", name: "Kids", parentId: "xmas", cap: 20000 }),
];

const items: Item[] = [
  makeItem({ id: "i_mum", price: 12000, lists: ["mum"] }),
  makeItem({ id: "i_dad", price: 10000, lists: ["dad"] }),
  makeItem({ id: "i_kids", price: 8000, lists: ["kids"], bought: true }),
  makeItem({ id: "i_shared", price: 5000, lists: ["mum", "dad"] }), // in two sub-lists
  makeItem({ id: "i_direct", price: 3000, lists: ["xmas"] }), // directly in the parent
];

describe("tree traversal", () => {
  it("finds direct children and all descendants", () => {
    expect(childrenOf(lists, "xmas").map((l) => l.id)).toEqual(["mum", "dad", "kids"]);
    expect(descendantIds(lists, "xmas").sort()).toEqual(["dad", "kids", "mum"]);
    expect(subtreeIds(lists, "xmas").sort()).toEqual(["dad", "kids", "mum", "xmas"]);
    expect(childrenOf(lists, "mum")).toHaveLength(0);
  });
});

describe("listSpent — dedupe", () => {
  it("counts an item that sits in two sub-lists exactly once at the parent", () => {
    // i_shared (5000) is in both Mum and Dad; naive summing would double it.
    expect(itemsInSubtree(lists, items, "xmas")).toHaveLength(5);
    expect(listSpent(lists, items, "xmas")).toBe(12000 + 10000 + 8000 + 5000 + 3000); // 38000
  });

  it("still counts the shared item in each sub-list it belongs to", () => {
    expect(listSpent(lists, items, "mum")).toBe(12000 + 5000); // 17000
    expect(listSpent(lists, items, "dad")).toBe(10000 + 5000); // 15000
    expect(listSpent(lists, items, "kids")).toBe(8000);
  });

  it("listBought sums only bought items", () => {
    expect(listBought(lists, items, "xmas")).toBe(8000); // only i_kids
    expect(listBought(lists, items, "kids")).toBe(8000);
    expect(listBought(lists, items, "mum")).toBe(0);
  });
});

describe("capState thresholds", () => {
  it("no cap → none", () => {
    expect(capState(5000, 0)).toBe("none");
    expect(capState(5000, null)).toBe("none");
    expect(capState(5000, undefined)).toBe("none");
  });

  it("0.89 → ok, 0.9 → warn, 1.01 → over", () => {
    expect(capState(8900, 10000)).toBe("ok");
    expect(capState(9000, 10000)).toBe("warn");
    expect(capState(10100, 10000)).toBe("over");
    expect(capState(10000, 10000)).toBe("warn"); // exactly at cap is not yet over
  });
});

describe("allocation attribution", () => {
  it("places each item in exactly one bucket and reconciles to listSpent", () => {
    const segs = allocation(lists, items, "xmas");
    // Shared item lands in Mum (first matching child), not Dad.
    const mum = segs.find((s) => s.listId === "mum");
    const dad = segs.find((s) => s.listId === "dad");
    const direct = segs.find((s) => s.name === "Items here");
    expect(mum?.value).toBe(17000); // 12000 + 5000
    expect(dad?.value).toBe(10000);
    expect(direct?.value).toBe(3000);

    const total = segs.reduce((s, x) => s + x.value, 0);
    expect(total).toBe(listSpent(lists, items, "xmas"));
  });

  it("omits empty child buckets", () => {
    const empty = allocation([makeList({ id: "solo", cap: 1000 })], [], "solo");
    expect(empty).toEqual([]);
  });
});

describe("allocationBar geometry", () => {
  it("scales to max(cap, total) and marks the cap when the bar overflows", () => {
    const bar = allocationBar(lists, items, "mum", 15000);
    expect(bar.total).toBe(17000);
    expect(bar.scale).toBe(17000); // total exceeds cap
    expect(bar.capMarkerRatio).toBeCloseTo(15000 / 17000, 5);
  });

  it("hides the cap marker when spend is within cap", () => {
    const bar = allocationBar(lists, items, "xmas", 50000);
    expect(bar.scale).toBe(50000);
    expect(bar.capMarkerRatio).toBeNull(); // cap == scale, marker sits at the end
  });
});

describe("childCapsAllocated", () => {
  it("sums direct children caps", () => {
    expect(childCapsAllocated(lists, "xmas")).toBe(50000);
    expect(childCapsAllocated(lists, "mum")).toBe(0);
  });
});
