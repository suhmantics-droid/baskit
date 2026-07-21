/**
 * E3-1 de-risking spike (docs/05, docs/09): fetch ~50 real product URLs
 * server-side (no JS) and measure what the extraction ladder can read:
 *   JSON-LD Product/Offer -> Open Graph -> microdata -> regex fallback
 * Reports coverage by method and by domain, plus bot-block detection.
 *
 * Run: npx tsx scripts/extract-spike.ts [urls.json]
 * Writes: docs/spike/E3-1-results.json + prints a summary table.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface Target {
  domain: string;
  url: string;
}

interface Result {
  domain: string;
  url: string;
  status: number | null;
  blocked: boolean;
  method: "jsonld" | "og" | "microdata" | "regex" | "none";
  price: number | null;
  currency: string | null;
  name: string | null;
  note: string;
  ms: number;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BLOCK_PATTERNS =
  /captcha|cf-browser-verification|cloudflare|akamai|access denied|pardon our interruption|are you a robot|unusual traffic|request blocked|attention required/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function parsePrice(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[^0-9.,]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
}

/** Walk any JSON-LD graph for a Product with an Offer price. */
function fromJsonLd(html: string): { price: number | null; currency: string | null; name: string | null } | null {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeEntities(m[1].trim()));
    } catch {
      continue;
    }
    const queue: unknown[] = [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      const type = obj["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((t) => typeof t === "string" && /product/i.test(t))) {
        const offersRaw = obj.offers;
        const offers = Array.isArray(offersRaw) ? offersRaw : offersRaw ? [offersRaw] : [];
        for (const oRaw of offers) {
          const o = (oRaw ?? {}) as Record<string, unknown>;
          const price =
            parsePrice(o.price) ??
            parsePrice(o.lowPrice) ??
            parsePrice((o.priceSpecification as Record<string, unknown> | undefined)?.price);
          if (price != null) {
            return {
              price,
              currency: typeof o.priceCurrency === "string" ? o.priceCurrency : null,
              name: typeof obj.name === "string" ? obj.name : null,
            };
          }
        }
        if (typeof obj.name === "string") {
          // Product without a readable offer still gives the name
          queue.push(...Object.values(obj));
          continue;
        }
      }
      queue.push(...Object.values(obj));
    }
  }
  return null;
}

function metaContent(html: string, patterns: string[]): string | null {
  for (const p of patterns) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${p}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${p}["']`,
      "i",
    );
    const m = html.match(re);
    if (m) return decodeEntities(m[1] ?? m[2]);
  }
  return null;
}

function fromOg(html: string): { price: number | null; currency: string | null; name: string | null } | null {
  const price = parsePrice(
    metaContent(html, ["product:price:amount", "og:price:amount", "twitter:data1", "price"]),
  );
  if (price == null) return null;
  return {
    price,
    currency: metaContent(html, ["product:price:currency", "og:price:currency"]),
    name: metaContent(html, ["og:title"]),
  };
}

function fromMicrodata(html: string): { price: number | null; currency: string | null; name: string | null } | null {
  const m =
    html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i);
  const price = parsePrice(m?.[1]);
  if (price == null) return null;
  const cur = html.match(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i);
  return { price, currency: cur?.[1] ?? null, name: null };
}

function fromRegex(html: string): { price: number | null; currency: string | null } | null {
  // last resort: a currency symbol near a price-looking token in the first 200KB
  const m = html.slice(0, 200_000).match(/[£€$]\s?(\d{1,4}(?:[.,]\d{2})?)/);
  const price = parsePrice(m?.[1]);
  if (price == null) return null;
  return { price, currency: m![0].startsWith("£") ? "GBP" : m![0].startsWith("€") ? "EUR" : "USD" };
}

async function probe(t: Target): Promise<Result> {
  const started = Date.now();
  const base: Omit<Result, "method" | "price" | "currency" | "name" | "note"> = {
    domain: t.domain,
    url: t.url,
    status: null,
    blocked: false,
    ms: 0,
  };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(t.url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });
    clearTimeout(timer);
    base.status = res.status;
    base.ms = Date.now() - started;
    const html = await res.text();
    const blocked = res.status === 403 || res.status === 429 || res.status === 503 || BLOCK_PATTERNS.test(html.slice(0, 30_000));
    base.blocked = blocked && res.status !== 200 ? true : blocked && !/application\/ld\+json/i.test(html) ? true : false;

    const j = fromJsonLd(html);
    if (j?.price != null) return { ...base, method: "jsonld", ...j, note: "" };
    const o = fromOg(html);
    if (o?.price != null) return { ...base, method: "og", ...o, note: "" };
    const md = fromMicrodata(html);
    if (md?.price != null) return { ...base, method: "microdata", ...md, note: "" };
    const rx = fromRegex(html);
    if (rx?.price != null && res.status === 200 && !base.blocked)
      return { ...base, method: "regex", ...rx, name: null, note: "low confidence" };
    return {
      ...base,
      method: "none",
      price: null,
      currency: null,
      name: null,
      note: base.blocked ? "blocked" : res.status !== 200 ? `http ${res.status}` : "no structured price (JS-rendered?)",
    };
  } catch (e) {
    return {
      ...base,
      ms: Date.now() - started,
      method: "none",
      price: null,
      currency: null,
      name: null,
      note: `fetch failed: ${(e as Error).name}`,
    };
  }
}

async function main() {
  const listPath = process.argv[2] ?? join(__dirname, "spike-urls.json");
  const targets: Target[] = JSON.parse(readFileSync(listPath, "utf8"));
  console.log(`probing ${targets.length} urls across ${new Set(targets.map((t) => t.domain)).size} domains…`);

  const results: Result[] = [];
  for (const t of targets) {
    const r = await probe(t);
    results.push(r);
    console.log(
      `${r.method.padEnd(9)} ${String(r.status ?? "ERR").padEnd(4)} ${r.blocked ? "BLOCKED " : "        "}${t.domain.padEnd(22)} ${r.price != null ? `${r.currency ?? "?"} ${r.price}` : r.note}`,
    );
    await new Promise((r2) => setTimeout(r2, 800)); // polite pacing
  }

  const by = (m: string) => results.filter((r) => r.method === m).length;
  const total = results.length;
  const summary = {
    total,
    jsonld: by("jsonld"),
    og: by("og"),
    microdata: by("microdata"),
    regex: by("regex"),
    none: by("none"),
    blocked: results.filter((r) => r.blocked).length,
    readablePct: Math.round(((total - by("none")) / total) * 100),
    confidentPct: Math.round(((by("jsonld") + by("og") + by("microdata")) / total) * 100),
  };
  console.log("\nSUMMARY", JSON.stringify(summary, null, 2));

  mkdirSync(join(__dirname, "..", "docs", "spike"), { recursive: true });
  writeFileSync(
    join(__dirname, "..", "docs", "spike", "E3-1-results.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), summary, results }, null, 2),
  );
  console.log("wrote docs/spike/E3-1-results.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
