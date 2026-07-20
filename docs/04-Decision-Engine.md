# Decision Engine & Budget Roll-up — port verbatim

These are the two pieces of "cleverness" from the prototype. They are **pure functions** — no I/O. Port them exactly into `lib/decision.ts` and `lib/budget.ts`, unit-test them first (`docs/09`), then build UI on top. Behaviour must match `prototype/basket-prototype.html`.

> **Money note:** the prototype used floating-point prices. In the real app, store money as **integer minor units** (pennies) + currency code. The formulas below are identical either way; just keep types consistent and format at the edge.

## 1. Decision score — `scoreItem(item, ctx)`

Start at **50**, apply the adjustments below, clamp to **[2, 98]**.

| Condition | Δ | Reason string |
|---|---|---|
| `priority === "must"` | **+20** | "You marked it a must-have" |
| `priority === "impulse"` | **−18** | "Flagged as an impulse buy" |
| `targetPrice` set AND `price ≤ targetPrice` | **+16** | "At or below your target price" |
| `targetPrice` set AND `price > targetPrice` | **−10** | "{diff} above your target" |
| ≥2 price points AND `firstPrice − latestPrice > 0` (dropped) | **+10** | "Price dropped {diff} since you saved it" |
| ≥2 price points AND rose | **−6** | "Price has risen since you saved it" |
| `budget` set AND `status === "want"` AND `price ≤ budget` | **+6** | "Fits within your monthly budget" |
| `budget` set AND `status === "want"` AND `price > budget` | **−12** | "More than your whole monthly budget" |
| cool-off active (`cooldownDays>0 && waitUntil` in future) | **−8** | "Still in a {n}-day cool-off" |
| cool-off elapsed (`waitUntil` in past) | **+12** | "You waited out the cool-off and still want it" |
| no cool-off AND `priority === "impulse"` | **−4** | "No cool-off set on an impulse buy" |
| item age ≥ 14 days AND `status !== "want"` | **+6** | "You've wanted this for {age} days" |
| `stock === "out"` | **−6** | "Currently out of stock" |
| `stock === "low"` | **+4** | "Low stock — may sell out" |
| `fav === true` (favourited) | **+4** | "One of your favourites" |

`price` = latest price point (fallback to `item.price`). `firstPrice` = first price point.

**Bands** (on the clamped score):
- `≥ 70` → **"Buy it"** (go) — "Worth getting — the signals line up"
- `≥ 48` → **"Leaning yes"** (cool) — "Promising — just check the budget"
- `≥ 28` → **"Hold off"** (decide) — "Give it more time before deciding"
- else → **"Skip it"** (skip) — "Not worth it right now"

Return `{ score, band, cls, verdict, reasons: [{delta, text}] }`, reasons sorted by `abs(delta)` desc. Show the top ~4 in the UI.

**V1 upgrade (do after parity):** once real price *history* exists, add signals like "£X above 90-day low" and "historically drops before month-end." Keep them as additional table rows so the core stays legible.

## 2. Budget roll-up — `lib/budget.ts`

Lists form a tree (`parentId`). Items belong to many lists.

- `subtreeIds(listId)` = the list + all descendants.
- `itemsInSubtree(listId)` = **unique** items (dedupe by id) whose `lists` intersect `subtreeIds`.
- `listSpent(listId)` = Σ latestPrice over `itemsInSubtree` (each item counted **once**).
- `listBought(listId)` = same but only `bought` items.
- `capState(spent, cap)`: no cap → `none`; `spent/cap > 1` → `over`; `≥ 0.9` → `warn`; else `ok`. (green / amber / red)

### Allocation attribution (for the breakdown bar)
Assign each unique item in the subtree to exactly one bucket so nothing double-counts:
```
for each item in itemsInSubtree(listId):
  placed = false
  for each direct child c of listId (in order):
    if item.lists intersects subtreeIds(c): bucket[c] += price(item); placed = true; break
  if not placed: directBucket += price(item)   # "items here"
```
Segments = non-empty child buckets + directBucket. Scale bar to `max(cap, total)`; draw a cap marker at `cap/scale`. Colour segments with the validated categorical palette (in prototype).

`childCapsAllocated(listId)` = Σ children `cap` → show "sub-list caps allocate £X of your £Y cap" and flag over-allocation.

## 3. Moment eligibility — `lib/moments.ts` (new, V1)

A pure function `evaluateMoments(item, ctx) -> Moment[]` that returns candidate nudges (the scheduler/worker decides *when* to actually send — see `docs/05`). Emit a candidate when:

- item's `price ≤ targetPrice` and not already notified for this crossing;
- item's domain has an active sale (`SaleSignal.found`), especially with a near `endsAt`;
- cool-off just elapsed AND decision band ≥ "Leaning yes" AND affordable;
- back-in-stock transition (`out|low → in`);
- a budget window opens (month start / user payday) → top affordable, high-score items.

Each Moment: `{ itemId, kind, priority, title, body, deeplink, dedupeKey }`. **Dedupe** on `dedupeKey` so the same crossing never fires twice. Ranking, batching, quiet-hours and frequency-capping happen in the delivery layer, not here.
