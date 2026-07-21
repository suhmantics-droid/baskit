import { describe, expect, it } from "vitest";
import { extractFromHtml, looksBlocked } from "@/lib/extract";
import { fromJsonLd, parsePrice } from "@/lib/extract/jsonld";
import { fromOg, fromMicrodata, fromRegex } from "@/lib/extract/meta";
import { ADAPTERS } from "@/lib/extract/adapters";

const JSONLD_PAGE = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"BreadcrumbList","itemListElement":[]},
  {"@type":"Product","name":"Sony WH-CH720 Headphones","image":["https://cdn.example.com/p.jpg"],
   "offers":{"@type":"Offer","price":"69.99","priceCurrency":"GBP","availability":"https://schema.org/InStock"}}
]}
</script></head><body></body></html>`;

const JSONLD_NO_CURRENCY = `<script type="application/ld+json">
{"@type":"Product","name":"Cupcake Selection","offers":{"price":24}}
</script>`;

const OG_PAGE = `<head>
<meta property="og:title" content="Linen Shirt" />
<meta property="og:image" content="https://cdn.example.com/shirt.jpg" />
<meta property="product:price:amount" content="45.00" />
<meta property="product:price:currency" content="GBP" />
</head>`;

const MICRODATA_PAGE = `<div itemscope itemtype="https://schema.org/Product">
<span itemprop="price" content="12.50"></span>
<meta itemprop="priceCurrency" content="GBP" />
</div>`;

const AMAZON_PAGE = `<html><body>
<span id="productTitle"> Sony WH-CH520 Wireless Headphones </span>
<img id="landingImage" src="https://m.media-amazon.com/img.jpg" />
<span class="a-price a-text-price"><span class="a-offscreen">£59.00</span></span>
</body></html>`;

const ASOS_PAGE = `<html><head><meta property="og:title" content="Mango midi dress" /></head>
<body><script>window.__state={"product":{"price":{"current":{"text":"£59.40","value":59.4},"currency":"GBP"}}}</script></body></html>`;

const BLOCK_PAGE = `<html><head><title>Access Denied</title></head>
<body>Request blocked. Pardon our interruption.</body></html>`;

describe("parsePrice", () => {
  it("handles symbols, grouping and comma decimals", () => {
    expect(parsePrice("£1,299.00")).toBe(1299);
    expect(parsePrice("59,4")).toBe(59.4);
    expect(parsePrice(24)).toBe(24);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("0")).toBeNull();
  });
});

describe("fromJsonLd", () => {
  it("walks @graph shapes and reads offer + availability + image", () => {
    const r = fromJsonLd(JSONLD_PAGE);
    expect(r).toMatchObject({
      price: 69.99,
      currency: "GBP",
      name: "Sony WH-CH720 Headphones",
      imageUrl: "https://cdn.example.com/p.jpg",
      availability: "in",
    });
  });
  it("reads numeric price with missing currency", () => {
    expect(fromJsonLd(JSONLD_NO_CURRENCY)).toMatchObject({ price: 24, currency: null });
  });
});

describe("meta fallbacks", () => {
  it("reads OG product tags", () => {
    expect(fromOg(OG_PAGE)).toMatchObject({ price: 45, currency: "GBP", name: "Linen Shirt" });
  });
  it("reads microdata itemprops", () => {
    expect(fromMicrodata(MICRODATA_PAGE)).toMatchObject({ price: 12.5, currency: "GBP" });
  });
  it("regex finds a symbol-adjacent price", () => {
    expect(fromRegex("<body>Now £89.99 was £120</body>")).toMatchObject({
      price: 89.99,
      currency: "GBP",
    });
  });
});

describe("adapters", () => {
  it("amazon reads the buy-box a-offscreen price + title", () => {
    const r = ADAPTERS["amazon.co.uk"](AMAZON_PAGE);
    expect(r).toMatchObject({
      price: 59,
      currency: "GBP",
      name: "Sony WH-CH520 Wireless Headphones",
      imageUrl: "https://m.media-amazon.com/img.jpg",
    });
  });
  it("asos reads embedded price state", () => {
    const r = ADAPTERS["asos.com"](ASOS_PAGE);
    expect(r).toMatchObject({ price: 59.4, currency: "GBP", name: "Mango midi dress" });
  });
});

describe("extractFromHtml ladder", () => {
  it("prefers JSON-LD and returns minor units", () => {
    const r = extractFromHtml(JSONLD_PAGE, "https://www.johnlewis.com/x/p123");
    expect(r).toMatchObject({
      priceMinor: 6999,
      currency: "GBP",
      method: "jsonld",
      confidence: "high",
    });
  });
  it("defaults GBP for .uk hosts when JSON-LD omits currency (spike decision #2)", () => {
    const r = extractFromHtml(JSONLD_NO_CURRENCY, "https://www.marksandspencer.com/x/p/f1");
    expect(r).toMatchObject({ priceMinor: 2400, currency: "GBP" });
  });
  it("uses the amazon adapter when JSON-LD is absent", () => {
    const r = extractFromHtml(AMAZON_PAGE, "https://www.amazon.co.uk/dp/B0BTJD6LCL");
    expect(r).toMatchObject({ priceMinor: 5900, method: "adapter", confidence: "high" });
  });
  it("falls through to OG, then regex as low confidence", () => {
    expect(extractFromHtml(OG_PAGE, "https://shop.example.com/p/1")).toMatchObject({
      method: "og",
      priceMinor: 4500,
    });
    expect(extractFromHtml("<body>Only £5.99!</body>", "https://shop.example.com/p/1")).toMatchObject(
      { method: "regex", confidence: "low", priceMinor: 599 },
    );
  });
  it("returns null when nothing is readable", () => {
    expect(extractFromHtml("<html><body>SPA shell</body></html>", "https://x.com/p")).toBeNull();
  });
});

describe("looksBlocked", () => {
  it("flags block statuses and challenge pages, not real pages", () => {
    expect(looksBlocked(403, "")).toBe(true);
    expect(looksBlocked(429, "")).toBe(true);
    expect(looksBlocked(200, BLOCK_PAGE)).toBe(true);
    expect(looksBlocked(200, JSONLD_PAGE)).toBe(false);
  });
});
