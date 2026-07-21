# E3-1 spike findings — how hard are UK retailers really?

**Ran:** 2026-07-21 · 40 product URLs · 13 retail domains · plain server-side fetch
(Chrome UA, en-GB, no JS, 800ms pacing). Raw data: `E3-1-results.json`.
Discovery method: fetched each retailer's own category/search page and harvested real
product links (`scripts/spike-discover.ts`); Argos + Currys product URLs harvested via a
real browser because their category pages 403 plain fetches.

## Headline numbers

| Metric | Result |
|---|---|
| Readable server-side (any method) | **60%** of URLs |
| Confident (JSON-LD structured data) | **53%** |
| OG / microdata rescued anything JSON-LD missed | **0** — they fail together |
| Blocked or unreadable | 40% |

## Retailer tiers (the thing that shapes the build)

**Tier A — JSON-LD, plain fetch works (7/13 domains, every URL confident):**
M&S, Dunelm, Nike, JD Sports, John Lewis, Screwfix, River Island.
→ E3-2's fetch + JSON-LD parser covers these **today**, zero extra work per retailer.

**Tier B — fetchable (HTTP 200) but needs a per-domain adapter (2):**
- **Amazon** — never emits JSON-LD; price sits in `<span class="a-offscreen">£…</span>`
  in the same HTML we already fetched. One regex adapter unlocks the biggest retailer.
- **ASOS** — JS app, but price leaks into embedded state; generic regex found it
  (low confidence). An adapter reading their embedded JSON makes it confident.

**Tier C — blocked to plain fetch, but a real browser gets in (4):**
LEGO (403), Argos (403), Currys (403), Boots (200 but serves a challenge page).
The browser pane loaded Argos and Currys fine → **headless Playwright with a realistic
fingerprint (E3-3) will read these.** Schedule them on the slow lane.

**Tier D — hostile even to a real browser (1):**
Next hard-blocks every path except its homepage (category, search, sitemap all denied).
→ Manual price entry / affiliate feed only. Don't burn headless quota on it.

Supplementary (from discovery, category-level 403s, product pages untested):
H&M, Waterstones, eBay, Etsy, AO, Decathlon lean Tier C. Test when a user actually
adds one.

## Decisions this locks in for E3-2/E3-3

1. **Ladder order confirmed but simplified:** JSON-LD → domain adapter → regex(low-conf).
   OG and microdata never fired once — keep the parsers (cheap) but expect nothing.
2. **Currency default:** M&S returns price without `priceCurrency` — when JSON-LD omits
   currency on a `.co.uk`/`.uk` host, default GBP rather than dropping the price.
3. **Adapters to ship first:** Amazon (`a-offscreen`), ASOS (embedded state). Two files,
   two big retailers.
4. **Headless lane (E3-3):** LEGO, Argos, Currys, Boots. Cap attempts, run weekly-not-daily,
   and record block-vs-price so we stop retrying dead retailers.
5. **`SaleSignal`/store-offer checks** should reuse the same tiering — don't plain-fetch
   Tier C/D homepages daily.
6. **Never mark "price unavailable" as an error to the user** — 40% of the market needs
   the slow lane; the UI copy is "we check this one less often", not a failure state.

## Etiquette held

800ms pacing, one pass, honest UA. Blocked hosts were not retried or fingerprint-spoofed
server-side; Tier C goes through a real browser engine at low frequency instead.
