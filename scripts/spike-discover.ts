/**
 * E3-1 discovery: fetch a category/search page per UK retailer and harvest up
 * to 3 real product URLs each, writing scripts/spike-urls.json for the spike.
 * A retailer that blocks even its category page is itself a finding.
 * Run: npx tsx scripts/spike-discover.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

interface Seed {
  domain: string;
  seed: string;
  pattern: RegExp;
  absolute?: string; // prefix for relative hrefs
}

const SEEDS: Seed[] = [
  // round-1 winners (asos, m&s, dunelm, amazon, lego, nike, jd) — keep as-is
  { domain: "asos.com", seed: "https://www.asos.com/women/dresses/cat/?cid=8799", pattern: /href="([^"]*\/prd\/\d+[^"]*)"/g, absolute: "https://www.asos.com" },
  { domain: "marksandspencer.com", seed: "https://www.marksandspencer.com/l/men/mens-knitwear", pattern: /href="(\/[^"]+\/p\/[a-z0-9]+[^"]*)"/g, absolute: "https://www.marksandspencer.com" },
  { domain: "dunelm.com", seed: "https://www.dunelm.com/category/home-and-furniture/bedding/duvet-covers", pattern: /href="(\/product\/[^"]+)"/g, absolute: "https://www.dunelm.com" },
  { domain: "amazon.co.uk", seed: "https://www.amazon.co.uk/s?k=sony+headphones", pattern: /href="(\/[^"]*\/dp\/[A-Z0-9]{10}[^"]*)"/g, absolute: "https://www.amazon.co.uk" },
  { domain: "lego.com", seed: "https://www.lego.com/en-gb/themes/technic", pattern: /href="(\/en-gb\/product\/[^"]+)"/g, absolute: "https://www.lego.com" },
  { domain: "nike.com", seed: "https://www.nike.com/gb/w/mens-shoes-nik1zy7ok", pattern: /href="(https:\/\/www\.nike\.com\/gb\/t\/[^"]+)"/g },
  { domain: "jdsports.co.uk", seed: "https://www.jdsports.co.uk/men/mens-footwear/trainers/", pattern: /href="(\/product\/[^"]+)"/g, absolute: "https://www.jdsports.co.uk" },
  // round-2 fixes
  { domain: "johnlewis.com", seed: "https://www.johnlewis.com/search?search-term=headphones", pattern: /href="(\/[^"]+\/p\d{6,})"/g, absolute: "https://www.johnlewis.com" },
  { domain: "ebay.co.uk", seed: "https://www.ebay.co.uk/sch/i.html?_nkw=lego+technic", pattern: /href="(https:\/\/www\.ebay\.co\.uk\/itm\/\d+[^"]*)"/g },
  { domain: "etsy.com", seed: "https://www.etsy.com/uk/search?q=silver+necklace", pattern: /href="(https:\/\/www\.etsy\.com\/uk\/listing\/\d+[^"]*)"/g },
  { domain: "boots.com", seed: "https://www.boots.com/no7", pattern: /href="([^"]*-1\d{6,}\b[^"]*)"/g, absolute: "https://www.boots.com" },
  { domain: "screwfix.com", seed: "https://www.screwfix.com/search?search=dewalt+drill", pattern: /href="((?:https:\/\/www\.screwfix\.com)?\/p\/[^"]+)"/g, absolute: "https://www.screwfix.com" },
  // round-2 new retailers
  { domain: "ao.com", seed: "https://ao.com/l/washing_machines/1-2/29-30/", pattern: /href="((?:https:\/\/ao\.com)?\/product\/[^"]+)"/g, absolute: "https://ao.com" },
  { domain: "decathlon.co.uk", seed: "https://www.decathlon.co.uk/sport-groups/running", pattern: /href="((?:https:\/\/www\.decathlon\.co\.uk)?\/p\/[^"]+)"/g, absolute: "https://www.decathlon.co.uk" },
  { domain: "riverisland.com", seed: "https://www.riverisland.com/c/women/dresses", pattern: /href="((?:https:\/\/www\.riverisland\.com)?\/p\/[^"]+)"/g, absolute: "https://www.riverisland.com" },
  { domain: "lookfantastic.com", seed: "https://www.lookfantastic.com/health-beauty/skin-care/moisturisers.list", pattern: /href="((?:https:\/\/www\.lookfantastic\.com)?\/[^"]+\/\d{8,}\.html)"/g, absolute: "https://www.lookfantastic.com" },
  { domain: "hollandandbarrett.com", seed: "https://www.hollandandbarrett.com/shop/vitamins-supplements/vitamins/", pattern: /href="((?:https:\/\/www\.hollandandbarrett\.com)?\/shop\/product\/[^"]+)"/g, absolute: "https://www.hollandandbarrett.com" },
  { domain: "smythstoys.com", seed: "https://www.smythstoys.com/uk/en-gb/toys/lego/c/SM100114", pattern: /href="((?:https:\/\/www\.smythstoys\.com)?\/uk\/en-gb\/[^"]+\/p\/\d+)"/g, absolute: "https://www.smythstoys.com" },
  { domain: "diy.com", seed: "https://www.diy.com/departments/tools-equipment/power-tools/drills/DIY821644.cat", pattern: /href="((?:https:\/\/www\.diy\.com)?\/departments\/[^"]+\.prd)"/g, absolute: "https://www.diy.com" },
  { domain: "toolstation.com", seed: "https://www.toolstation.com/power-tools/drills/c22", pattern: /href="((?:https:\/\/www\.toolstation\.com)?\/[^"]+\/p\d{5,})"/g, absolute: "https://www.toolstation.com" },
  { domain: "whsmith.co.uk", seed: "https://www.whsmith.co.uk/books/fiction/", pattern: /href="((?:https:\/\/www\.whsmith\.co\.uk)?\/products\/[^"]+)"/g, absolute: "https://www.whsmith.co.uk" },
  { domain: "sportsdirect.com", seed: "https://www.sportsdirect.com/mens/mens-trainers", pattern: /href="((?:https:\/\/www\.sportsdirect\.com)?\/[a-z0-9-]+\/[a-z0-9-]+-\d{6}[^"]*)"/g, absolute: "https://www.sportsdirect.com" },
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function main() {
  const out: { domain: string; url: string }[] = [];
  for (const s of SEEDS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      const res = await fetch(s.seed, {
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-GB,en;q=0.9" },
      });
      clearTimeout(timer);
      const html = await res.text();
      const seen = new Set<string>();
      for (const m of html.matchAll(s.pattern)) {
        let url = m[1];
        if (!/^https?:/i.test(url)) url = (s.absolute ?? "") + url;
        url = url.replace(/&amp;/g, "&").split("#")[0];
        if (!seen.has(url)) {
          seen.add(url);
          if (seen.size <= 3) out.push({ domain: s.domain, url });
        }
      }
      console.log(`${s.domain.padEnd(24)} ${res.status}  found ${Math.min(seen.size, 3)}`);
    } catch (e) {
      console.log(`${s.domain.padEnd(24)} ERR   ${(e as Error).name}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  writeFileSync(join(__dirname, "spike-urls.json"), JSON.stringify(out, null, 2));
  console.log(`\nwrote ${out.length} urls across ${new Set(out.map((o) => o.domain)).size} domains -> scripts/spike-urls.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
