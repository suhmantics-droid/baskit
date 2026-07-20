/** Shared test fixtures for the pure-logic unit tests. All money in minor units. */
import type { Item, List, PricePoint } from "../../lib/types";

/** A fixed "now" (mirrors the prototype's timeBase) so time-based cases are deterministic. */
export const NOW = 1_752_000_000_000;
export const DAY = 86_400_000;

/** Build an Item with neutral defaults; override only what a test cares about. */
export function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "it1",
    name: "Thing",
    url: null,
    domain: null,
    currency: "GBP",
    price: null,
    targetPrice: null,
    stock: "unknown",
    category: null,
    tags: [],
    status: "want",
    priority: "nice",
    cooldownDays: 0,
    waitUntil: null,
    bought: false,
    fav: false,
    createdAt: NOW,
    prices: [],
    lists: [],
    ...overrides,
  };
}

/** Build a List with neutral defaults. */
export function makeList(overrides: Partial<List> = {}): List {
  return {
    id: "l1",
    name: "List",
    emoji: "🗂",
    parentId: null,
    cap: null,
    dueDate: null,
    ...overrides,
  };
}

/** Build a price history from minor-unit values, one day apart, ending at NOW. */
export function history(...values: number[]): PricePoint[] {
  return values.map((price, i) => ({ price, checkedAt: NOW - (values.length - 1 - i) * DAY }));
}
