/**
 * Anonymous gift reservation (ticket E5-2): POST /api/s/:token/reserve
 * {itemId, name}. No account needed. One reservation per item (DB-enforced).
 * The list owner's own APIs never expose reservations, so the surprise holds.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { subtreeIds } from "@/lib/budget";
import { toDomainList } from "@/lib/api/lists";

const bodySchema = z.object({
  itemId: z.string().min(1),
  name: z.string().trim().min(1, "tell the others who reserved it").max(60),
});

type Ctx = { params: Promise<{ token: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const shared = await prisma.list.findUnique({ where: { shareToken: token } });
  if (!shared) return Response.json({ error: "not_found" }, { status: 404 });

  // the item must belong to the shared list's subtree, owned by the list owner
  const allLists = await prisma.list.findMany({ where: { ownerId: shared.ownerId } });
  const allowed = new Set(subtreeIds(allLists.map(toDomainList), shared.id));
  const item = await prisma.item.findFirst({
    where: { id: parsed.data.itemId, userId: shared.ownerId, lists: { some: { listId: { in: [...allowed] } } } },
  });
  if (!item) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    await prisma.reservation.create({
      data: { itemId: item.id, reserverName: parsed.data.name },
    });
  } catch {
    return Response.json({ error: "already_reserved", message: "someone beat you to it" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
