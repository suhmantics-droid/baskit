/**
 * Overnight price checks for prototype baskets.
 *
 * The nightly cron sweeps `Item` rows. The prototype — which is the surface
 * people actually use — keeps its whole basket as one JSON blob in
 * `User.demoBackup`, so not a single saved item was ever visible to that sweep.
 * Prices only moved while someone had the page open, which is why the price
 * engine looked weak: it was switched off for everybody using it.
 *
 * These are the pure halves of the fix. The cron does the fetching; this file
 * decides what is due and folds a result back into the blob without disturbing
 * anything else in it.
 *
 * SHAPES DIFFER, deliberately. The Item model stores integer minor units and an
 * ISO code; the prototype stores a float in major units and a display symbol
 * ("£", not "GBP"), with history as `{t, p}`. Converting between them is this
 * module's job, and getting it wrong is exactly the class of bug that made
 * ₹6,000 read as £6,000 — see lib/fx.
 */
import type { ProtoDb, ProtoItem } from "./merge-basket";
import { toIso, toSymbol } from "./fx";

const HOUR = 3_600_000;
/** Same tiering the row sweep uses, so both surfaces behave identically. */
export const HOT_MS = 22 * HOUR; // target price set, or never checked
export const WARM_MS = 70 * HOUR; // ~3 days
export const SLOW_MS = 158 * HOUR; // ~weekly, for stores that block plain fetches

/** One prototype item worth fetching tonight. */
export interface BlobTarget {
  profileId: string;
  itemId: string;
  name: string;
  url: string;
  /** Latest known price in MAJOR units, in the item's own currency. */
  price: number | null;
  /** The item's currency exactly as stored, i.e. usually a symbol. */
  currency: string;
  targetPrice: number | null;
  lastChecked: number | null;
}

/** Latest price the prototype way: newest history point, else the flat field. */
export function protoLatestPrice(item: ProtoItem): number | null {
  const history = item.priceHistory;
  if (history && history.length > 0) {
    const last = history[history.length - 1];
    return typeof last?.p === "number" ? last.p : null;
  }
  const flat = (item as { price?: unknown }).price;
  return typeof flat === "number" ? flat : null;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** How long before this item is worth re-fetching. */
function staleAfter(target: BlobTarget, slowDomains: ReadonlySet<string>): number {
  if (slowDomains.has(host(target.url))) return SLOW_MS;
  if (target.targetPrice != null || target.lastChecked == null) return HOT_MS;
  return WARM_MS;
}

/**
 * Every item across every profile in the blob that has a link, is not bought or
 * let go, and is stale enough to be worth a fetch. Stalest first, so a capped
 * batch works through the whole basket over a few nights rather than starving
 * the tail.
 */
export function collectDue(
  blob: ProtoDb | null | undefined,
  now: number,
  slowDomains: ReadonlySet<string> = new Set(),
  limit = 8,
): BlobTarget[] {
  if (!blob || !blob.items) return [];
  const out: BlobTarget[] = [];

  for (const [profileId, list] of Object.entries(blob.items)) {
    for (const item of list ?? []) {
      const url = (item as { url?: unknown }).url;
      if (typeof url !== "string" || !url) continue;
      if ((item as { bought?: unknown }).bought) continue;
      if ((item as { letGo?: unknown }).letGo) continue;

      const targetPrice = (item as { targetPrice?: unknown }).targetPrice;
      out.push({
        profileId,
        itemId: item.id,
        name: String((item as { name?: unknown }).name ?? ""),
        url,
        price: protoLatestPrice(item),
        currency: String((item as { cur?: unknown }).cur ?? "£"),
        targetPrice: typeof targetPrice === "number" ? targetPrice : null,
        lastChecked: typeof item.lastChecked === "number" ? item.lastChecked : null,
      });
    }
  }

  return out
    .filter((t) => now - (t.lastChecked ?? 0) >= staleAfter(t, slowDomains))
    .sort((a, b) => (a.lastChecked ?? 0) - (b.lastChecked ?? 0))
    .slice(0, limit);
}

/** What a fetch produced, in the Item model's units, before folding it in. */
export interface BlobPriceResult {
  /** Minor units, as the extractor reports them. */
  priceMinor: number;
  /** ISO code, as the extractor reports it. */
  currency: string;
  /** "in" | "low" | "out" | "unknown", when the page said. */
  availability?: string | null;
  /** Where the price came from, for the history point. */
  method?: string;
}

export interface BlobApplyOutcome {
  blob: ProtoDb;
  /** False when the item vanished, or the price could not be trusted. */
  applied: boolean;
  /** True when the price actually moved. */
  changed: boolean;
  /** Previous price, major units, in the item's currency. */
  previous: number | null;
  /** New price, major units. */
  next: number | null;
  /** Set when we deliberately refused to write, so the caller can log it. */
  refused?: "missing" | "currency_mismatch";
}

/**
 * Fold a fetched price back into the blob, touching only that one item.
 *
 * Returns a new object rather than mutating, so a caller that re-reads the blob
 * immediately before writing cannot accidentally publish a stale copy of
 * somebody's whole basket.
 *
 * REFUSES on a currency mismatch. A US page returning $ for an item the user
 * saved in £ would otherwise silently overwrite the number and leave the symbol
 * alone, which is precisely how a total starts lying. Better to record the check
 * and leave the price untouched.
 */
export function applyBlobPrice(
  blob: ProtoDb,
  target: Pick<BlobTarget, "profileId" | "itemId" | "currency">,
  result: BlobPriceResult,
  now: number,
): BlobApplyOutcome {
  const list = blob.items?.[target.profileId];
  const index = list?.findIndex((i) => i.id === target.itemId) ?? -1;
  if (!list || index < 0) {
    return { blob, applied: false, changed: false, previous: null, next: null, refused: "missing" };
  }

  const item = list[index];
  const previous = protoLatestPrice(item);
  const stored = String((item as { cur?: unknown }).cur ?? target.currency);

  if (toIso(result.currency) !== toIso(stored)) {
    // Record that we looked, so it does not get retried every single night.
    const touched: ProtoItem = { ...item, lastChecked: now };
    return {
      blob: replaceItem(blob, target.profileId, index, touched),
      applied: false,
      changed: false,
      previous,
      next: null,
      refused: "currency_mismatch",
    };
  }

  const next = result.priceMinor / 100;
  const changed = previous == null || Math.abs(next - previous) >= 0.005;

  const updated: ProtoItem = {
    ...item,
    lastChecked: now,
    updated: now,
    cur: toSymbol(stored),
    price: next,
    ...(result.availability ? { stock: result.availability } : {}),
    priceHistory: changed
      ? [...(item.priceHistory ?? []), { t: now, p: next }]
      : (item.priceHistory ?? []),
  };

  return {
    blob: replaceItem(blob, target.profileId, index, updated),
    applied: true,
    changed,
    previous,
    next,
  };
}

/** Structural copy that swaps exactly one item and shares everything else. */
function replaceItem(blob: ProtoDb, profileId: string, index: number, item: ProtoItem): ProtoDb {
  const list = blob.items?.[profileId] ?? [];
  const nextList = [...list];
  nextList[index] = item;
  return { ...blob, items: { ...(blob.items ?? {}), [profileId]: nextList } };
}

/** A price fall worth waking somebody's phone for: real money, not rounding. */
export function isNotifiableDrop(
  previous: number | null,
  next: number | null,
  targetPrice: number | null,
): boolean {
  if (previous == null || next == null) return false;
  if (next >= previous) return false;
  if (targetPrice != null && next <= targetPrice) return true;
  const dropped = previous - next;
  return dropped >= 1 || dropped / previous >= 0.05;
}
