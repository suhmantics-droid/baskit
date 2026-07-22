/**
 * Extraction orchestrator (docs/05, tiering from docs/spike/E3-1-findings.md).
 * Ladder: JSON-LD → domain adapter → OG → microdata → symbol-regex (low conf).
 *
 * `extractFromHtml` is pure; `extractFromUrl` adds one polite fetch (honest UA,
 * 15s timeout, no retries — blocked hosts are a scheduling problem for the
 * headless lane, not something to hammer).
 */
import { domainOf } from "@/lib/url";
import { toMinorUnits } from "@/lib/format";
import { fromJsonLd } from "./jsonld";
import { fromOg, fromMicrodata, fromRegex } from "./meta";
import { ADAPTERS } from "./adapters";
import { fetchViaFirecrawl } from "./firecrawl";
import type { Extracted, ExtractOutcome, ExtractMethod, PartialExtract } from "./types";

export type { Extracted, ExtractOutcome } from "./types";
export { firecrawlConfigured } from "./firecrawl";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BLOCK_PATTERNS =
  /captcha|cf-browser-verification|cloudflare|akamai|access denied|pardon our interruption|are you a robot|unusual traffic|request blocked|attention required/i;

/** Spike decision #2: .uk shops omitting priceCurrency mean GBP, not "unknown". */
function defaultCurrency(url: string): string {
  const host = domainOf(url) ?? "";
  if (/\.uk$/.test(host)) return "GBP";
  if (/\.(de|fr|es|it|nl|ie|at|be)$/.test(host)) return "EUR";
  return "GBP"; // Baskit is UK-first; GBP is the safest default
}

function finish(p: PartialExtract, url: string, method: ExtractMethod): Extracted {
  const currency = p.currency ?? defaultCurrency(url);
  return {
    priceMinor: toMinorUnits(p.price, currency),
    currency,
    name: p.name ?? null,
    imageUrl: p.imageUrl ?? null,
    availability: p.availability ?? null,
    method,
    confidence: method === "regex" ? "low" : "high",
  };
}

/** Run the ladder over already-fetched HTML. Pure. */
export function extractFromHtml(html: string, url: string): Extracted | null {
  const j = fromJsonLd(html);
  if (j) return finish(j, url, "jsonld");

  const adapter = ADAPTERS[domainOf(url) ?? ""];
  if (adapter) {
    const a = adapter(html);
    if (a) return finish(a, url, "adapter");
  }

  const o = fromOg(html);
  if (o) return finish(o, url, "og");

  const md = fromMicrodata(html);
  if (md) return finish(md, url, "microdata");

  const rx = fromRegex(html);
  if (rx) return finish(rx, url, "regex");

  return null;
}

export function looksBlocked(status: number, html: string): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  // A 200 that serves a challenge page and no structured data (Boots pattern).
  return BLOCK_PATTERNS.test(html.slice(0, 30_000)) && !/application\/ld\+json/i.test(html);
}

/**
 * One polite fetch + the ladder. Never throws on bad pages.
 *
 * `timeoutMs` defaults to 8s because a person is usually waiting: some stores
 * (John Lewis, ASOS) don't refuse datacentre traffic, they just never answer,
 * and a 15s spinner ending in nothing is worse than a quick honest miss. The
 * nightly sweep passes a longer budget — nobody is watching it.
 */
export async function extractFromUrl(url: string, timeoutMs = 8_000): Promise<ExtractOutcome> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });
    clearTimeout(timer);
    const html = await res.text();
    const blocked = looksBlocked(res.status, html);
    const extracted = blocked || res.status !== 200 ? null : extractFromHtml(html, url);
    // A regex hit on a blocked/challenge page would be noise, so blocked wins.
    return {
      ok: extracted != null,
      status: res.status,
      blocked,
      extracted,
      note: extracted
        ? null
        : blocked
          ? "blocked"
          : res.status !== 200
            ? `http ${res.status}`
            : "no readable price (JS-rendered?)",
      slow: false,
    };
  } catch (e) {
    const timedOut = (e as Error).name === "AbortError";
    return {
      ok: false,
      status: null,
      blocked: false,
      extracted: null,
      note: timedOut ? "store did not respond in time" : `fetch failed: ${(e as Error).name}`,
      slow: timedOut,
    };
  }
}

/**
 * Plain fetch first; if the store blocked it or stalled, escalate to the
 * Firecrawl stealth path (residential proxies) and run the same free parser
 * over the returned HTML. Only blocked/slow outcomes escalate, so the 6/10
 * retailers that already succeed never spend a credit. With no FIRECRAWL_API_KEY
 * the escalation is a no-op and the honest first result stands.
 */
export async function extractWithFallback(
  url: string,
  plainTimeoutMs = 8_000,
): Promise<ExtractOutcome> {
  const first = await extractFromUrl(url, plainTimeoutMs);
  if (first.ok) return first;

  // Escalate to stealth when the plain fetch reached the site but couldn't read
  // a price: blocked (Argos/Currys), stalled (John Lewis), or a 200 that came
  // back JS-rendered with no price in the HTML (Boots). A hard 404/410 or a
  // network error means stealth won't help, so don't spend a credit on it.
  const worthStealth = first.blocked || first.slow || first.status === 200;
  if (!worthStealth) return first;

  const html = await fetchViaFirecrawl(url);
  if (!html) return first; // no key, or the stealth scrape also failed
  const extracted = extractFromHtml(html, url);
  if (!extracted) return { ...first, note: "stealth fetched but no readable price" };
  return { ok: true, status: 200, blocked: false, slow: false, extracted, note: "via stealth" };
}
