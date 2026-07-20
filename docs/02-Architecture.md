# Architecture

## Shape

A single **Next.js (App Router) + TypeScript** application, PWA-enabled, backed by **Postgres (Prisma)**, plus a **scheduled worker** for price checks / sale scans / Moment dispatch. Start as a modular monolith — split services only if scale demands it.

```
Browser / PWA / Extension
        │  (fetch, share target)
        ▼
Next.js app  ──────────────┐
  app/            UI (React Server + Client Components)
  app/api/        Route handlers (REST, Zod-validated, session-guarded)
  lib/            Pure logic: decision.ts, budget.ts, moments.ts, extract/*, format.ts
        │
        ▼
Prisma ──► Postgres (Neon)
        ▲
        │  (invoked on a schedule)
Scheduled worker
  /api/cron/price-check     re-check due items → PricePoint (+ dedup Moments)
  /api/cron/scan-sales      refresh SaleSignal per domain
  /api/cron/dispatch-moments rank/batch/quiet-hours → send push+email
        │
        ├─► Extraction pipeline (lib/extract): feed → JSON-LD/OG → headless (Playwright)
        └─► Notifications: Resend (email) + Web Push (VAPID)
```

## Key modules (`lib/`)

- `decision.ts`, `budget.ts`, `moments.ts` — **pure**, unit-tested, ported from `docs/04`.
- `extract/` — the product/price pipeline (`docs/05`): `index.ts` (orchestrator, tries strategies in order), `jsonld.ts`, `opengraph.ts`, `headless.ts`, `adapters/<retailer>.ts`, `price.ts` (parse/normalise money).
- `format.ts` — money (minor units ↔ display), dates, "ago".
- `db.ts` — Prisma client singleton.

## Request flows

**Add item by URL:** client `POST /api/extract {url}` → orchestrator returns name/image/price/domain → client confirms/edits → `POST /api/items` (writes Item + first PricePoint + ItemList rows).

**Daily price check:** scheduler → `POST /api/cron/price-check` (auth: `CRON_SECRET`) → select items where `lastCheckedAt` is due (tiered: hot items daily, cold items weekly) → run `extract` for each (rate-limited, batched) → on change write PricePoint + update `Item.price` + create candidate Moments (deduped) → `lastCheckedAt = now`.

**Moment delivery:** `dispatch-moments` cron → pull pending Moments per user → rank, batch (one good nudge > five), apply quiet hours + frequency cap → send via Web Push + email → mark sent. Deep-links open the item / retailer with affiliate + disclosure.

## PWA

`manifest.webmanifest` + service worker (Workbox or hand-rolled). Register as a **share target** so Android "Share → Basket" posts to a route that pre-fills add. Cache the app shell; data is network-first with a stale fallback. This is the "mobile app" for V1; native (Expo) is a later option.

## Extension (separate small package)

MV3 content script that reads the current product page (JSON-LD / OG / DOM) and POSTs to `/api/items` with the session cookie. Reuses the same extraction heuristics as the server. Ship after web MVP.

## Security & privacy

Session on every mutating route; ownership checks; Zod validation; secrets only in env. Rate-limit `/api/extract` and cron. GDPR: one-click export + delete; minimal logging; no PII in logs. Affiliate disclosure in UI. See `CLAUDE.md` guardrails.
