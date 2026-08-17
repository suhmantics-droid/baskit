/**
 * Currency conversion for totals.
 *
 * Items keep the currency they were saved in — that is what the user will
 * actually pay, and overwriting it would destroy information. Only *aggregates*
 * (basket total, list caps, spend map, "you did not spend") are expressed in the
 * user's base currency, and they get there through here.
 *
 * The bug this exists to kill: every roll-up used to sum raw minor units across
 * mixed currencies, so an item saved at ₹6,000 added 6000 to the pot and came
 * back out labelled £6,000. See lib/budget.ts and the prototype's stats row.
 *
 * Rates come from /api/fx (ECB via frankfurter, open.er-api as fallback) and are
 * cached on the profile with a timestamp, so a session does one lookup and works
 * offline on yesterday's numbers. Pure functions only — no I/O, no Date.now().
 */
import type { Item } from "./types";
import { fromMinorUnits, toMinorUnits } from "./format";

/**
 * The prototype stores the currency as a display symbol rather than a code
 * (its <select> is a list of "£ $ € ₹ ¥"), so anything crossing into rate
 * lookups has to be normalised first. "£" is not a currency, "GBP" is.
 */
const SYMBOL_TO_ISO: Record<string, string> = {
  "£": "GBP",
  $: "USD",
  "€": "EUR",
  "₹": "INR",
  "¥": "JPY",
};

/** Normalise a symbol or code to an ISO 4217 code. Unknown input is returned upper-cased. */
export function toIso(currency: string | null | undefined): string {
  if (!currency) return "GBP";
  const trimmed = currency.trim();
  return SYMBOL_TO_ISO[trimmed] ?? trimmed.toUpperCase();
}

const ISO_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_TO_ISO).map(([symbol, code]) => [code, symbol]),
);

/** The display symbol for a code, for writing back into prototype-shaped data. */
export function toSymbol(currency: string | null | undefined): string {
  const code = toIso(currency);
  return ISO_TO_SYMBOL[code] ?? code;
}

/** A base currency plus its rates to every other currency, as fetched. */
export interface Rates {
  /** ISO code the rates are quoted against. */
  base: string;
  /** ISO code → units of that currency per 1 unit of `base`. */
  rates: Record<string, number>;
  /** Epoch ms the table was fetched. Callers decide staleness; this file never reads the clock. */
  fetchedAt: number;
}

/** Milliseconds after which a rates table should be refreshed. */
export const RATES_TTL = 24 * 60 * 60 * 1000;

/** True when `rates` is missing, malformed, or older than the TTL at `now`. */
export function ratesStale(rates: Rates | null | undefined, now: number): boolean {
  if (!rates || !rates.base || !rates.rates) return true;
  return now - rates.fetchedAt >= RATES_TTL;
}

/**
 * Units of `to` per 1 unit of `from`, derived from a table quoted against any base.
 * Returns null when either leg is missing, so callers can be honest rather than guess.
 */
export function rateBetween(from: string, to: string, rates: Rates | null | undefined): number | null {
  const a = toIso(from);
  const b = toIso(to);
  if (a === b) return 1;
  if (!rates) return null;

  const base = toIso(rates.base);
  const perBase = (code: string): number | null => {
    if (code === base) return 1;
    const r = rates.rates[code];
    return typeof r === "number" && r > 0 && Number.isFinite(r) ? r : null;
  };

  const fromPerBase = perBase(a);
  const toPerBase = perBase(b);
  if (fromPerBase == null || toPerBase == null) return null;
  return toPerBase / fromPerBase;
}

/**
 * Convert minor units between currencies.
 *
 * Goes via major units deliberately: JPY has no minor unit, so 1000 JPY is 1000
 * minor while £10 is 1000 minor. Multiplying minor units directly would be wrong
 * by a factor of 100 on every zero-decimal pair.
 */
export function convertMinor(
  minor: number | null | undefined,
  from: string,
  to: string,
  rates: Rates | null | undefined,
): number | null {
  if (minor == null || Number.isNaN(minor)) return null;
  const a = toIso(from);
  const b = toIso(to);
  if (a === b) return minor;
  const rate = rateBetween(a, b, rates);
  if (rate == null) return null;
  return toMinorUnits(fromMinorUnits(minor, a) * rate, b);
}

/** A subtotal in a currency that could not be converted to the base. */
export interface UnconvertedBucket {
  currency: string;
  /** Minor units, in that currency. */
  total: number;
}

/** A total that is honest about what it could not convert. */
export interface BaseTotal {
  /** Minor units in the base currency. Includes only amounts that converted. */
  total: number;
  /** Per-currency subtotals that had no usable rate, so nothing is silently dropped. */
  unconverted: UnconvertedBucket[];
  /** True when every contributing amount reached the base currency. */
  complete: boolean;
}

/** Sum mixed-currency amounts into `base`, reporting anything that would not convert. */
export function sumInBase(
  entries: ReadonlyArray<{ minor: number | null | undefined; currency: string }>,
  base: string,
  rates: Rates | null | undefined,
): BaseTotal {
  const target = toIso(base);
  let total = 0;
  const stuck = new Map<string, number>();

  for (const entry of entries) {
    if (entry.minor == null || Number.isNaN(entry.minor)) continue;
    const code = toIso(entry.currency);
    const converted = convertMinor(entry.minor, code, target, rates);
    if (converted == null) {
      stuck.set(code, (stuck.get(code) ?? 0) + entry.minor);
    } else {
      total += converted;
    }
  }

  const unconverted = [...stuck.entries()]
    .map(([currency, sub]) => ({ currency, total: sub }))
    .sort((x, y) => y.total - x.total);
  return { total, unconverted, complete: unconverted.length === 0 };
}

/**
 * Restate items in the base currency so the existing roll-ups in lib/budget.ts
 * keep working unchanged — they sum `latestPrice`, and this makes every price
 * they see comparable.
 *
 * Items whose currency has no rate are left out rather than counted wrong; their
 * currencies come back in `unconverted` so the UI can show them alongside instead
 * of pretending the total is whole.
 */
export function itemsInBase(
  items: readonly Item[],
  base: string,
  rates: Rates | null | undefined,
): { items: Item[]; unconverted: string[] } {
  const target = toIso(base);
  const converted: Item[] = [];
  const stuck = new Set<string>();

  for (const item of items) {
    const code = toIso(item.currency);
    if (code === target) {
      converted.push(item);
      continue;
    }
    const rate = rateBetween(code, target, rates);
    if (rate == null) {
      stuck.add(code);
      continue;
    }
    converted.push({
      ...item,
      currency: target,
      price: convertMinor(item.price, code, target, rates),
      targetPrice: convertMinor(item.targetPrice, code, target, rates),
      prices: item.prices?.map((p) => ({
        ...p,
        price: convertMinor(p.price, code, target, rates) ?? 0,
      })),
    });
  }

  return { items: converted, unconverted: [...stuck].sort() };
}
