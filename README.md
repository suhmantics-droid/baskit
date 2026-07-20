# Baskit

A universal wishlist with **nested budgets**, a **buy/wait decision engine**, and
**price tracking** with well-timed nudges. Built from the validated prototype
(`prototype/basket-prototype.html`) into a real Next.js product.

- **Build handoff & rationale:** [`HANDOFF.md`](./HANDOFF.md), then `docs/00`–`docs/09`.
- **Working conventions & guardrails:** [`CLAUDE.md`](./CLAUDE.md).
- **What to build next:** [`docs/08-Backlog.md`](./docs/08-Backlog.md) (work top-to-bottom).

## Stack

Next.js 16 (App Router) · TypeScript · React 19 · Tailwind v4 · Prisma 7 (Postgres via
the pg driver adapter) · Vitest. PWA + Auth.js land in later epics.

## Getting started

```bash
npm install                 # also runs `prisma generate` (postinstall)
npm run dev                 # http://localhost:3000
```

To use the database (Prisma) you need a Postgres `DATABASE_URL` (Neon free tier is the
plan — see `docs/06`). Copy `.env.example` → `.env` and fill it in, then:

```bash
npm run db:migrate          # create/apply the schema
npm run db:seed             # load the Christmas-list sample data
npm run db:studio           # browse the data
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next dev / production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` / `test:watch` | Vitest (unit) |
| `npm run test:e2e` | Playwright (added with the UI epics) |
| `npm run lint` / `format` | ESLint / Prettier |
| `npm run db:generate` / `db:migrate` / `db:studio` / `db:seed` | Prisma |
| `npm run worker:check` | Local price-check worker (stub until E3-5) |

Run `npm run typecheck && npm run test && npm run lint` before considering a ticket done.

## Where the logic lives

The "cleverness" is isolated as pure, unit-tested functions with no I/O (money in
integer minor units, `now` injected for determinism):

- [`lib/decision.ts`](./lib/decision.ts) — `scoreItem()` buy/wait score + reasons (E1-1).
- [`lib/budget.ts`](./lib/budget.ts) — nested spend roll-up, cap states, allocation (E1-2).
- [`lib/moments.ts`](./lib/moments.ts) — `evaluateMoments()` nudge eligibility (E1-3).
- [`lib/format.ts`](./lib/format.ts) — money/date formatting (E0-4).

Tests: [`tests/unit`](./tests/unit) (55 cases). Data model: [`prisma/schema.prisma`](./prisma/schema.prisma).

## Status

Foundation + the full pure-logic core are done and green (typecheck, lint, tests,
production build). Next up per the backlog: **E0-3 Auth.js** and **Epic 2** (items/lists
API + UI). The database schema is ready; running migrations needs a `DATABASE_URL`.
