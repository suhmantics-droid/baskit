# Basket — Product Spec

The reference for *what* to build. Behaviour and look come from `prototype/basket-prototype.html` (open it, "Load samples"). This doc adds the commercial features the prototype only gestures at.

## 1. The core promise

> Every wishlist in one place — with a budget that keeps you honest, a nudge when the moment's right, and an answer to "should I actually buy this?"

Three pillars:
1. **Capture** anything from any store, into nested lists.
2. **Discipline** — nested spend caps that roll up, and a buy/wait decision score.
3. **Moments** — the reminder that arrives at the perfect time (see §4). This is the retention + revenue engine.

## 2. Users & top jobs

- **The forgetful shopper** — fills carts, gets distracted, forgets. Wants to be reminded *at the right moment* (the LinkedIn/Nykaa story — see `docs/00`). → Moments.
- **The disciplined buyer** — avoids impulse spend, wants "wait vs buy" and budget guardrails. → Decision engine + budgets.
- **The gift planner** — Christmas/birthdays, a total budget split across people, no double-buying. → Nested lists, caps, shared lists + reservation.

## 3. Feature set (MVP → V1)

### Lists & items (port from prototype)
- Items: name, url, image, price, currency, target price, stock, category, tags, discount code, status (want / later / researching), priority, cool-off, notes, **bought** flag.
- **Nested lists** with icon, name, parent, **spend cap**, optional date.
- Item ∈ many lists (many-to-many).

### Budgets (port exactly — `docs/04`)
- Per-list cap; **spend rolls up** through the subtree; green / amber(≥90%) / red(over).
- Allocation breakdown: where a list's spend goes across its sub-lists + direct items; how much of the cap is allocated to sub-lists.
- Account-level monthly budget for "want now" items.

### Decision engine (port exactly — `docs/04`)
- 0–100 score with reasons; bands: Buy it / Leaning yes / Hold off / Skip it.
- Cool-off timers ("decide in N days"), and "cool-off finished — decide now."

### Price tracking
- Price history per item, sparkline, drop vs "was", target-hit flag.
- **Server-side daily re-checks** (not just on-open) — `docs/05`.
- Manual "check now."

### Sale intelligence
- Detect site-wide sales and **item-level** discounts.
- "3 items on your list are in a sale ending Sunday — save £74 total."

### 4. Moments engine ⭐ (the differentiator — new)

The feature the Nykaa story is really about. Basket knows the user's **intent** (saved items, budget, decision score, cool-off state) and the **world's state** (price drops, sale windows, back-in-stock, deadlines). A Moment is a *well-timed, low-friction nudge* that fuses the two.

**Triggers (examples):**
- A saved item (or a whole store's worth of saved items) enters a **sale**, especially a **closing** one: *"6 items you saved from Nykaa are in the Hot Pink Sale — up to 60% off, ends 26 Jul."*
- Price **hits or crosses your target**.
- **Cool-off ended** AND still in budget AND price is fair → *"You waited two weeks and still want it. It's £12 under when you saved it. Now's a good moment."*
- **Back in stock** / **low stock** on a wanted item.
- A **budget window** opens (e.g. new month, or user-set "payday") → surface the highest-scoring affordable items.

**Timing & tone (this is the craft):**
- Batch and rank — one great nudge beats five noisy ones. Respect quiet hours and a per-user frequency cap.
- Deep-link straight to the item/checkout, disclosing affiliate where relevant.
- Every Moment is explainable ("why am I seeing this?") and one-tap snooze/mute. **Never naggy — "a reminder without feeling like one."**

**Why it matters:** it's the retention loop (brings users back), the conversion event (where affiliate revenue happens), and the emotional hook (Basket feels like it's *on your side*, unlike a brand's ad which only serves that brand).

### Capture surfaces (commercial)
- **Browser extension** (Chrome/Safari/Edge) — one-click save with auto price/image.
- **Mobile share-sheet** ("Share → Basket") — PWA share target to start.
- Bookmarklet stays as a fallback.

### Sharing & gifting (V1, timed for Christmas)
- Share a list (view/collaborate). **Reserve** an item so gift-givers don't double-buy, without spoiling it for the owner.
- Optional group budget split.

### Accounts & settings
- Email + OAuth sign-in. Cross-device sync. Currency. Notification prefs (channels, quiet hours, frequency). Data export/delete (GDPR).

## 5. Screens

Home (all items) · List view (with budget header + allocation + sub-list cards) · Item detail (score, price history, price-check, lists) · **Moments/Activity feed** (new — the timed nudges live here too) · Insights (budgets, spend by category, lists vs caps) · Sales · Settings. Sidebar = list tree with roll-up mini-bars. Match the prototype's warm-minimal aesthetic and dark mode.

## 6. Design tokens (from prototype)

Light: bg `#fafaf8`, surface `#fff`, ink `#16130f`, line `#ece9e3`, good `#2f7d5b`, warn `#a86b1f`, bad `#b23b3b`, accent `#2a78d6`. Dark values in the prototype's `:root[data-theme="dark"]`. Categorical chart palette (validated) also in prototype. Radius 14px, system sans, generous whitespace, thin marks.

## 7. Non-goals (for now)

Actual automated checkout (Moments deep-link to the retailer instead — agentic checkout is a later bet), a social discovery feed, and building our own payment/checkout. Keep scope on capture → discipline → moments.
