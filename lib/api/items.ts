/**
 * Zod contracts + serialization for the Items API (ticket E2-1, docs/03).
 *
 * MONEY crosses this API as integers in minor units (pence) — the client is
 * responsible for display formatting (lib/format.ts). Timestamps serialize as
 * ISO strings (Prisma Date -> JSON).
 */
import { z } from "zod";
import type { Item as DomainItem, PricePoint as DomainPricePoint } from "@/lib/types";

/** "" and undefined become null; otherwise the value must be a valid http(s) URL. */
const optionalUrl = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.url({ protocol: /^https?$/ }).max(2000).nullable(),
);

const optionalShortText = (max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(max).nullable());

/** Minor units: integer pennies, non-negative, sane ceiling (£1m). */
const minorUnits = z.number().int().min(0).max(100_000_000);

const nameField = z.string().trim().min(1, "name is required").max(300);
const currencyField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "ISO 4217 code, e.g. GBP");
const stockField = z.enum(["in", "low", "out", "unknown"]);
const statusField = z.enum(["want", "later", "research"]);
const priorityField = z.enum(["must", "nice", "impulse"]);
const tagsField = z.array(z.string().trim().min(1).max(40)).max(20);
const cooldownField = z.number().int().min(0).max(365);
/** List ids this item belongs to — every id must be owned by the caller. */
const listsField = z.array(z.string().min(1)).max(50);

export const itemCreateSchema = z.object({
  name: nameField,
  url: optionalUrl.default(null),
  imageUrl: optionalUrl.default(null),
  currency: currencyField.default("GBP"),
  price: minorUnits.nullable().default(null),
  targetPrice: minorUnits.nullable().default(null),
  stock: stockField.default("unknown"),
  category: optionalShortText(80).default(null),
  tags: tagsField.default([]),
  code: optionalShortText(60).default(null),
  status: statusField.default("want"),
  priority: priorityField.default("nice"),
  cooldownDays: cooldownField.default(0),
  notes: optionalShortText(2000).default(null),
  bought: z.boolean().default(false),
  fav: z.boolean().default(false),
  lists: listsField.default([]),
});

/**
 * PATCH body: every field optional and — crucially — NO defaults. (A .partial()
 * of the create schema still fires defaults in Zod, which would make
 * `PATCH {fav:true}` silently reset bought/lists/cooldown. Regression-tested.)
 */
export const itemUpdateSchema = z
  .object({
    name: nameField,
    url: optionalUrl,
    imageUrl: optionalUrl,
    currency: currencyField,
    price: minorUnits.nullable(),
    targetPrice: minorUnits.nullable(),
    stock: stockField,
    category: optionalShortText(80),
    tags: tagsField,
    code: optionalShortText(60),
    status: statusField,
    priority: priorityField,
    cooldownDays: cooldownField,
    notes: optionalShortText(2000),
    bought: z.boolean(),
    fav: z.boolean(),
    lists: listsField,
  })
  .partial();

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

export const itemListQuerySchema = z.object({
  /** Filter to items directly in this list id. */
  list: z.string().min(1).optional(),
  status: z.enum(["want", "later", "research"]).optional(),
  fav: z.enum(["1", "true"]).optional(),
  /** Case-insensitive contains over name/category/notes/code/tags. */
  q: z.string().trim().min(1).max(200).optional(),
});

/**
 * The prototype's cool-off rule (saveItem): when cooldownDays changes to a
 * positive number (or none was running), the clock restarts from `now`;
 * 0 clears it. Returns the new waitUntil (epoch ms) or null.
 */
export function resolveWaitUntil(
  nextCooldownDays: number,
  prevCooldownDays: number,
  prevWaitUntil: number | null,
  now: number,
): number | null {
  if (nextCooldownDays === 0) return null;
  if (nextCooldownDays !== prevCooldownDays || !prevWaitUntil) {
    return now + nextCooldownDays * 86_400_000;
  }
  return prevWaitUntil;
}

/** Prisma row (with joins) -> wire shape. Dates ISO, lists flattened to ids. */
export interface ItemRow {
  id: string;
  name: string;
  url: string | null;
  domain: string | null;
  imageUrl: string | null;
  currency: string;
  price: number | null;
  targetPrice: number | null;
  stock: string;
  category: string | null;
  tags: string[];
  code: string | null;
  status: string;
  priority: string;
  cooldownDays: number;
  waitUntil: Date | null;
  notes: string | null;
  bought: boolean;
  fav: boolean;
  lastCheckedAt: Date | null;
  createdAt: Date;
  lists: { listId: string }[];
  prices?: { price: number; checkedAt: Date; source: string }[];
}

export function serializeItem(row: ItemRow) {
  const { lists, prices, ...rest } = row;
  return {
    ...rest,
    lists: lists.map((l) => l.listId),
    ...(prices ? { prices: prices.map((p) => ({ price: p.price, checkedAt: p.checkedAt, source: p.source })) } : {}),
  };
}

/** Prisma row -> the pure-logic domain Item (epoch ms) for scoreItem(). */
export function toDomainItem(row: ItemRow): DomainItem {
  const prices: DomainPricePoint[] | undefined = row.prices?.map((p) => ({
    price: p.price,
    checkedAt: p.checkedAt.getTime(),
    source: p.source,
  }));
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    domain: row.domain,
    imageUrl: row.imageUrl,
    code: row.code,
    notes: row.notes,
    currency: row.currency,
    price: row.price,
    targetPrice: row.targetPrice,
    stock: row.stock as DomainItem["stock"],
    category: row.category,
    tags: row.tags,
    status: row.status as DomainItem["status"],
    priority: row.priority as DomainItem["priority"],
    cooldownDays: row.cooldownDays,
    waitUntil: row.waitUntil ? row.waitUntil.getTime() : null,
    bought: row.bought,
    fav: row.fav,
    createdAt: row.createdAt.getTime(),
    prices,
    lists: row.lists.map((l) => l.listId),
  };
}
