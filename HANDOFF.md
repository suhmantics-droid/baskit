# Baskit — Build Handoff

This is the transfer package for building **Baskit** (formerly "Basket") — a universal wishlist with nested budgets, a buy/wait decision engine, and price tracking — from the validated prototype into a real product.

**Stack decided:** Next.js + TypeScript · PWA-first · free-tier hosting (see `docs/06-Hosting-Free-Tier.md`).

## Read in this order

| # | File | What it's for |
|---|------|---------------|
| — | `CLAUDE.md` | **Start here in Claude Code.** Project context, commands, conventions, guardrails. |
| 00 | `docs/00-Commercialization-Brief.md` | Why we're building this, market, business model. Background. |
| 01 | `docs/01-Product-Spec.md` | What to build: features, user stories, screens, rules. |
| 02 | `docs/02-Architecture.md` | System design, folders, services, request flows. |
| 03 | `docs/03-Data-Model.md` | Prisma schema + REST API contract. |
| 04 | `docs/04-Decision-Engine.md` | **The exact scoring + budget roll-up logic from the prototype.** Port verbatim. |
| 05 | `docs/05-Price-Pipeline.md` | How URL → price/image, and daily re-checks. The hard part. |
| 06 | `docs/06-Hosting-Free-Tier.md` | Zero-cost stack, free-tier limits, when to pay. |
| 07 | `docs/07-Roadmap.md` | Phased milestones (Christmas launch window). |
| 08 | `docs/08-Backlog.md` | Concrete, ordered tickets to execute one at a time. |
| 09 | `docs/09-Testing.md` | Unit / integration / e2e strategy + the 50-URL extractor spike. |

## The prototype

`prototype/basket-prototype.html` is the **working, browser-tested front-end** we built. It is the source of truth for the UX and for the decision/budget logic. Open it in a browser, click "Load samples," and use it as the visual + behavioural spec. Do **not** ship it as-is — it's a single-file local demo — but port its logic and look faithfully.

## First move in Claude Code

1. Read `CLAUDE.md`, then `docs/01`, `03`, `04`.
2. Scaffold the Next.js app (ticket **E0-1** in `docs/08-Backlog.md`).
3. Work the backlog top-to-bottom; each ticket is sized to be a single focused session.
