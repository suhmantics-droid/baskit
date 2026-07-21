/**
 * Per-domain adapters — Tier B from the spike: pages that fetch fine (HTTP 200)
 * but never emit JSON-LD, so a purpose-built reader unlocks them.
 *   amazon: price lives in <span class="a-offscreen">£…</span> inside the buy box.
 *   asos:   JS app, but the price leaks into embedded JSON state.
 * Keyed by normalised domain (no "www.", lowercased — see lib/url domainOf).
 */
import { decodeEntities, parsePrice } from "./jsonld";
import type { PartialExtract } from "./types";

type Adapter = (html: string) => PartialExtract | null;

function currencyFromSymbol(sym: string): string {
  return sym === "£" ? "GBP" : sym === "€" ? "EUR" : "USD";
}

const amazon: Adapter = (html) => {
  // The first a-offscreen inside an a-price span is the live buy-box price.
  const m =
    html.match(/class="a-price[^"]*"[^>]*>\s*<span[^>]*class="a-offscreen"[^>]*>\s*([£€$])\s?([\d,]+(?:\.\d{2})?)/i) ??
    html.match(/class="a-offscreen"[^>]*>\s*([£€$])\s?([\d,]+(?:\.\d{2})?)/i);
  const price = parsePrice(m?.[2]);
  if (price == null) return null;
  const title = html.match(/id="productTitle"[^>]*>\s*([^<]+?)\s*</i);
  const img =
    html.match(/id="landingImage"[^>]*src="([^"]+)"/i)?.[1] ??
    html.match(/data-old-hires="(https:[^"]+)"/i)?.[1] ??
    html.match(/data-a-dynamic-image="[^"]*?(https:[^"&\\]+)/i)?.[1] ??
    null;
  return {
    price,
    currency: currencyFromSymbol(m![1]),
    name: title ? decodeEntities(title[1].trim()) : null,
    imageUrl: img,
  };
};

const asos: Adapter = (html) => {
  // Embedded state carries {"price":{"current":{"value":59.4,...}}}
  const m = html.match(/"price"\s*:\s*\{\s*"current"\s*:\s*\{\s*(?:"text"\s*:\s*"[^"]*"\s*,\s*)?"value"\s*:\s*([\d.]+)/i);
  const price = parsePrice(m?.[1]);
  if (price == null) return null;
  // og:title/og:image directly — fromOg is price-gated so unusable for names alone
  const name = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const img = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  return {
    price,
    currency: /"currency"\s*:\s*"([A-Z]{3})"/.exec(html)?.[1] ?? "GBP",
    name: name ? decodeEntities(name[1]) : null,
    imageUrl: img?.[1] ?? null,
  };
};

export const ADAPTERS: Record<string, Adapter> = {
  "amazon.co.uk": amazon,
  "amazon.com": amazon,
  "amazon.de": amazon,
  "amazon.fr": amazon,
  "asos.com": asos,
};
