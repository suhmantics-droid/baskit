/**
 * Zod contracts + helpers for the Lists API (ticket E2-2, docs/03).
 * Money crosses as integer minor units; dates as ISO strings.
 */
import { z } from "zod";
import { descendantIds } from "@/lib/budget";
import type { Item as DomainItem, List as DomainList } from "@/lib/types";

const minorUnits = z.number().int().min(0).max(100_000_000);
const nameField = z.string().trim().min(1, "name is required").max(120);
const emojiField = z.string().trim().min(1).max(8);
/** ISO date (yyyy-mm-dd) or full ISO datetime. */
const dueField = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "invalid date")
    .nullable(),
);

export const listCreateSchema = z.object({
  name: nameField,
  emoji: emojiField.default("🗂"),
  parentId: z.string().min(1).nullable().default(null),
  cap: minorUnits.nullable().default(null),
  dueDate: dueField.default(null),
});

/** PATCH body — optional fields, deliberately default-free (see items schema note). */
export const listUpdateSchema = z
  .object({
    name: nameField,
    emoji: emojiField,
    parentId: z.string().min(1).nullable(),
    cap: minorUnits.nullable(),
    dueDate: dueField,
  })
  .partial();

export type ListCreateInput = z.infer<typeof listCreateSchema>;
export type ListUpdateInput = z.infer<typeof listUpdateSchema>;

/** Reparenting `listId` under `newParentId` must not create a cycle. */
export function wouldCreateCycle(
  lists: DomainList[],
  listId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false;
  if (newParentId === listId) return true;
  return descendantIds(lists, listId).includes(newParentId);
}

export interface ListRow {
  id: string;
  name: string;
  emoji: string;
  parentId: string | null;
  cap: number | null;
  dueDate: Date | null;
  createdAt: Date;
}

export function toDomainList(row: ListRow): DomainList {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    parentId: row.parentId,
    cap: row.cap,
    dueDate: row.dueDate ? row.dueDate.getTime() : null,
  };
}

/**
 * Minimal item shape the budget roll-up needs: latest price + list membership.
 * (latestPrice() falls back to `price` when no history is loaded.)
 */
export function toBudgetItem(row: {
  id: string;
  price: number | null;
  bought: boolean;
  lists: { listId: string }[];
}): DomainItem {
  return {
    id: row.id,
    name: "",
    currency: "GBP",
    price: row.price,
    stock: "unknown",
    tags: [],
    status: "want",
    priority: "nice",
    cooldownDays: 0,
    bought: row.bought,
    fav: false,
    createdAt: 0,
    lists: row.lists.map((l) => l.listId),
  };
}
