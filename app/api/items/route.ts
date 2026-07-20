/**
 * Items collection API (ticket E2-1, contract in docs/03).
 *   GET  /api/items  — the caller's items (filters: list, status, fav, q)
 *   POST /api/items  — create; price (minor units) also writes a PricePoint
 * Every query is scoped to the signed-in user; list ids are ownership-checked.
 */
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";
import {
  itemCreateSchema,
  itemListQuerySchema,
  resolveWaitUntil,
  serializeItem,
} from "@/lib/api/items";
import { domainOf } from "@/lib/url";

export async function GET(request: Request) {
  try {
    const { id: userId } = await requireUser();
    const url = new URL(request.url);
    const parsed = itemListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return Response.json({ error: "invalid_query", details: parsed.error.flatten() }, { status: 400 });
    }
    const { list, status, fav, q } = parsed.data;
    const rows = await prisma.item.findMany({
      where: {
        userId,
        ...(list ? { lists: { some: { listId: list } } } : {}),
        ...(status ? { status } : {}),
        ...(fav ? { fav: true } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { category: { contains: q, mode: "insensitive" } },
                { notes: { contains: q, mode: "insensitive" } },
                { code: { contains: q, mode: "insensitive" } },
                { tags: { has: q.toLowerCase() } },
              ],
            }
          : {}),
      },
      include: {
        lists: { select: { listId: true } },
        prices: { select: { price: true, checkedAt: true, source: true }, orderBy: { checkedAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ items: rows.map(serializeItem) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const { id: userId } = await requireUser();
    const body = await request.json().catch(() => null);
    const parsed = itemCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    if (input.lists.length) {
      const owned = await prisma.list.count({ where: { id: { in: input.lists }, ownerId: userId } });
      if (owned !== new Set(input.lists).size) {
        return Response.json({ error: "unknown_list", message: "one or more list ids are not yours" }, { status: 400 });
      }
    }

    const now = Date.now();
    const waitUntil = resolveWaitUntil(input.cooldownDays, 0, null, now);
    const row = await prisma.item.create({
      data: {
        userId,
        name: input.name,
        url: input.url,
        domain: domainOf(input.url),
        imageUrl: input.imageUrl,
        currency: input.currency,
        price: input.price,
        targetPrice: input.targetPrice,
        stock: input.stock,
        category: input.category,
        tags: input.tags,
        code: input.code,
        status: input.status,
        priority: input.priority,
        cooldownDays: input.cooldownDays,
        waitUntil: waitUntil ? new Date(waitUntil) : null,
        notes: input.notes,
        bought: input.bought,
        fav: input.fav,
        ...(input.price != null ? { prices: { create: [{ price: input.price, source: "manual" }] } } : {}),
        lists: { create: [...new Set(input.lists)].map((listId) => ({ listId })) },
      },
      include: { lists: { select: { listId: true } } },
    });
    return Response.json({ item: serializeItem(row) }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
