# Backlog — ordered, Claude-Code-sized tickets

Work top-to-bottom. Each ticket is one focused session. Tick the box when types + tests pass and the happy path works. IDs are stable references.

## Epic 0 — Foundation
- [x] **E0-1** Scaffold Next.js + TS + Tailwind + ESLint + Prettier; add scripts from `CLAUDE.md`; commit `.env.example`. _(Next 16 / React 19 / Tailwind v4. Design tokens ported into `app/globals.css`.)_
- [x] **E0-2** Prisma + Neon; port schema from `docs/03`; first migration; `db.ts` singleton; seed script that mirrors the prototype's sample data (Christmas → Mum/Dad/Kids, etc.). _(Neon project `baskit` (eu-west-2) live; `20260719170224_init` migration applied; seeded 1 user / 6 lists / 10 items / 15 price points.)_
- [x] **E0-3** Auth.js (email magic-link + Google OAuth); session helper; protect a test route. _(Resend magic-link live in prod (branded email); Google switches on when AUTH_GOOGLE_ID/SECRET exist; DB sessions via Prisma adapter; `requireUser()` helper; `/api/me` 401/200 verified. Prod = Vercel project `baskit-app` with pooled Neon URL. Gotcha: pipe env values to `vercel env add` BOM-free (cmd `<` redirect), and `.vercelignore` must exclude `.env` since the folder isn't a git repo.)_
- [x] **E0-4** `lib/format.ts` (money minor-units ↔ display, dates, "ago"); Vitest set up.

## Epic 1 — Core logic (pure, test-first) — port from `docs/04`
- [x] **E1-1** `lib/decision.ts` + unit tests covering every scoring row and all four bands (use prototype values as fixtures).
- [x] **E1-2** `lib/budget.ts` (subtree, listSpent dedup, capState, allocation attribution) + tests, incl. an item in two sub-lists counted once.
- [x] **E1-3** `lib/moments.ts` `evaluateMoments` + dedupeKey + tests.

## Epic 2 — Items & lists API + UI (parity with prototype)
- [x] **E2-1** Items CRUD API (Zod, ownership) + PricePoint write on price change. _(GET/POST `/api/items`, GET/PATCH/DELETE `/api/items/:id`; GET :id returns derived `decision`; cool-off rule ported (`resolveWaitUntil`); domain normalised server-side. Gotcha: Zod `.partial()` of a defaulted schema still fires defaults — update schema is built default-free (regression-tested). E2E-verified against Neon signed-in.)_
- [x] **E2-2** Lists CRUD API incl. reparent-on-delete; tree endpoint with rolled-up spend + capState. _(GET `/api/lists` returns the flat forest with per-node spent/bought/itemCount/capState/childCapsAllocated computed by lib/budget (single source of truth); POST/PATCH/DELETE with ownership, cycle-guarded reparenting (`wouldCreateCycle`), delete moves children up in a transaction. E2E-verified signed-in incl. roll-up + cycle 400 + reparent-on-delete.)_
- [x] **E2-3** Home + item grid (cards: score pill, price, drop, list chips, bought toggle) — match prototype look/dark mode. _(Prototype CSS ported wholesale to `app/app.css` (identical class names — later tickets reuse); `Dashboard` + `ItemCard` client components with hero/stats/chips/cat/sort/search, optimistic bought+fav toggles, client-side scoreItem; theme toggle with pre-paint init + effective-theme detection; fav toggle also nudges score live (+4). Verified signed-in against Neon in light+dark, zero console errors.)_
- [ ] **E2-4** Sidebar list tree with roll-up mini-bars; list view (budget header, allocation bar, sub-list cards, breadcrumb).
- [x] **E2-5** Add/Edit item modal (with list picker tree) + item detail panel (score ring, reasons, price history sparkline, lists). _(Done before E2-4 at Sagar's call, 2026-07-20 — the planning loop needed self-serve add/edit. `ItemModal` (key-remount per item so form state needs no init effects; money major↔minor at the edge; microlink fetch ported; inline list create) + `DetailPanel` (fetches GET :id for history; score ring, reasons, cool-off decide-now/wait-longer, sparkline, log-price, fav/bought/edit). Full UI e2e: add → card → panel → log price → sparkline + since-saved → edit prefilled → delete. Zero console errors.)_
- [ ] **E2-6** Insights (monthly budget meter, lists-vs-caps, value by category).
- [ ] **E2-7** PWA manifest + service worker + **share target** route (pre-fills add). _(Competitor research 2026-07-20: one-click capture is the lead feature for Karma/Moonsift/GiftList — extension + share-sheet is table stakes; prototype now surfaces the bookmarklet as "Save from any store" in the hero.)_

## Epic 3 — Price pipeline — `docs/05`
- [ ] **E3-1** `scripts/extract-spike.ts` (50 URLs) + coverage report. *(Do in Phase 0.)*
- [ ] **E3-2** `lib/extract` orchestrator + JSON-LD + OG + microdata parsers + `price.ts`; `/api/extract`.
- [ ] **E3-3** Headless fallback (Playwright), rate-limited; adapter interface + 2–3 real retailer adapters from spike findings.
- [ ] **E3-4** `/api/items/:id/price-check` + client "check now"; PricePoint history endpoint + detail chart.
- [ ] **E3-5** `/api/cron/price-check` (tiered selection, batched, `CRON_SECRET`); wire Cloudflare Workers cron (`docs/06`).
- [ ] **E3-6** `/api/cron/scan-sales` + `SaleSignal` + sale badges/banner (port `SALE_PATS`).

## Epic 4 — Moments engine ⭐ — `docs/01 §4`
- [ ] **E4-1** Moment creation from price-check/scan (deduped); `Moment` table writes.
- [ ] **E4-2** `/api/cron/dispatch-moments`: rank, batch, quiet hours, frequency cap.
- [ ] **E4-3** Delivery: Web Push (VAPID) + email (Resend); deep-links with affiliate + disclosure.
- [ ] **E4-4** Moments/Activity feed UI + per-moment snooze/mute + "why am I seeing this?".
- [ ] **E4-5** Notification preferences (channels, quiet hours, frequency, payday) in settings.

## Epic 5 — Sharing & gifting (pre-Christmas) — `docs/01`
- [ ] **E5-1** `ListMember` + share invite flow (view/edit). _(Research 2026-07-20: Moonsift's growth loop is share-by-link with NO account needed to view/reserve — match that; WishUpon/GiftList also do "secret mode"/reveal control, which our hidden Reservation model already supports.)_
- [ ] **E5-2** Gift **reservation** hidden from list owner; reserved state for givers.
- [ ] **E5-3** Optional group budget split view.

## Epic 6 — Commercial hardening
- [ ] **E6-1** Affiliate network integration (start one, e.g. Awin/Skimlinks) + link rewriting + disclosure.
- [ ] **E6-2** Billing (Stripe) + free/Plus gating.
- [ ] **E6-3** GDPR: data export + account delete; privacy policy; minimal-logging pass.
- [ ] **E6-4** Analytics for the north-star metric; landing page.

## Cross-cutting (every ticket)
Typecheck + unit tests for new pure logic + no committed secrets. e2e (Playwright) for each main flow as it lands (`docs/09`).
