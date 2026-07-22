/**
 * Firecrawl stealth fallback — the residential-proxy path for retailers that
 * block plain server fetches (Argos, Currys, John Lewis = datacentre-IP blocks;
 * Boots = JS challenge). Verified 4/4 on those during the E3-3 spike
 * (docs/spike/E3-3-scraper-research.md).
 *
 * Returns raw HTML fetched through residential proxies; the caller runs our own
 * free `lib/extract` parser over it (no Firecrawl LLM credits). Opt-in: with no
 * FIRECRAWL_API_KEY set it returns null and callers keep their blocked/manual
 * behaviour, so nothing changes until the key exists.
 *
 * Cost: stealth is ~5 credits/scrape and is only ever called AFTER a plain
 * fetch is blocked/slow — the 6/10 retailers that already work stay free.
 */
const ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

export function firecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

/** Scrape a URL's raw HTML via Firecrawl stealth (GB). null = no key or failure. */
export async function fetchViaFirecrawl(url: string, timeoutMs = 25_000): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["rawHtml"],
        proxy: "stealth",
        location: { country: "GB" },
        waitFor: 3500,
        onlyMainContent: false,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { rawHtml?: string; html?: string } };
    return j?.data?.rawHtml ?? j?.data?.html ?? null;
  } catch {
    return null;
  }
}
