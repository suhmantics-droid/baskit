/**
 * Domain types for Baskit's pure logic (decision engine, budget roll-up, moments).
 *
 * These mirror the Prisma models in `docs/03-Data-Model.md` but are deliberately
 * decoupled from Prisma so the pure functions in `lib/` have no I/O and no ORM
 * dependency — they take plain objects and are trivially unit-testable.
 *
 * MONEY: every monetary value is an integer in **minor units** (e.g. pennies) plus
 * an ISO 4217 currency code (e.g. "GBP"). Never floats. (The prototype used floats;
 * this is the fix called for in CLAUDE.md and docs/04.)
 *
 * TIME: every timestamp is epoch milliseconds (a plain number). Pure functions that
 * depend on "now" take it as an explicit argument — they never call Date.now() — so
 * time-based behaviour is deterministic in tests (see docs/09).
 */

export type Stock = "in" | "low" | "out" | "unknown";
export type Status = "want" | "later" | "research";
export type Priority = "must" | "nice" | "impulse";

/** A single observed price for an item, in minor units. History is ascending by checkedAt. */
export interface PricePoint {
  /** Price in minor units. */
  price: number;
  /** Epoch milliseconds when this price was observed. */
  checkedAt: number;
  /** Where the price came from: "feed" | "jsonld" | "og" | "headless" | "manual". */
  source?: string;
}

/** A saved item. Money in minor units; timestamps in epoch ms. */
export interface Item {
  id: string;
  name: string;
  url?: string | null;
  /** Normalised host (e.g. "nike.com"), used for sale grouping and adapters. */
  domain?: string | null;
  imageUrl?: string | null;
  /** Discount code the user saved with the item. */
  code?: string | null;
  notes?: string | null;
  currency: string;
  /** Latest price, minor units (denormalised cache of the newest PricePoint). */
  price?: number | null;
  /** Target price, minor units. */
  targetPrice?: number | null;
  stock: Stock;
  category?: string | null;
  tags: string[];
  status: Status;
  priority: Priority;
  cooldownDays: number;
  /** Epoch ms when the cool-off ends; null when no cool-off is active. */
  waitUntil?: number | null;
  bought: boolean;
  /** Epoch ms when the item was marked bought; null when not bought. */
  boughtAt?: number | null;
  /** Marked as a favourite by the user. */
  fav: boolean;
  /** Epoch ms when the item was created. */
  createdAt: number;
  /** Price history, ascending by checkedAt. May be empty. */
  prices?: PricePoint[];
  /** IDs of the lists this item belongs to (many-to-many). */
  lists: string[];
}

/** A list node in the nesting tree. Money in minor units; dueDate in epoch ms. */
export interface List {
  id: string;
  name: string;
  emoji: string;
  parentId?: string | null;
  /** Spend cap, minor units. null = no cap. */
  cap?: number | null;
  /** Optional target date, epoch ms. */
  dueDate?: number | null;
}
