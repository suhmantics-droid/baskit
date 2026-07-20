/**
 * Single-item API (ticket E2-1, contract in docs/03).
 *   GET    /api/items/:id  — item + price history + derived decision score
 *   PATCH  /api/items/:id  — partial edit; a changed price logs a PricePoint
 *   DELETE /api/items/:id
 * 404 for anything the caller doesn't own (no existence leak).
 */
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";
import { itemUpdateSchema, resolveWaitUntil, serializeItem, toDomainItem } from "@/lib/api/items";
import { scoreItem } from "@/lib/decision";
import { domainOf } from "@/lib/url";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "not_found" }, { status: 404 });

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const { id } = await ctx.params;
    const row = await prisma.item.findFirst({
      where: { id, userId },
      include: {
        lists: { select: { listId: true } },
        prices: { select: { price: true, checkedAt: true, source: true }, orderBy: { checkedAt: "asc" } },
      },
    });
    if (!row) return notFound();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { monthlyBudget: true } });
    const decision = scoreItem(toDomainItem(row), { now: Date.now(), budget: user?.monthlyBudget ?? null });
    return Response.json({ item: serializeItem(row), decision });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);
    const parsed = itemUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const existing = await prisma.item.findFirst({
      where: { id, userId },
      include: { lists: { select: { listId: true } } },
    });
    if (!existing) return notFound();

    if (input.lists?.length) {
      const owned = await prisma.list.count({ where: { id: { in: input.lists }, ownerId: userId } });
      if (owned !== new Set(input.lists).size) {
        return Response.json({ error: "unknown_list", message: "one or more list ids are not yours" }, { status: 400 });
      }
    }

    const now = Date.now();
    const priceChanged = input.price !== undefined && input.price !== existing.price;
    const waitUntil =
      input.cooldownDays !== undefined
        ? resolveWaitUntil(
            input.cooldownDays,
            existing.cooldownDays,
            existing.waitUntil ? existing.waitUntil.getTime() : null,
            now,
          )
        : undefined;

    const row = await prisma.item.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined ? { url: input.url, domain: domainOf(input.url) } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.targetPrice !== undefined ? { targetPrice: input.targetPrice } : {}),
        ...(input.stock !== undefined ? { stock: input.stock } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.cooldownDays !== undefined ? { cooldownDays: input.cooldownDays } : {}),
        ...(waitUntil !== undefined ? { waitUntil: waitUntil ? new Date(waitUntil) : null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.bought !== undefined ? { bought: input.bought } : {}),
        ...(input.fav !== undefined ? { fav: input.fav } : {}),
        ...(priceChanged && input.price != null
          ? { prices: { create: [{ price: input.price, source: "manual" }] } }
          : {}),
        ...(input.lists !== undefined
          ? { lists: { deleteMany: {}, create: [...new Set(input.lists)].map((listId) => ({ listId })) } }
          : {}),
      },
      include: { lists: { select: { listId: true } } },
    });
    return Response.json({ item: serializeItem(row) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const { id } = await ctx.params;
    const existing = await prisma.item.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) return notFound();
    await prisma.item.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
