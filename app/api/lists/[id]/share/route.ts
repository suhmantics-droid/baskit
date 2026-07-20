/**
 * Share toggle (ticket E5-1): POST /api/lists/:id/share {enabled}
 * On: mints an unguessable token; off: clears it (link dies immediately).
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const enabled = body?.enabled !== false;

    const existing = await prisma.list.findFirst({ where: { id, ownerId: userId } });
    if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

    const shareToken = enabled ? (existing.shareToken ?? randomUUID().replace(/-/g, "")) : null;
    await prisma.list.update({ where: { id }, data: { shareToken } });
    return Response.json({ shareToken });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
