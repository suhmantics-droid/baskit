/**
 * JSON-LD Product/Offer parser — the workhorse: it alone covered 53% of the
 * spiked UK retail URLs (docs/spike/E3-1-findings.md), and nothing OG or
 * microdata could read fell outside it. Walks every ld+json script, any graph
 * shape, for a Product whose offer carries a price.
 */
import type { PartialExtract } from "./types";

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/** Parse a price-ish value ("£1,299.00", "59.4", 24) into a major-unit number. */
export function parsePrice(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[^0-9.,]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
}

function availabilityOf(v: unknown): "in" | "out" | null {
  if (typeof v !== "string") return null;
  if (/InStock|InStoreOnly|LimitedAvailability|PreOrder/i.test(v)) return "in";
  if (/OutOfStock|SoldOut|Discontinued/i.test(v)) return "out";
  return null;
}

function firstString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  // schema.org ImageObject
  if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") {
    return (v as { url: string }).url;
  }
  return null;
}

export function fromJsonLd(html: string): PartialExtract | null {
  const scripts = [
    ...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
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
              name: typeof obj.name === "string" ? decodeEntities(obj.name) : null,
              imageUrl: firstString(obj.image),
              availability: availabilityOf(o.availability),
            };
          }
        }
      }
      queue.push(...Object.values(obj));
    }
  }
  return null;
}
