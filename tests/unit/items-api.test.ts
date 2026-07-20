import { describe, expect, it } from "vitest";
import {
  itemCreateSchema,
  itemUpdateSchema,
  itemListQuerySchema,
  resolveWaitUntil,
  serializeItem,
  toDomainItem,
  type ItemRow,
} from "@/lib/api/items";
import { domainOf } from "@/lib/url";

const DAY = 86_400_000;

describe("domainOf", () => {
  it("normalises host, strips www, lowercases", () => {
    expect(domainOf("https://www.JohnLewis.com/product/123?x=1")).toBe("johnlewis.com");
    expect(domainOf("http://shop.example.co.uk/a")).toBe("shop.example.co.uk");
  });
  it("returns null for missing or invalid urls", () => {
    expect(domainOf(null)).toBeNull();
    expect(domainOf("")).toBeNull();
    expect(domainOf("not a url")).toBeNull();
  });
});

describe("itemCreateSchema", () => {
  it("applies defaults and requires only a name", () => {
    const parsed = itemCreateSchema.parse({ name: "  Headphones  " });
    expect(parsed.name).toBe("Headphones");
    expect(parsed.currency).toBe("GBP");
    expect(parsed.status).toBe("want");
    expect(parsed.priority).toBe("nice");
    expect(parsed.stock).toBe("unknown");
    expect(parsed.cooldownDays).toBe(0);
    expect(parsed.price).toBeNull();
    expect(parsed.tags).toEqual([]);
    expect(parsed.lists).toEqual([]);
    expect(parsed.fav).toBe(false);
  });
  it("rejects a missing name, float prices and negative money", () => {
    expect(itemCreateSchema.safeParse({}).success).toBe(false);
    expect(itemCreateSchema.safeParse({ name: "x", price: 12.5 }).success).toBe(false);
    expect(itemCreateSchema.safeParse({ name: "x", targetPrice: -1 }).success).toBe(false);
  });
  it("normalises empty url to null and rejects non-http schemes", () => {
    expect(itemCreateSchema.parse({ name: "x", url: "" }).url).toBeNull();
    expect(itemCreateSchema.safeParse({ name: "x", url: "javascript:alert(1)" }).success).toBe(false);
    expect(itemCreateSchema.parse({ name: "x", url: "https://a.com/b" }).url).toBe("https://a.com/b");
  });
  it("uppercases currency and enforces ISO shape", () => {
    expect(itemCreateSchema.parse({ name: "x", currency: "gbp" }).currency).toBe("GBP");
    expect(itemCreateSchema.safeParse({ name: "x", currency: "pounds" }).success).toBe(false);
  });
});

describe("itemUpdateSchema", () => {
  it("accepts partial bodies and keeps unknown fields out", () => {
    const parsed = itemUpdateSchema.parse({ fav: true });
    expect(parsed).toEqual({ fav: true });
  });
});

describe("itemListQuerySchema", () => {
  it("parses supported filters and rejects junk status", () => {
    expect(itemListQuerySchema.parse({ status: "want", fav: "1", q: "scarf" })).toEqual({
      status: "want",
      fav: "1",
      q: "scarf",
    });
    expect(itemListQuerySchema.safeParse({ status: "bought" }).success).toBe(false);
  });
});

describe("resolveWaitUntil (prototype cool-off rule)", () => {
  const now = 1_800_000_000_000;
  it("starts the clock when a cool-off is set fresh", () => {
    expect(resolveWaitUntil(7, 0, null, now)).toBe(now + 7 * DAY);
  });
  it("restarts when the length changes", () => {
    expect(resolveWaitUntil(14, 7, now + 3 * DAY, now)).toBe(now + 14 * DAY);
  });
  it("keeps the running clock when unchanged", () => {
    expect(resolveWaitUntil(7, 7, now + 3 * DAY, now)).toBe(now + 3 * DAY);
  });
  it("clears on zero", () => {
    expect(resolveWaitUntil(0, 7, now + 3 * DAY, now)).toBeNull();
  });
});

function makeRow(): ItemRow {
  return {
    id: "it1",
    name: "Scarf",
    url: "https://shop.com/scarf",
    domain: "shop.com",
    imageUrl: null,
    currency: "GBP",
    price: 7500,
    targetPrice: null,
    stock: "in",
    category: "Fashion",
    tags: ["winter"],
    code: null,
    status: "want",
    priority: "nice",
    cooldownDays: 0,
    waitUntil: null,
    notes: null,
    bought: false,
    fav: true,
    lastCheckedAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    lists: [{ listId: "l1" }, { listId: "l2" }],
    prices: [
      { price: 8000, checkedAt: new Date("2026-07-01T00:00:00Z"), source: "manual" },
      { price: 7500, checkedAt: new Date("2026-07-05T00:00:00Z"), source: "manual" },
    ],
  };
}

describe("serializeItem", () => {
  it("flattens list joins to ids and keeps prices when loaded", () => {
    const wire = serializeItem(makeRow());
    expect(wire.lists).toEqual(["l1", "l2"]);
    expect(wire.prices).toHaveLength(2);
    expect(wire.price).toBe(7500);
  });
});

describe("toDomainItem", () => {
  it("converts Dates to epoch ms for the pure logic", () => {
    const item = toDomainItem(makeRow());
    expect(item.createdAt).toBe(Date.parse("2026-07-01T00:00:00Z"));
    expect(item.prices?.[0]).toEqual({
      price: 8000,
      checkedAt: Date.parse("2026-07-01T00:00:00Z"),
      source: "manual",
    });
    expect(item.lists).toEqual(["l1", "l2"]);
    expect(item.fav).toBe(true);
  });
});
