/** Test the Firecrawl fallback end-to-end. Run: npx tsx scripts/fallback-try.ts */
import "dotenv/config";
import { extractWithFallback, firecrawlConfigured } from "../lib/extract";

const URLS = [
  ["Argos (blocked→stealth)", "https://www.argos.co.uk/product/7802397"],
  ["Amazon (plain, no credit)", "https://www.amazon.co.uk/dp/B0BTJD6LCL"],
  ["Currys (blocked→stealth)", "https://www.currys.co.uk/products/apple-airpods-4-white-10270517.html"],
];

async function main() {
  console.log("firecrawl configured:", firecrawlConfigured());
  for (const [label, url] of URLS) {
    const t = Date.now();
    const r = await extractWithFallback(url);
    const price = r.extracted ? `${r.extracted.currency} ${r.extracted.priceMinor / 100} [${r.extracted.method}]` : r.note;
    console.log(`${label.padEnd(28)} ${Date.now() - t}ms  ${r.ok ? "OK" : "miss"}  ${price}  (${r.note ?? ""})`);
  }
}
main();
