# Testing strategy

The prototype was verified in a real headless browser at every step (adding items, nested budget roll-ups, price-history logging, sale detection) with zero JS errors. Carry that discipline in.

## Layers

**1. Unit (Vitest) — the priority.** The valuable logic is pure, so it's cheap to test hard:
- `lib/decision.ts` — a fixture per scoring row + one per band boundary (47/48, 69/70, 27/28). Assert score, band, and that the right reason strings appear. Use the prototype's sample items as golden cases.
- `lib/budget.ts` — roll-up sums; an item in two sub-lists counted **once**; capState thresholds (0.89→ok, 0.9→warn, 1.01→over); allocation attribution (each item in exactly one bucket; totals reconcile to `listSpent`).
- `lib/moments.ts` — each trigger fires once; `dedupeKey` prevents a repeat on the same crossing.
- `lib/extract/price.ts` — money parsing across "£1,299.00", "$79", "1.299,00 €", missing/garbage.

**2. Integration (Vitest + test DB).** API routes against a disposable Postgres (Neon branch or docker): auth required, ownership enforced, Zod rejects bad input, PATCH price logs a PricePoint, list delete reparents children.

**3. e2e (Playwright).** One spec per core flow: sign in → add item by URL (mock `/api/extract`) → appears in list → create nested list with cap → roll-up goes red → mark bought → price-check updates history → Moment appears in feed. Run headless in CI; screenshot on failure.

**4. The extractor spike (`scripts/extract-spike.ts`).** Not a pass/fail test — a **measurement**. Feed ~50 real product URLs across ~10 retailers; output a table: readable via JSON-LD / OG / microdata / needs-headless / unreadable, with the price found. This de-risks the pipeline and picks the first adapters. Re-run periodically — falling coverage = retailers changed, adapters need maintenance.

## Deterministic testing notes (learned from the prototype)
- **Stub the network** for price/sale logic. In tests, replace the extractor with canned responses (as we did in the prototype's browser tests) so price-logging and Moment logic are verified without hitting live sites.
- **Inject the clock.** Decision/cool-off/Moment logic depends on "now" — pass a `now` param (don't call `Date.now()` inside pure fns) so time-based cases are deterministic.
- **Money is integer minor units** everywhere; test the format boundaries at the edge.

## CI
GitHub Actions: `typecheck → lint → unit → integration → e2e (Playwright)` on every PR. Block merge on failure. Keep the extractor spike as a manual/scheduled job (it hits live sites), not in the blocking PR run.

## Definition of done (per ticket)
`npm run typecheck && npm run test && npm run lint` clean, new pure logic covered, happy path works locally, no secret committed, backlog box ticked.
