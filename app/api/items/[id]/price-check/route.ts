/**
 * POST /api/items/:id/price-check (ticket E3-4) — run the extraction ladder on
 * the item's URL right now. A changed price logs a PricePoint (source = ladder
 * method); identical prices just refresh lastCheckedAt so history stays a list
 * of real changes. Blocked stores are an outcome, not an error (spike #6).
 */
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";
import { serializeItem, toDomainItem } from "@/lib/api/items";
import { scoreItem } from "@/lib/decision";
import { extractFromUrl } from "@/lib/extract";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const { id } = await ctx.params;
    const item = await prisma.item.findFirst({ where: { id, userId } });
    if (!item) return Response.json({ error: "not_found" }, { status: 404 });
    if (!item.url) return Response.json({ error: "no_url" }, { status: 400 });

    const outcome = await extractFromUrl(item.url);
    const now = new Date();
    const ex = outcome.extracted;
    const priceChanged = ex != null && ex.priceMinor !== item.price;

    const row = await prisma.item.update({
      where: { id },
      data: {
        lastCheckedAt: now,
        ...(ex
          ? {
              price: ex.priceMinor,
              currency: ex.currency,
              ...(ex.availability ? { stock: ex.availability } : {}),
              ...(priceChanged
                ? { prices: { create: [{ price: ex.priceMinor, source: ex.method }] } }
                : {}),
            }
          : {}),
      },
      include: {
        lists: { select: { listId: true } },
        prices: { select: { price: true, checkedAt: true, source: true }, orderBy: { checkedAt: "asc" } },
      },
    });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { monthlyBudget: true } });
    const decision = scoreItem(toDomainItem(row), { now: Date.now(), budget: user?.monthlyBudget ?? null });

    return Response.json({
      item: serializeItem(row),
      decision,
      check: {
        ok: outcome.ok,
        blocked: outcome.blocked,
        method: ex?.method ?? null,
        confidence: ex?.confidence ?? null,
        priceChanged,
        previousPrice: item.price,
        note: outcome.note,
      },
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
