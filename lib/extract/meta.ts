/**
 * Meta-tag fallbacks: Open Graph product tags, microdata itemprops, and the
 * last-resort currency-symbol regex. The spike showed OG/microdata rescue
 * nothing JSON-LD misses on UK retail, but they are cheap and other shops
 * (small Shopify stores etc.) do use them — keep them in the ladder.
 */
import { decodeEntities, parsePrice } from "./jsonld";
import type { PartialExtract } from "./types";

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

export function fromOg(html: string): PartialExtract | null {
  const price = parsePrice(
    metaContent(html, ["product:price:amount", "og:price:amount", "twitter:data1", "price"]),
  );
  if (price == null) return null;
  return {
    price,
    currency: metaContent(html, ["product:price:currency", "og:price:currency"]),
    name: metaContent(html, ["og:title"]),
    imageUrl: metaContent(html, ["og:image"]),
  };
}

export function fromMicrodata(html: string): PartialExtract | null {
  const m =
    html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i);
  const price = parsePrice(m?.[1]);
  if (price == null) return null;
  const cur = html.match(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i);
  return { price, currency: cur?.[1] ?? null };
}

/** Currency symbol near a number in the first 200KB. Always low confidence. */
export function fromRegex(html: string): PartialExtract | null {
  const m = html.slice(0, 200_000).match(/[£€$]\s?(\d{1,4}(?:[.,]\d{2})?)/);
  const price = parsePrice(m?.[1]);
  if (price == null) return null;
  return {
    price,
    currency: m![0].startsWith("£") ? "GBP" : m![0].startsWith("€") ? "EUR" : "USD",
  };
}
