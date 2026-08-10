/**
 * Server-side rate table, shared by /api/fx and anything that rolls up money.
 *
 * One in-memory cache per lambda instance, keyed by base currency. Upstream is
 * frankfurter (ECB) with open.er-api as fallback — both free and keyless, both
 * public reference data, so caching hard is safe and upstream sees a handful of
 * hits a day.
 */
import type { Rates } from "./fx";

const TTL = 12 * 60 * 60 * 1000;
const cache = new Map<string, { rates: Record<string, number>; at: number }>();

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Every rate quoted against `base`, or null when both upstreams fail. */
export async function fetchRateTable(base: string): Promise<Record<string, number> | null> {
  for (const url of [
    `https://api.frankfurter.app/latest?from=${base}`,
    `https://open.er-api.com/v6/latest/${base}`,
  ]) {
    const json = (await fetchJson(url)) as { rates?: Record<string, number> } | null;
    if (json?.rates && Object.keys(json.rates).length > 0) return json.rates;
  }
  return null;
}

/**
 * Cached rate table for `base`. Returns null when rates are genuinely unavailable
 * so callers stay honest rather than silently treating every currency as equal —
 * which is the bug this whole module exists to prevent.
 */
export async function getRates(base: string, now = Date.now()): Promise<Rates | null> {
  const key = base.toUpperCase();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return { base: key, rates: hit.rates, fetchedAt: hit.at };

  const rates = await fetchRateTable(key);
  if (!rates) {
    // Serve stale over wrong: an old table still converts far better than pretending
    // ₹6,000 and £6,000 are the same number.
    return hit ? { base: key, rates: hit.rates, fetchedAt: hit.at } : null;
  }
  cache.set(key, { rates, at: now });
  return { base: key, rates, fetchedAt: now };
}
