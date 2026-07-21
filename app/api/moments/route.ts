/**
 * Moments feed API (ticket E4-4).
 *   GET   /api/moments — newest 50 for the signed-in user + pending count
 *   PATCH /api/moments — { ids, status } bulk transition, e.g. pending→sent
 *                        when the feed is opened, →dismissed/clicked per item.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";

export async function GET() {
  try {
    const { id: userId } = await requireUser();
    const [moments, pendingCount] = await Promise.all([
      prisma.moment.findMany({
        where: { userId, status: { not: "dismissed" } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          itemId: true,
          kind: true,
          title: true,
          body: true,
          deeplink: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.moment.count({ where: { userId, status: "pending" } }),
    ]);
    return Response.json({ moments, pendingCount });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}

const patchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  status: z.enum(["sent", "dismissed", "clicked"]),
});

export async function PATCH(request: Request) {
  try {
    const { id: userId } = await requireUser();
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }
    const { ids, status } = parsed.data;
    const res = await prisma.moment.updateMany({
      where: { id: { in: ids }, userId },
      data: { status },
    });
    return Response.json({ ok: true, updated: res.count });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
