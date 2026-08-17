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
import { extractWithFallback } from "@/lib/extract";
import { evaluateMoments } from "@/lib/moments";
import { evaluateOccasion } from "@/lib/occasions";
import { toDomainItem } from "@/lib/api/items";
import { domainOf } from "@/lib/url";
import { pushToUser } from "@/lib/push";
import { applyBlobPrice, collectDue, isNotifiableDrop, type BlobTarget } from "@/lib/blob-sweep";
import type { ProtoDb } from "@/lib/merge-basket";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Stock, Item } from "@/lib/types";

export const maxDuration = 60;

const HOUR = 3_600_000;
const HOT_MS = 22 * HOUR; // "daily" with slack so a 06:00 cron never self-skips
const WARM_MS = 70 * HOUR; // ~3 days
const SLOW_MS = 158 * HOUR; // ~weekly
const BATCH = 25;
const DEADLINE_MS = 45_000; // leave headroom under maxDuration for DB writes

/**
 * The row sweep stops early so the blob sweep is guaranteed a slice. Almost every
 * real basket today lives in a blob, so letting rows eat the whole budget would
 * starve the only users who have items.
 */
const ROW_DEADLINE_MS = 24_000;
const BLOB_USERS = 25;
const BLOB_PER_USER = 6;

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
    pushed: 0,
    deadlineHit: false,
    // Prototype baskets (User.demoBackup), which the query above cannot see.
    blobUsers: 0,
    blobAttempted: 0,
    blobUpdated: 0,
    blobChanged: 0,
    blobRefused: 0,
  };

  for (const item of due) {
    if (Date.now() - started > ROW_DEADLINE_MS) {
      stats.deadlineHit = true;
      break;
    }
    stats.attempted++;
    // Nobody is waiting overnight — escalate blocked/slow stores to stealth.
    const outcome = await extractWithFallback(item.url!, 15_000);
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
    stats.momentsCreated += await recordMoments(item.userId, moments, stats);
    await new Promise((r) => setTimeout(r, 300)); // pacing between stores
  }

  // ---- Prototype baskets ------------------------------------------------
  // Everything above only sees Item rows. The prototype keeps a whole basket as
  // one JSON blob on the user, so until now not a single item anybody actually
  // saved was ever checked overnight — prices only moved while the page was
  // open, which is why the price engine looked like it did nothing.
  const blobOwners = await prisma.user.findMany({
    where: { demoBackup: { not: Prisma.DbNull } },
    select: { id: true, demoBackup: true, monthlyBudget: true },
    take: BLOB_USERS,
  });

  for (const owner of blobOwners) {
    if (Date.now() - started > DEADLINE_MS) {
      stats.deadlineHit = true;
      break;
    }
    const targets = collectDue(
      owner.demoBackup as unknown as ProtoDb,
      Date.now(),
      SLOW_DOMAINS,
      BLOB_PER_USER,
    );
    if (!targets.length) continue;
    stats.blobUsers++;

    // Fetch first, write once. Holding the blob across network calls would risk
    // publishing a stale copy of somebody's entire basket over a sync that
    // landed mid-sweep.
    const fetched: Array<{
      target: BlobTarget;
      priceMinor: number;
      currency: string;
      availability?: string | null;
      method?: string;
    }> = [];

    for (const target of targets) {
      if (Date.now() - started > DEADLINE_MS) {
        stats.deadlineHit = true;
        break;
      }
      stats.blobAttempted++;
      const outcome = await extractWithFallback(target.url, 15_000);
      const ex = outcome.extracted;
      if (!ex) {
        if (outcome.blocked) stats.blocked++;
        else stats.unreadable++;
      } else {
        fetched.push({
          target,
          priceMinor: ex.priceMinor,
          currency: ex.currency,
          availability: ex.availability,
          method: ex.method,
        });
      }
      await new Promise((r) => setTimeout(r, 300)); // pacing between stores
    }
    if (!fetched.length) continue;

    // Re-read immediately before writing so a sync that happened during the
    // fetches is preserved; we only ever touch the items we just checked.
    const latest = await prisma.user.findUnique({
      where: { id: owner.id },
      select: { demoBackup: true },
    });
    let blob = (latest?.demoBackup ?? owner.demoBackup) as unknown as ProtoDb;
    const now = Date.now();
    const drops: Array<{ target: BlobTarget; previous: number; next: number }> = [];

    for (const f of fetched) {
      const applied = applyBlobPrice(blob, f.target, f, now);
      blob = applied.blob;
      if (!applied.applied) {
        if (applied.refused === "currency_mismatch") stats.blobRefused++;
        continue;
      }
      stats.blobUpdated++;
      if (applied.changed) stats.blobChanged++;
      if (isNotifiableDrop(applied.previous, applied.next, f.target.targetPrice)) {
        drops.push({ target: f.target, previous: applied.previous!, next: applied.next! });
      }
    }

    await prisma.user.update({
      where: { id: owner.id },
      // Bumping the timestamp is deliberate: it tells the next sync the cloud
      // copy is newer, so the browser pulls the fresh prices in.
      data: {
        demoBackup: blob as unknown as Prisma.InputJsonValue,
        demoBackupAt: new Date(now),
      },
    });

    // Blob items have no Item row, so moments carry a null itemId and deep-link
    // into the prototype by id instead.
    const moments = drops.map((d) => ({
      itemId: null,
      kind: "price_drop",
      title: `${d.target.name} dropped to ${d.target.currency}${round2(d.next)}`,
      body:
        d.target.targetPrice != null && d.next <= d.target.targetPrice
          ? `That is at or below your target of ${d.target.currency}${round2(d.target.targetPrice)}.`
          : `Down ${d.target.currency}${round2(d.previous - d.next)} from ${d.target.currency}${round2(d.previous)}.`,
      deeplink: `/prototype.html#item=${d.target.itemId}`,
      dedupeKey: `blob:${owner.id}:${d.target.itemId}:${d.next}`,
    }));
    stats.momentsCreated += await recordMoments(owner.id, moments, stats);
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
    stats.momentsCreated += await recordMoments(item.userId, moments, stats);
  }

  // Occasion reminders (P1): dated lists get a well-timed nudge with unbought
  // count + remaining budget. Pure logic in lib/occasions; deduped per date so
  // each occasion pings once. No fetching — cheap.
  const dueLists = await prisma.list.findMany({
    where: { dueDate: { not: null } },
    select: {
      id: true,
      name: true,
      emoji: true,
      parentId: true,
      cap: true,
      dueDate: true,
      ownerId: true,
      items: { select: { item: { select: { id: true, bought: true, price: true } } } },
    },
    take: 500,
  });
  for (const l of dueLists) {
    const domainList = {
      id: l.id,
      name: l.name,
      emoji: l.emoji,
      parentId: l.parentId,
      cap: l.cap,
      dueDate: l.dueDate ? l.dueDate.getTime() : null,
    };
    const items = l.items.map((il) => occasionItem(il.item));
    const moment = evaluateOccasion(domainList, items, { now: Date.now() });
    if (moment) {
      stats.momentsCreated += await recordMoments(l.ownerId, [moment], stats);
    }
  }

  return Response.json({ ok: true, tookMs: Date.now() - started, ...stats });
}

/** Prototype prices are floats; notification copy should never read "£56.0747". */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Minimal Item for occasion evaluation — only `bought` and the latest price matter. */
function occasionItem(row: { id: string; bought: boolean; price: number | null }): Item {
  return {
    id: row.id,
    name: "",
    currency: "GBP",
    stock: "unknown",
    tags: [],
    status: "want",
    priority: "nice",
    cooldownDays: 0,
    bought: row.bought,
    fav: false,
    createdAt: 0,
    lists: [],
    price: row.price,
    prices: [],
  };
}

/**
 * Persist moment candidates (deduped on dedupeKey) and push ONLY the genuinely
 * new ones to the user's devices — skipDuplicates means a re-crossing that
 * already fired never pings twice.
 */
async function recordMoments(
  userId: string,
  // Widened from MomentCandidate so per-list occasion moments (no itemId) go
  // through the same dedupe + push path as per-item moments.
  moments: Array<{
    itemId?: string | null;
    kind: string;
    title: string;
    body: string;
    deeplink: string;
    dedupeKey: string;
  }>,
  stats: { pushed: number },
): Promise<number> {
  if (!moments.length) return 0;
  const before = await prisma.moment.findMany({
    where: { dedupeKey: { in: moments.map((m) => m.dedupeKey) } },
    select: { dedupeKey: true },
  });
  const seen = new Set(before.map((b) => b.dedupeKey));
  const created = await prisma.moment.createMany({
    data: moments.map((m) => ({
      userId,
      itemId: m.itemId ?? null,
      kind: m.kind,
      title: m.title,
      body: m.body,
      deeplink: m.deeplink,
      dedupeKey: m.dedupeKey,
    })),
    skipDuplicates: true,
  });
  for (const m of moments) {
    if (seen.has(m.dedupeKey)) continue;
    stats.pushed += await pushToUser(userId, {
      title: m.title,
      body: m.body,
      deeplink: m.deeplink,
      tag: m.dedupeKey,
    });
  }
  return created.count;
}
