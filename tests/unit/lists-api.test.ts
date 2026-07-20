import { describe, expect, it } from "vitest";
import {
  listCreateSchema,
  listUpdateSchema,
  wouldCreateCycle,
  toBudgetItem,
  toDomainList,
} from "@/lib/api/lists";
import { listSpent, capState } from "@/lib/budget";
import type { List } from "@/lib/types";

describe("listCreateSchema", () => {
  it("defaults emoji/parent/cap and requires a name", () => {
    const parsed = listCreateSchema.parse({ name: " Christmas gifts " });
    expect(parsed).toEqual({
      name: "Christmas gifts",
      emoji: "🗂",
      parentId: null,
      cap: null,
      dueDate: null,
    });
    expect(listCreateSchema.safeParse({}).success).toBe(false);
  });
  it("accepts a cap in minor units and rejects floats", () => {
    expect(listCreateSchema.parse({ name: "x", cap: 50_000 }).cap).toBe(50_000);
    expect(listCreateSchema.safeParse({ name: "x", cap: 500.5 }).success).toBe(false);
  });
  it("normalises empty dueDate to null and rejects junk dates", () => {
    expect(listCreateSchema.parse({ name: "x", dueDate: "" }).dueDate).toBeNull();
    expect(listCreateSchema.parse({ name: "x", dueDate: "2026-12-25" }).dueDate).toBe("2026-12-25");
    expect(listCreateSchema.safeParse({ name: "x", dueDate: "not-a-date" }).success).toBe(false);
  });
});

describe("listUpdateSchema", () => {
  it("is default-free: a cap-only patch touches nothing else", () => {
    expect(listUpdateSchema.parse({ cap: 12_000 })).toEqual({ cap: 12_000 });
  });
});

describe("wouldCreateCycle", () => {
  const lists: List[] = [
    { id: "a", name: "A", emoji: "", parentId: null },
    { id: "b", name: "B", emoji: "", parentId: "a" },
    { id: "c", name: "C", emoji: "", parentId: "b" },
    { id: "x", name: "X", emoji: "", parentId: null },
  ];
  it("blocks self-parenting and descendants", () => {
    expect(wouldCreateCycle(lists, "a", "a")).toBe(true);
    expect(wouldCreateCycle(lists, "a", "b")).toBe(true);
    expect(wouldCreateCycle(lists, "a", "c")).toBe(true);
  });
  it("allows legitimate reparenting", () => {
    expect(wouldCreateCycle(lists, "b", "x")).toBe(false);
    expect(wouldCreateCycle(lists, "a", null)).toBe(false);
    expect(wouldCreateCycle(lists, "c", "a")).toBe(false);
  });
});

describe("tree roll-up with API mappers", () => {
  it("computes subtree spend + capState from mapped rows", () => {
    const listRows = [
      { id: "root", name: "Xmas", emoji: "🎄", parentId: null, cap: 20_000, dueDate: null, createdAt: new Date() },
      { id: "mum", name: "Mum", emoji: "💝", parentId: "root", cap: null, dueDate: null, createdAt: new Date() },
    ];
    const itemRows = [
      { id: "i1", price: 15_000, bought: false, lists: [{ listId: "mum" }] },
      { id: "i2", price: 9_000, bought: false, lists: [{ listId: "root" }] },
      { id: "i3", price: 999_999, bought: false, lists: [] }, // unfiled: never counted
    ];
    const lists = listRows.map(toDomainList);
    const items = itemRows.map(toBudgetItem);
    const spent = listSpent(lists, items, "root");
    expect(spent).toBe(24_000); // child spend rolls up
    expect(capState(spent, 20_000)).toBe("over");
    expect(listSpent(lists, items, "mum")).toBe(15_000);
  });
});
