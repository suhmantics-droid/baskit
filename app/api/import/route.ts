/**
 * POST /api/import — bring a demo (prototype) JSON export into the signed-in
 * account, so nobody loses their basket to cleared browser data. Additive:
 * existing account data is untouched. Prototype money is major units (£12.50);
 * everything converts to integer minor units on the way in.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";
import { toMinorUnits } from "@/lib/format";
import { domainOf } from "@/lib/url";

const CUR_MAP: Record<string, string> = { "£": "GBP", $: "USD", "€": "EUR", "₹": "INR", "¥": "JPY" };

const protoList = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  emoji: z.string().max(8).optional().nullable(),
  parentId: z.string().nullable().optional(),
  cap: z.number().min(0).max(1_000_000).nullable().optional(),
  due: z.string().nullable().optional(),
});

const protoItem = z.object({
  name: z.string().trim().min(1).max(300),
  url: z.string().max(2000).optional().nullable(),
  img: z.string().max(2000).optional().nullable(),
  cur: z.string().max(4).optional().nullable(),
  price: z.number().min(0).max(1_000_000).optional().nullable(),
  targetPrice: z.number().min(0).max(1_000_000).optional().nullable(),
  stock: z.string().optional().nullable(),
  cat: z.string().max(80).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  code: z.string().max(60).optional().nullable(),
  status: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  cooldownDays: z.number().int().min(0).max(365).optional(),
  waitUntil: z.number().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  bought: z.boolean().optional(),
  boughtAt: z.number().optional().nullable(),
  fav: z.boolean().optional(),
  created: z.number().optional(),
  lists: z.array(z.string()).max(50).optional(),
  priceHistory: z.array(z.object({ t: z.number(), p: z.number().min(0).max(1_000_000) })).max(200).optional(),
});

const exportSchema = z.object({
  profiles: z.array(z.object({ id: z.string() })).min(1),
  current: z.string().nullable().optional(),
  items: z.record(z.string(), z.array(protoItem).max(500)),
  lists: z.record(z.string(), z.array(protoList).max(200)),
});

const oneOf = (v: string | null | undefined, allowed: string[], fallback: string) =>
  v && allowed.includes(v) ? v : fallback;
const httpUrl = (v: string | null | undefined) => (v && /^https?:\/\//i.test(v) ? v : null);

export async function POST(request: Request) {
  try {
    const { id: userId } = await requireUser();
    const body = await request.json().catch(() => null);
    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "not_a_baskit_backup", details: parsed.error.flatten() }, { status: 400 });
    }
    const db = parsed.data;
    const profileId = db.current && db.items[db.current] ? db.current : db.profiles[0].id;
    const lists = db.lists[profileId] ?? [];
    const items = db.items[profileId] ?? [];

    // lists first, parents before children (walk until no progress)
    const idMap = new Map<string, string>();
    let remaining = [...lists];
    while (remaining.length) {
      const ready = remaining.filter((l) => !l.parentId || idMap.has(l.parentId));
      if (!ready.length) break; // orphaned parents: import the rest as top-level
      for (const l of ready) {
        const row = await prisma.list.create({
          data: {
            ownerId: userId,
            name: l.name,
            emoji: l.emoji || "🗂",
            parentId: l.parentId ? (idMap.get(l.parentId) ?? null) : null,
            cap: l.cap != null ? toMinorUnits(l.cap) : null,
            dueDate: l.due ? new Date(`${l.due}T00:00:00Z`) : null,
          },
        });
        idMap.set(l.id, row.id);
      }
      remaining = remaining.filter((l) => !idMap.has(l.id));
    }
    for (const l of remaining) {
      const row = await prisma.list.create({
        data: { ownerId: userId, name: l.name, emoji: l.emoji || "🗂", cap: l.cap != null ? toMinorUnits(l.cap) : null },
      });
      idMap.set(l.id, row.id);
    }

    let importedItems = 0;
    for (const it of items) {
      const currency = CUR_MAP[it.cur ?? "£"] ?? "GBP";
      const history = (it.priceHistory ?? []).map((h) => ({
        price: toMinorUnits(h.p, currency),
        source: "manual",
        checkedAt: new Date(h.t),
      }));
      const latest = history.length ? history[history.length - 1].price : it.price != null ? toMinorUnits(it.price, currency) : null;
      const url = httpUrl(it.url);
      await prisma.item.create({
        data: {
          userId,
          name: it.name,
          url,
          domain: domainOf(url),
          imageUrl: httpUrl(it.img),
          currency,
          price: latest,
          targetPrice: it.targetPrice != null ? toMinorUnits(it.targetPrice, currency) : null,
          stock: oneOf(it.stock, ["in", "low", "out", "unknown"], "unknown"),
          category: it.cat?.trim() || null,
          tags: (it.tags ?? []).filter(Boolean),
          code: it.code?.trim() || null,
          status: oneOf(it.status, ["want", "later", "research"], "want"),
          priority: oneOf(it.priority, ["must", "nice", "impulse"], "nice"),
          cooldownDays: it.cooldownDays ?? 0,
          waitUntil: it.waitUntil ? new Date(it.waitUntil) : null,
          notes: it.notes?.trim() || null,
          bought: it.bought ?? false,
          boughtAt: it.boughtAt ? new Date(it.boughtAt) : null,
          fav: it.fav ?? false,
          createdAt: it.created ? new Date(it.created) : undefined,
          ...(history.length ? { prices: { create: history } } : {}),
          lists: {
            create: (it.lists ?? [])
              .map((old) => idMap.get(old))
              .filter((x): x is string => Boolean(x))
              .map((listId) => ({ listId })),
          },
        },
      });
      importedItems++;
    }

    return Response.json({ ok: true, importedItems, importedLists: idMap.size });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
