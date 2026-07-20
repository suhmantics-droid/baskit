# Price & Product Pipeline

The hardest, most valuable part. Goal: given a URL, reliably return `{name, image, price, currency, domain}`, and re-check it on a schedule. **Coverage is a maintained asset, never "done."**

## Extraction strategy — try in order, stop at first confident hit

`lib/extract/index.ts` orchestrates:

1. **Affiliate product feed / API** (best). If the domain is covered by a network we've joined (Awin, Skimlinks, Amazon PA-API, retailer APIs), look the product up there. Authoritative price, legal, includes the affiliate link. Prefer this always.
2. **Structured data in the page HTML** (`fetch` the URL server-side, parse):
   - **JSON-LD** `Product`/`Offer` (`offers.price`, `priceCurrency`, `availability`) — most reliable when present.
   - **Open Graph** `product:price:amount` / `og:image` / `og:title`.
   - **Microdata / schema.org** `itemprop="price"`.
3. **Headless browser fallback** (`lib/extract/headless.ts`, Playwright) for JS-rendered prices — expensive, rate-limited, used only when 1–2 fail.
4. **Per-retailer adapters** (`lib/extract/adapters/<domain>.ts`) — hand-written selectors for high-traffic stores where generic parsing fails. This is the ongoing maintenance surface; add adapters driven by real user URLs.

Each strategy returns `{price, currency, source, confidence}`. Record `source` on the `PricePoint`. If all fail, return partial (name/image only) and mark the item "price not auto-readable" — the user can log it manually or use the extension/bookmarklet on the page.

> The prototype's client-side microlink call is strategy ~2.5 (a hosted OG/meta reader). Keep it only as a cheap fallback; the server pipeline above is the real thing.

## Scheduling (tiered, to control cost)

Cron hits `POST /api/cron/price-check` (auth via `CRON_SECRET`). Select **due** items:
- **Hot** (target set, in a list with a cap, or recently viewed): check **daily**.
- **Warm** (active want/later): check every **3 days**.
- **Cold** (researching, old, no target): check **weekly**.

Batch, cap per run (respect the free-tier compute budget — `docs/06`), space requests politely per domain. On change: write `PricePoint`, update `Item.price`, emit candidate Moments (deduped by crossing). Update `lastCheckedAt` even on failure (with backoff).

## Sale detection

`POST /api/cron/scan-sales`: for each unique domain with saved items, read the homepage (feed/OG/JSON-LD, headless only if needed), match sale wording (patterns are in the prototype's `SALE_PATS`), and upsert `SaleSignal{domain, found, text, endsAt?}`. Item-level discounts come free from strategy 1–2 (compare `price` to `listPrice`/`was`). Feed both into Moments.

## Legal / etiquette (read `CLAUDE.md`)

- Prefer official feeds/APIs. Price is factual data (lower risk) but many ToS forbid automated access — scrape as **fallback**, politely, cache aggressively, honour blocks, and take counsel before scaling.
- Identify a real user-agent, back off on 429/errors, never parallel-hammer one host.
- Affiliate links must be disclosed in the UI (FTC/ASA).

## The de-risking spike (do this first — `docs/09`)

Before building the scheduler, run `scripts/extract-spike.ts` over ~50 real product URLs across ~10 retailers and report: % readable by JSON-LD, by OG, needing headless, unreadable. That single number tells you the true cost/feasibility of coverage and which adapters to write first.
