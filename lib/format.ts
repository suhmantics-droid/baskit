/**
 * Formatting + small time utilities. Pure and deterministic.
 *
 * Money is stored as integer minor units + an ISO currency code and only ever
 * turned into a display string here, at the edge. `formatMoney` mirrors the
 * prototype's `money()` look: a leading symbol, thousands grouping, and no
 * trailing ".00" on whole amounts (e.g. "£189", "£20.10", "£1,299").
 */

/** ISO 4217 code → display symbol. Falls back to "<code> " for unmapped currencies. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  INR: "₹",
  JPY: "¥",
};

/** Currencies with no minor unit (whole-number only), so 100 units != £1.00. */
const ZERO_DECIMAL: ReadonlySet<string> = new Set(["JPY"]);

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

/** Convert a user-entered major amount (e.g. 12.99) to integer minor units (1299). */
export function toMinorUnits(amount: number, currency = "GBP"): number {
  const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  return Math.round(amount * factor);
}

/** Convert integer minor units back to a major-unit number (1299 -> 12.99). */
export function fromMinorUnits(minor: number, currency = "GBP"): number {
  const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  return minor / factor;
}

/**
 * Format minor units + currency as a display string.
 * `null`/`undefined` render as an em-dash placeholder, matching the prototype.
 */
export function formatMoney(
  minor: number | null | undefined,
  currency = "GBP",
  locale = "en-GB",
): string {
  if (minor == null || Number.isNaN(minor)) return "–";
  const value = fromMinorUnits(minor, currency);
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  const num = value.toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  });
  return `${currencySymbol(currency)}${num}`;
}

/** Whole days from `then` to `now`, rounded up — ported from the prototype's daysBetween. */
export function daysBetween(a: number, b: number): number {
  return Math.ceil((a - b) / 86_400_000);
}

/** Human "ago" label for a past timestamp (ported from the prototype's agoText). */
export function ago(now: number, then: number): string {
  const d = Math.floor((now - then) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}
