# Hosting — the free-tier stack (and when "free" ends)

You asked "what's free?" — here's a genuinely £0 way to run the whole thing to start, plus the honest limits and the switch-when-you-grow path.

## Zero-cost MVP stack

| Piece | Free option | Free-tier reality | Switch to when… |
|---|---|---|---|
| **App hosting** | **Vercel Hobby** | Generous for a Next.js app; easy deploys. **But Hobby is non-commercial** per Vercel's terms. | You start charging / show ads → **Vercel Pro (~$20/mo)** or move to **Cloudflare Pages** (free tier allows commercial) / **Netlify**. |
| **Database** | **Neon** free (~0.5 GB, autosuspend) or **Supabase** free (500 MB, pauses after inactivity) | Fine for thousands of items. Autosuspend adds cold-start latency. | Steady traffic / >0.5 GB → paid Neon/Supabase (~$19/mo) or a small managed Postgres. |
| **Scheduled jobs** (price checks) | **Cloudflare Workers Cron** (free, generous) or **GitHub Actions** scheduled workflow (free minutes) hitting `/api/cron/*` | Vercel Hobby cron is limited (roughly once/day) — don't rely on it for frequent checks. Cloudflare/GH Actions is the free workaround. | High check volume → a dedicated worker/queue. |
| **Headless scraping** | Runs inside a Cloudflare/GH-Actions job or on-demand; **Browserless**/ScrapingBee have small free tiers | Playwright is heavy — keep it a fallback, cap runs. | Volume → paid scraping infra + proxies. |
| **Auth** | **Auth.js** (free, self-hosted) or **Supabase Auth** / **Clerk** free (~10k MAU) | Plenty for launch. | — |
| **Email** | **Resend** free (~3k emails/mo) | Enough for early Moments. | More volume → Resend paid / Postmark. |
| **Web push** | Free (VAPID, no vendor) | — | — |
| **Domain** | You already own **suhmantics** | — | — |

**Net:** you can run Basket for **£0** until it has real traction. The two things that push you off free are (a) going commercial on Vercel Hobby, and (b) database size/uptime. Both are ~$20/mo switches, not architectural rewrites.

## Recommended free starting configuration

- **Next.js on Vercel Hobby** (dev/preview) → plan to move to **Cloudflare Pages** at monetisation (keeps it free & commercial-OK, and co-locates with the Workers cron).
- **Neon** Postgres free.
- **Cloudflare Workers Cron** calling `/api/cron/price-check`, `/api/cron/scan-sales`, `/api/cron/dispatch-moments` with the `CRON_SECRET` header.
- **Auth.js** + **Resend** + **VAPID** web push.

Keep everything behind env vars (`.env.example`) so swapping a provider is a config change, not a refactor.

## Cost guardrails to build in from day one

- **Tiered checks** (`docs/05`) so you're not re-scraping cold items daily.
- **Cache** SaleSignal per domain (shared across users).
- **Cap** headless runs per cron invocation.
- Log how many checks/scrapes ran per day so cost is visible before it bites.
