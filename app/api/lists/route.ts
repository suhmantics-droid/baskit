/**
 * Lists collection API (ticket E2-2, contract in docs/03).
 *   GET  /api/lists — the caller's full list forest (flat), each node carrying
 *                     rolled-up subtree spend, item count and capState — computed
 *                     with the pure functions in lib/budget (single source of truth).
 *   POST /api/lists — create (parent must be the caller's own list).
 */
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";
import { listCreateSchema, toBudgetItem, toDomainList } from "@/lib/api/lists";
import { capState, childCapsAllocated, itemsInSubtree, listBought, listSpent } from "@/lib/budget";

export async function GET() {
  try {
    const { id: userId } = await requireUser();
    const [listRows, itemRows] = await Promise.all([
      prisma.list.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } }),
      prisma.item.findMany({
        where: { userId },
        select: { id: true, price: true, bought: true, lists: { select: { listId: true } } },
      }),
    ]);
    const lists = listRows.map(toDomainList);
    const items = itemRows.map(toBudgetItem);
    const nodes = listRows.map((row) => {
      const spent = listSpent(lists, items, row.id);
      return {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        parentId: row.parentId,
        cap: row.cap,
        dueDate: row.dueDate,
        createdAt: row.createdAt,
        spent,
        bought: listBought(lists, items, row.id),
        itemCount: itemsInSubtree(lists, items, row.id).length,
        capState: capState(spent, row.cap),
        childCapsAllocated: childCapsAllocated(lists, row.id),
      };
    });
    return Response.json({ lists: nodes });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const { id: userId } = await requireUser();
    const body = await request.json().catch(() => null);
    const parsed = listCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;
    if (input.parentId) {
      const parent = await prisma.list.findFirst({ where: { id: input.parentId, ownerId: userId } });
      if (!parent) return Response.json({ error: "unknown_parent" }, { status: 400 });
    }
    const row = await prisma.list.create({
      data: {
        ownerId: userId,
        name: input.name,
        emoji: input.emoji,
        parentId: input.parentId,
        cap: input.cap,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
    });
    return Response.json({ list: row }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
