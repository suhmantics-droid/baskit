/**
 * Single-list API (ticket E2-2, contract in docs/03).
 *   PATCH  /api/lists/:id — edit; reparent guarded against cycles
 *   DELETE /api/lists/:id — children move up a level (prototype behaviour);
 *                           item links go via FK cascade, items themselves stay
 */
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";
import { listUpdateSchema, toDomainList, wouldCreateCycle } from "@/lib/api/lists";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "not_found" }, { status: 404 });

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);
    const parsed = listUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const existing = await prisma.list.findFirst({ where: { id, ownerId: userId } });
    if (!existing) return notFound();

    if (input.parentId !== undefined && input.parentId !== null) {
      const parent = await prisma.list.findFirst({ where: { id: input.parentId, ownerId: userId } });
      if (!parent) return Response.json({ error: "unknown_parent" }, { status: 400 });
      const allRows = await prisma.list.findMany({ where: { ownerId: userId } });
      if (wouldCreateCycle(allRows.map(toDomainList), id, input.parentId)) {
        return Response.json({ error: "cycle", message: "cannot nest a list inside itself" }, { status: 400 });
      }
    }

    const row = await prisma.list.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.emoji !== undefined ? { emoji: input.emoji } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.cap !== undefined ? { cap: input.cap } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
      },
    });
    return Response.json({ list: row });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const { id } = await ctx.params;
    const existing = await prisma.list.findFirst({ where: { id, ownerId: userId } });
    if (!existing) return notFound();
    await prisma.$transaction([
      // prototype behaviour: sub-lists move up a level, items stay in the basket
      prisma.list.updateMany({ where: { parentId: id }, data: { parentId: existing.parentId } }),
      prisma.list.delete({ where: { id } }),
    ]);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
