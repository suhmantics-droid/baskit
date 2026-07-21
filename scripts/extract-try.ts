/**
 * Try the production extraction ladder on real URLs — adapter debugging CLI.
 * Run: npx tsx scripts/extract-try.ts <url> [url...]
 */
import { extractFromUrl } from "../lib/extract";

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) {
    console.error("usage: npx tsx scripts/extract-try.ts <url> [url...]");
    process.exit(1);
  }
  for (const url of urls) {
    const r = await extractFromUrl(url);
    console.log(JSON.stringify({ url, ...r }, null, 2));
    await new Promise((res) => setTimeout(res, 800));
  }
}

main();
