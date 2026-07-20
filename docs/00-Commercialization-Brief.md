# Basket — Commercialization & Roadmap Brief

*Prepared for Sagar · July 2026 · a candid assessment, not a pitch*

---

## 1. Where Basket stands today

What you have is a **polished, fully-working front-end prototype** — genuinely further than most "ideas." In one self-contained file it does: a universal basket, nested lists (Christmas → Mum/Dad/Kids), per-list spend caps that roll up and turn green/red, an allocation breakdown, a "Should I buy?" decision engine, price history with sparklines and drop detection, weekly price re-checks (on open + on demand), a best-effort site-wide sale scanner, profiles, dark mode, export/import, and a one-click capture bookmarklet.

The honest framing: this is a **convincing demo of the experience**, not yet a product someone else can rely on. Everything lives in one browser. The intelligence is real; the infrastructure underneath it is not there yet. That gap — demo to product — is the whole job from here, and it is a well-understood job.

---

## 2. The market reality (this space is real and contested)

This is not a blue ocean, and that's actually good news — it proves demand. The closest players:

- **Karma** — browser extension + app, price-drop alerts across stores, huge user base, monetises via **affiliate + coupons**.
- **Moonsift** — save from any site, collections, price-drop alerts, shareable registries; strong on the "aesthetic wishlist" angle.
- **WishUpon** — cross-web saving, price alerts, a discovery feed, **freemium subscription** (WishUpon Plus).
- **Elfster / Things To Get Me / GiftList** — lean into **gifting**: shared lists, item reservation (so two people don't buy the same gift), Secret Santa, group contributions.
- **CamelCamelCamel / price trackers** — deep on Amazon price history specifically.

**The gap Basket can own:** every competitor is strong on *one* axis — Karma on alerts, Moonsift on aesthetics, Elfster on gifting, Camel on history. **None of them combine budgeting + decision-making + nested/shared lists into one "should I actually buy this, and can I afford it across these lists" tool.** That "financial-discipline layer on top of a universal wishlist" is a defensible position nobody owns cleanly. Basket's nested spend caps and decision score are the seed of that.

---

## 3. What's genuinely left to be a commercial product

In rough priority order. Items 1–3 are the "make it real" core; the rest is scaling.

**1. A backend + accounts (the non-negotiable).** A server, a database, real login. This unlocks everything else: cross-device sync, shared lists, and server-side price checks that run while the app is closed. Without this you do not have a product, you have a clever local tool. *~4–8 weeks for a solid MVP.*

**2. A reliable price + product data pipeline.** The single hardest technical problem. Given a URL, reliably return name, image, current price, and "was" price, and re-check it daily. This is not one clean API — it's a blend of retailer feeds, structured-data parsing (Open Graph / JSON-LD / schema.org), affiliate-network product catalogs, and headless-browser scraping for the stubborn sites, plus anti-bot handling and a per-retailer maintenance burden. This is where real engineering money goes and where the moat partly lives. *Ongoing.*

**3. A real capture surface.** The bookmarklet is a demo. Commercial version = a **browser extension** (Chrome/Safari/Edge) and a **mobile share-sheet** ("Share → Basket" from any shopping app). This is table stakes — every competitor has it.

**4. Native mobile apps** (or a great installable PWA to start). Your users shop on their phones.

**5. Notifications** — push/email on price drop, back-in-stock, cool-off-ended, sale detected. This is the retention engine.

**6. Sharing & collaboration** — public/shared lists, gift reservation, group contributions. This is both a feature and your cheapest growth channel (every shared list is an ad).

**7. Trust & polish** — privacy policy, GDPR/data handling, onboarding, billing (Stripe), support.

---

## 4. How clever can we be — the differentiators worth building

This is where Basket stops being "another wishlist" and becomes something people pay for and tell friends about.

- **The decision engine, with real data behind it.** Right now the "Should I buy?" score uses your inputs. Feed it *actual price history* and it becomes genuinely smart: "This is £20 above its 90-day low — historically it drops before payday, wait ~9 days." That's a "buy now vs wait" call no competitor makes.
- **Budget-aware everything.** You already roll spend up through nested lists. Extend it: connect a monthly budget, and Basket tells you "buying this puts Christmas £40 over — here's the lowest-priority item to drop." **A wishlist that does maths on your behalf is the wedge.**
- **Shared gift lists with reservation + budget split.** "Christmas, £500, split across 3 people" that the *whole family* can see and claim from, without spoiling surprises. Gifting is the most viral, most seasonal, highest-intent use case.
- **Sale intelligence done properly.** Not just "is there a sale" — "3 items on your list are in a sale that ends Sunday, total saving £74." Bundling saved intent with live promotions is directly monetisable.
- **Agentic future.** The genuinely ambitious version: Basket watches your list, and when your rules are met (price hits target *and* it's in budget *and* cool-off passed), it tells you — or eventually, with your permission, checks out for you. "Universal basket → universal checkout" is the 10x vision.
- **Data as a moat.** Aggregate, anonymised "what people are saving and waiting to buy" is valuable demand-signal data to brands — a second business, handled carefully and transparently.

---

## 5. Business model & rough economics

Two proven, stackable revenue lines:

**Affiliate (primary, usage-based).** When a user buys through Basket, you earn a commission. Grounded 2026 category rates: **apparel 8–15%, home 8–12%, beauty 10–18%, electronics 5–10%, general DTC ~10–15%** (often first-order only). Illustrative: 10,000 active users, each buying £40/month of tracked items through Basket at a blended ~6% net commission ≈ **£24k/month**. It scales directly with engaged users and requires no per-user billing friction.

**Subscription (secondary, predictable).** Freemium: free tier (limited lists/items/alerts), "Basket Plus" (~£3–5/mo) for unlimited lists, instant price checks, advanced budgeting, and family sharing. At 10,000 users and a 5% conversion, that's another **~£2k/month** of recurring revenue and, more importantly, a signal of who your real fans are.

The affiliate line is the engine; subscription smooths it and hedges seasonality. Avoid ads — they'd undercut the "on your side" trust that is the brand.

---

## 6. Limitations & risks (the honest list)

**Technical**
- *Scraping is a treadmill, not a milestone.* Retailers change layouts, render prices via JavaScript, and deploy anti-bot defences. Coverage is never "done" — it's a maintained asset. Budget for it permanently.
- *No single price API covers everything.* You'll stitch affiliate catalogs + structured data + headless scraping, with graceful degradation when a site can't be read.
- *Cost scales with checks.* Daily re-checking N million items is real compute/proxy spend; you'll need smart scheduling (check hot items often, cold items rarely).

**Legal / policy**
- *Scraping retail prices sits in a grey area.* Public factual data (like price) is generally lower-risk, but many sites' terms prohibit automated access, and aggressive scraping invites blocks or letters. Prefer official affiliate product feeds and APIs where they exist; scrape as fallback, politely, and take counsel before scale.
- *Affiliate compliance* (FTC/ASA disclosure, cookie/consent, tax on commissions) and *data protection* (GDPR — you're holding shopping behaviour, which is sensitive) are non-optional once you have real users.

**Market**
- *Crowded.* Karma and others have scale and habit. You win by being *sharper for a specific job* (budget-disciplined, decision-making, family gifting), not by being "also a wishlist."
- *Seasonality.* Gifting spikes at Christmas; smoothing revenue across the year needs the everyday budgeting use case to stick.
- *Affiliate dependency.* Networks change rates and terms; concentration risk if one retailer dominates your volume.

**Product**
- *Retention is the real battle*, not capture. People save and forget. Notifications, budgets, and shared lists are what pull them back — they must be excellent.

---

## 7. Can we test it? Yes — cheaply, before heavy build

**Demand tests (do these first, ~£0–200):**
1. **Landing page on suhmantics.** Put the prototype (or a "coming soon + email capture") live. Describe the promise: "Every wishlist in one place, with a budget that keeps you honest." Measure email sign-ups per 100 visitors.
2. **Drive small paid traffic** (£50–100 of ads) to two different value propositions — "price tracker" vs "gift-budget planner" — and see which converts. This tells you the wedge cheaply.
3. **The prototype IS a test.** Ship the current file to 20–30 real people (friends, a subreddit, a gifting community before Christmas). Watch what they actually use — lists? scores? price checks? — via a tiny analytics ping. Their behaviour rewrites the roadmap.
4. **Concierge test.** For 10 users, *manually* check their saved prices each week and message them the changes. If they love the manual version, the automated one is worth building. If they shrug, you've saved months.

**Technical tests (the key unknown — is the data pipeline feasible?):**
5. **The price-fetch spike.** Take 50 product URLs across 10 real retailers and measure: for how many can we reliably extract price + image today, via structured data vs needing a headless browser? That single experiment de-risks the hardest part and tells us the true cost of coverage. *I can build and run this next.*
6. **The current front end is already tested** — every version was verified in a real headless browser (adding items, nested budget roll-ups, price-history logging, sale detection) with zero JS errors. That layer is sound.

---

## 8. Recommended next 90 days

1. **Weeks 1–2:** Landing page live on suhmantics + email capture + basic analytics. Run the two-message ad test. Run the 50-URL price-fetch spike (technical de-risk).
2. **Weeks 3–8:** If signal is positive — build the backend MVP: accounts, sync, and server-side daily price checks for a *curated* set of well-behaved retailers (start narrow, be reliable). Ship a Chrome extension for capture.
3. **Weeks 9–12:** Notifications (price drop / back in stock) and shared gift lists — timed to land **before the Christmas gifting peak**, which is your natural launch window and your most viral use case.

The sequence is deliberately: *prove people want it → make the hard data part real for a narrow slice → grow coverage and social features into the season.*

---

*Bottom line: the idea is validated by a real market, the experience is already built and tested, and the path to commercial is clear and conventional — a backend, a data pipeline, and a capture surface. The cleverness (budget-aware decisions + family gifting) is what makes it more than "another wishlist." The main risks are the scraping treadmill and a crowded field, both survivable with focus. The next honest step is small and cheap: a landing page to test demand and a 50-URL spike to test the data pipeline.*
