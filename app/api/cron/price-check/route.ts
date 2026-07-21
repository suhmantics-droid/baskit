/**
 * GET /api/cron/price-check (tickets E3-5 + E4-1) — the daily sweep that keeps
 * prices honest while nobody's looking, and turns real changes into Moments.
 *
 * Tiered selection (docs/spike/E3-1-findings.md):
 *   hot  — has a target price, or never checked   → daily
 *   warm — everything else with a URL             → every ~3 days
 *   slow — Tier C/D domains that block plain fetches → weekly attempt
 * Stalest first, hard batch cap, and a wall-clock deadline: whatever doesn't
 * fit stays stale and is first in line tomorrow. Blocked stores are recorded,
 * never hammered.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically
 * once the env var exists. Without the env var the route refuses to run.
 */
import { prisma } from "@/lib/db";
import { extractFromUrl } from "@/lib/extract";
import { evaluateMoments } from "@/lib/moments";
import { toDomainItem } from "@/lib/api/items";
import { domainOf } from "@/lib/url";
import type { Stock } from "@/lib/types";

export const maxDuration = 60;

const HOUR = 3_600_000;
const HOT_MS = 22 * HOUR; // "daily" with slack so a 06:00 cron never self-skips
const WARM_MS = 70 * HOUR; // ~3 days
const SLOW_MS = 158 * HOUR; // ~weekly
const BATCH = 25;
const DEADLINE_MS = 45_000; // leave headroom under maxDuration for DB writes

/** Domains the spike showed block plain server fetches — weekly attempts only. */
const SLOW_DOMAINS = new Set([
  "lego.com",
  "argos.co.uk",
  "currys.co.uk",
  "boots.com",
  "next.co.uk",
  "hm.com",
  "waterstones.com",
  "ebay.co.uk",
  "etsy.com",
  "ao.com",
  "decathlon.co.uk",
]);

function isDue(item: { lastCheckedAt: Date | null; targetPrice: number | null; url: string | null }, now: number): boolean {
  const age = now - (item.lastCheckedAt?.getTime() ?? 0);
  const domain = domainOf(item.url);
  if (domain && SLOW_DOMAINS.has(domain)) return age > SLOW_MS;
  if (item.targetPrice != null || item.lastCheckedAt == null) return age > HOT_MS;
  return age > WARM_MS;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const candidates = await prisma.item.findMany({
    where: { url: { not: null }, bought: false },
    include: {
      user: { select: { monthlyBudget: true } },
      lists: { select: { listId: true } },
    },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
  });

  const due = candidates.filter((c) => isDue(c, started)).slice(0, BATCH);
  const stats = {
    candidates: candidates.length,
    due: candidates.filter((c) => isDue(c, started)).length,
    attempted: 0,
    updated: 0,
    priceChanged: 0,
    blocked: 0,
    unreadable: 0,
    momentsCreated: 0,
    deadlineHit: false,
  };

  for (const item of due) {
    if (Date.now() - started > DEADLINE_MS) {
      stats.deadlineHit = true;
      break;
    }
    stats.attempted++;
    const outcome = await extractFromUrl(item.url!);
    const now = new Date();
    const ex = outcome.extracted;
    if (!ex) {
      if (outcome.blocked) stats.blocked++;
      else stats.unreadable++;
      await prisma.item.update({ where: { id: item.id }, data: { lastCheckedAt: now } });
      continue;
    }
    const changed = ex.priceMinor !== item.price;
    const row = await prisma.item.update({
      where: { id: item.id },
      data: {
        lastCheckedAt: now,
        price: ex.priceMinor,
        currency: ex.currency,
        ...(ex.availability ? { stock: ex.availability } : {}),
        ...(changed ? { prices: { create: [{ price: ex.priceMinor, source: ex.method }] } } : {}),
      },
      include: { lists: { select: { listId: true } } },
    });
    stats.updated++;
    if (changed) stats.priceChanged++;

    const moments = evaluateMoments(toDomainItem(row), {
      now: now.getTime(),
      budget: item.user.monthlyBudget,
      previousStock: item.stock as Stock,
      previousPrice: item.price,
    });
    if (moments.length) {
      const created = await prisma.moment.createMany({
        data: moments.map((m) => ({
          userId: item.userId,
          itemId: m.itemId,
          kind: m.kind,
          title: m.title,
          body: m.body,
          deeplink: m.deeplink,
          dedupeKey: m.dedupeKey,
        })),
        skipDuplicates: true,
      });
      stats.momentsCreated += created.count;
    }
    await new Promise((r) => setTimeout(r, 300)); // pacing between stores
  }

  // Cheap second pass, no fetching: cool-offs that finished since last sweep.
  const coolDue = await prisma.item.findMany({
    where: { bought: false, cooldownDays: { gt: 0 }, waitUntil: { lte: new Date() } },
    include: { user: { select: { monthlyBudget: true } }, lists: { select: { listId: true } } },
    take: 200,
  });
  for (const item of coolDue) {
    const moments = evaluateMoments(toDomainItem(item), {
      now: Date.now(),
      budget: item.user.monthlyBudget,
    }).filter((m) => m.kind === "cooloff_done");
    if (moments.length) {
      const created = await prisma.moment.createMany({
        data: moments.map((m) => ({
          userId: item.userId,
          itemId: m.itemId,
          kind: m.kind,
          title: m.title,
          body: m.body,
          deeplink: m.deeplink,
          dedupeKey: m.dedupeKey,
        })),
        skipDuplicates: true,
      });
      stats.momentsCreated += created.count;
    }
  }

  return Response.json({ ok: true, tookMs: Date.now() - started, ...stats });
}
