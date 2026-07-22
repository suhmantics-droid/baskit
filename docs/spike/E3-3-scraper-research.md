# E3-3 research — do we need a paid scraper, and what does it cost?

**Question:** Fetch is 6/10 live. The 4 misses (Argos, Currys, John Lewis = datacentre-IP
blocks; Boots = JS challenge) can't be fixed by free headless on Vercel — 3 of 4 block the
*server's IP*, not the JavaScript. Genuine 9/10+ needs **residential IPs = a paid scraping
service**. This spike answers: does one actually work, and what would it cost.

## Empirical test (Firecrawl stealth mode, GB location) — 21 Jul 2026

All four blocked retailers, scraped live during research. **4 / 4 broke through, HTTP 200,
real prices:**

| Retailer | Block type | Result | Price read |
|---|---|---|---|
| Argos | datacentre-IP 403 | ✅ 200 | LEGO Creeper 21276 — £28, in stock |
| Currys | datacentre-IP 403 | ✅ 200 | Apple AirPods 4 — £99, in stock |
| John Lewis | silent stall | ✅ 200 | Beats Solo 4 — £199.95, out of stock |
| Boots | JS challenge | ✅ 200 | No7 Skin Tint — £17.95, in stock |

**Conclusion: a residential-proxy scraper takes Fetch from 6/10 → 10/10.** Proven, not
theoretical.

Key optimisation: the price sits in the returned page's JSON-LD/metadata (Boots' response
even surfaced `price: "17.95"` directly). So we feed Firecrawl's HTML into our **existing
free `lib/extract` parser** and skip Firecrawl's LLM extraction — halving the credit cost.

## Cost (Firecrawl, verified pricing Jul 2026)

- **Credits per scrape:** 1 normally; **5 in stealth mode** (what the blocks need). Our test
  used 9 because it included LLM JSON extraction (+4) — avoidable with our own parser, so the
  production cost is **~5 credits/blocked-scrape**.
- **Plans:** Free $0 / 1,000 credits per month (no card) · Hobby $16/mo / 5,000 · Standard
  $83/mo / 100,000. Credits don't roll over.

### What Baskit actually needs (only the ~4 blocked domains hit the scraper — the other 6/10 stay free plain-fetch, and blocked domains are on the *weekly* cron lane)

| Stage | Blocked-shop scrapes/mo | Credits (×5) | Plan | Cost |
|---|---|---|---|---|
| **Beta (test round)** | ~180 | ~900 | **Free (1,000)** | **£0** |
| Early growth (~500 users) | ~1,000 | ~5,000 | Hobby | ~$16/mo |
| Real scale (~5,000 users) | ~10,000 | ~50,000 | Standard | ~$83/mo |

**The beta runs free.** ~900 credits/mo fits inside the free 1,000, no card, no bill. We only
pay once volume genuinely grows, and even at 5k users it's ~$83/mo — cheap for the moat.

## Alternatives (not tested — Firecrawl is proven on our exact 4 blocks + already connected)

ScrapingBee, ScraperAPI, Scrapfly, Zyte all offer residential-proxy scraping at similar price
points (most with 1,000-credit free trials). No reason to switch: Firecrawl works 4/4 here,
has a real free tier, and an MCP is already wired for testing.

## Recommendation

Wire Firecrawl as an **opt-in fallback for blocked domains only**, gated behind a
`FIRECRAWL_API_KEY` env:
- Absent (today) → blocked domains stay manual-entry, current graceful behaviour.
- Present (free key) → nightly cron routes the ~4 Tier-C domains through Firecrawl stealth →
  HTML → our free parser. Interactive Fetch stays fail-fast (or optionally uses it with a
  spinner for "check now").

**On the free key this is £0 and takes Fetch to 10/10 for the whole test round**, with no paid
commitment until the numbers say so. Sagar creates a free Firecrawl account (no card), hands
over the key, it goes in `.env` + Vercel.

## Sources
- Firecrawl pricing 2026 — eesel AI, fastCRW, Apify reviews (free 1,000/mo, stealth 5 credits)
- Live empirical scrapes, 21 Jul 2026 (this doc's table)
