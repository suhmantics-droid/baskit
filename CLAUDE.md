# CLAUDE.md — Baskit

> **Naming:** the product brand is **Baskit** (renamed from "Basket", 2026-07). Docs and the prototype filename may still say Basket/basket; user-facing strings must say Baskit.

Project context for Claude Code. Read this first, then `docs/01-Product-Spec.md`, `docs/03-Data-Model.md`, and `docs/04-Decision-Engine.md`.

## What Baskit is

A universal wishlist that does budgeting and decision-making. Users save products from any store into **nested lists** (e.g. Christmas → Mum/Dad/Kids), each with a **spend cap** that rolls up and turns green/red. A **decision engine** scores each item "buy now vs wait." Prices are **tracked over time** with drop alerts. Full background: `docs/00-Commercialization-Brief.md`.

The single-file prototype in `prototype/basket-prototype.html` is browser-tested and is the source of truth for UX and for the scoring/budget logic. Port it faithfully; don't ship it as-is.

## Stack

- **Next.js (App Router) + TypeScript**, React, PWA (installable, offline-tolerant shell).
- **Postgres via Prisma** (Neon free tier to start).
- **Auth.js (NextAuth)** with email + OAuth.
- **Price-check worker**: scheduled job (see `docs/05` and `docs/06` for the free-tier cron choice).
- **Playwright** for the headless-scrape fallback and for e2e tests.
- **Vitest** for unit tests, **Playwright** for e2e.
- Styling: Tailwind CSS (match the prototype's warm-minimal look; tokens in `docs/01`).

## Commands (define these in package.json as you scaffold)

```
npm run dev          # next dev
npm run build        # next build
npm run start        # next start
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run test:e2e     # playwright test
npm run db:migrate   # prisma migrate dev
npm run db:studio    # prisma studio
npm run worker:check # run the price-check worker locally
```

Always run `npm run typecheck && npm run test && npm run lint` before considering a ticket done.

## Conventions

- **Pure logic is isolated and unit-tested.** The decision engine and budget roll-up (`lib/decision.ts`, `lib/budget.ts`) are pure functions with no I/O — port them exactly from `docs/04` and cover them with tests first.
- Server code in `app/api/**` (route handlers) and `lib/**`. Client components only where interactivity is needed.
- Money is stored in **minor units (integer pennies) + a currency code** — never floats. (The prototype used floats; fix this on the way in.)
- Validate all API input with **Zod**. Every mutating route checks the session and ownership.
- No secrets in the repo. Use `.env` (see `.env.example`); document any new var there.

## Guardrails (important)

- **Scraping is legally sensitive.** Prefer official affiliate product feeds / APIs. Use HTML parsing (JSON-LD, Open Graph, microdata) next, and headless scraping only as a fallback, rate-limited and polite (respect robots where practical). Never hammer a retailer. See `docs/05`.
- **Privacy:** we hold shopping behaviour (GDPR-relevant). Minimise data, make export/delete easy, don't log PII.
- **Affiliate disclosure** is legally required (FTC/ASA) — bake it into the UI where purchases are influenced.
- Keep the "on your side" trust: no ads, no dark patterns.

## Definition of done for a ticket

Types pass, unit tests for any new pure logic, the happy path works locally, and no secret is committed. Update `docs/08-Backlog.md` checkboxes as you go.
