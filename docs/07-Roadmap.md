# Roadmap

Sequenced to de-risk cheaply, then land social/gifting features **before the Christmas peak** — Basket's most viral, highest-intent window.

## Phase 0 — Validate & de-risk (weeks 1–2, ~£0–200)
- Landing page on suhmantics + email capture + basic analytics.
- Two-message ad test ("price tracker" vs "gift-budget planner") — find the wedge.
- **Extractor spike** (`scripts/extract-spike.ts`, 50 URLs / 10 retailers) — measure true coverage. This decides how hard the data pipeline is *before* you commit to it.
- Ship the current prototype to 20–30 real people; watch what they use.

**Gate:** decent sign-up rate AND ≥~60% of test URLs readable without headless → proceed. Otherwise rethink scope.

## Phase 1 — Real MVP (weeks 3–8)
- Next.js scaffold, Prisma + Neon, Auth.js.
- Port items, nested lists, budgets, decision engine (parity with prototype). Sync across devices.
- Extraction pipeline (feed + structured data; headless fallback) for a **curated set of well-behaved retailers** — narrow but reliable beats broad but flaky.
- Server-side daily price checks (tiered) + price history.
- PWA (installable + share target). Chrome extension for capture.

**Gate:** a user can save from 5+ real stores on their phone, see prices update on their own, and trust the numbers.

## Phase 2 — Moments + gifting (weeks 9–12, aim pre-Christmas)
- **Moments engine**: target-hit, sale, cool-off-done, back-in-stock, budget-window nudges; ranking, quiet hours, frequency cap; push + email; the Moments/Activity feed.
- Sale intelligence surfaced ("3 items in a sale ending Sunday, save £74").
- Shared lists + gift **reservation** (no double-buying) + optional budget split.
- Affiliate integration on purchase deep-links (with disclosure).

**Gate:** Moments demonstrably bring users back and drive tracked purchases (your first revenue + your retention proof).

## Phase 3 — Grow (post-launch)
- Widen retailer coverage (adapters driven by real user URLs).
- Native apps if the numbers justify it.
- Smarter decision signals from accumulated price history ("£X above 90-day low").
- The agentic bet: rules-based auto-actions, and eventually assisted checkout.

## North-star metric
**Purchases influenced through Basket per active user per month** — it captures capture-quality, decision usefulness, and Moment timing in one number, and it's the thing affiliate revenue tracks.
