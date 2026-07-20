/**
 * Budget roll-up — nested spend caps that aggregate through the list subtree.
 *
 * Ported verbatim from the prototype (basket-prototype.html, lines 522-654) and
 * specified in docs/04-Decision-Engine.md §2. Pure functions, no I/O.
 *
 * Lists form a tree via `parentId`. Items belong to many lists (many-to-many).
 * Every item in a subtree is counted **once**, even if it sits in two sub-lists.
 * All money is minor units.
 */
import type { Item, List } from "./types";
import { latestPrice } from "./items";

export type CapState = "none" | "ok" | "warn" | "over";

/** One coloured segment of a list's allocation breakdown. */
export interface AllocationSegment {
  /** The child list this segment represents; absent for the "Items here" direct bucket. */
  listId?: string;
  name: string;
  /** Summed latest price of the items attributed to this segment, minor units. */
  value: number;
}

/** Geometry for rendering the allocation bar (see docs/04 §2). */
export interface AllocationBar {
  segments: AllocationSegment[];
  /** Total attributed spend, minor units. */
  total: number;
  /** Bar scale = max(cap, total), minor units. */
  scale: number;
  /** Where to draw the cap marker as a 0-1 ratio of the bar, or null when off-scale/no cap. */
  capMarkerRatio: number | null;
}

/** Direct children of a list, in array order. */
export function childrenOf(lists: List[], id: string): List[] {
  return lists.filter((l) => l.parentId === id);
}

/** All descendant list IDs (depth-first). */
export function descendantIds(lists: List[], id: string): string[] {
  let out: string[] = [];
  for (const child of childrenOf(lists, id)) {
    out.push(child.id);
    out = out.concat(descendantIds(lists, child.id));
  }
  return out;
}

/** The list itself plus all descendants. */
export function subtreeIds(lists: List[], id: string): string[] {
  return [id, ...descendantIds(lists, id)];
}

/** Unique items whose list membership intersects the subtree (each item at most once). */
export function itemsInSubtree(lists: List[], items: Item[], id: string): Item[] {
  const inSubtree = new Set(subtreeIds(lists, id));
  return items.filter((it) => (it.lists || []).some((listId) => inSubtree.has(listId)));
}

/** Σ latest price over the subtree's unique items, minor units. */
export function listSpent(lists: List[], items: Item[], id: string): number {
  return itemsInSubtree(lists, items, id).reduce((sum, it) => sum + (latestPrice(it) ?? 0), 0);
}

/** Σ latest price over the subtree's unique items that are marked bought, minor units. */
export function listBought(lists: List[], items: Item[], id: string): number {
  return itemsInSubtree(lists, items, id)
    .filter((it) => it.bought)
    .reduce((sum, it) => sum + (latestPrice(it) ?? 0), 0);
}

/** Traffic-light state for spend against a cap. No cap (null/0) → "none". */
export function capState(spent: number, cap: number | null | undefined): CapState {
  if (!cap) return "none";
  const ratio = spent / cap;
  if (ratio > 1) return "over";
  if (ratio >= 0.9) return "warn";
  return "ok";
}

/**
 * Allocation attribution: assign each unique item in the subtree to exactly one
 * bucket — the first direct child whose subtree contains it, else the list's own
 * "Items here" direct bucket — so nothing double-counts. Returns non-empty segments
 * in child order, with the direct bucket last.
 */
export function allocation(lists: List[], items: Item[], id: string): AllocationSegment[] {
  const kids = childrenOf(lists, id);
  const buckets = kids.map((c) => ({
    listId: c.id,
    name: c.name,
    ids: new Set(subtreeIds(lists, c.id)),
    value: 0,
  }));
  let directValue = 0;

  for (const item of itemsInSubtree(lists, items, id)) {
    const price = latestPrice(item) ?? 0;
    let placed = false;
    for (const bucket of buckets) {
      if ((item.lists || []).some((listId) => bucket.ids.has(listId))) {
        bucket.value += price;
        placed = true;
        break;
      }
    }
    if (!placed) directValue += price;
  }

  const segments: AllocationSegment[] = buckets
    .filter((b) => b.value > 0)
    .map((b) => ({ listId: b.listId, name: b.name, value: b.value }));
  if (directValue > 0) segments.push({ name: "Items here", value: directValue });
  return segments;
}

/** Allocation segments plus bar geometry (scale + cap marker), per docs/04 §2. */
export function allocationBar(
  lists: List[],
  items: Item[],
  id: string,
  cap: number | null | undefined,
): AllocationBar {
  const segments = allocation(lists, items, id);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const scale = Math.max(cap ?? 0, total) || 1;
  let capMarkerRatio: number | null = null;
  if (cap && cap <= scale) {
    const ratio = cap / scale;
    if (ratio < 1) capMarkerRatio = ratio;
  }
  return { segments, total, scale, capMarkerRatio };
}

/** Σ of direct children caps — how much of this list's cap is allocated to sub-lists. */
export function childCapsAllocated(lists: List[], id: string): number {
  return childrenOf(lists, id).reduce((sum, c) => sum + (c.cap ?? 0), 0);
}
