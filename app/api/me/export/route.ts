/**
 * Data portability (E6-3): GET /api/me/export — the signed-in user's complete
 * data as a JSON download (profile, lists, items with full price history).
 */
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";

export async function GET() {
  try {
    const { id } = await requireUser();
    const [user, lists, items] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: { email: true, name: true, currency: true, monthlyBudget: true, createdAt: true },
      }),
      prisma.list.findMany({ where: { ownerId: id }, orderBy: { createdAt: "asc" } }),
      prisma.item.findMany({
        where: { userId: id },
        include: {
          lists: { select: { listId: true } },
          prices: { select: { price: true, checkedAt: true, source: true }, orderBy: { checkedAt: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const payload = {
      exportedAt: new Date().toISOString(),
      note: "Money values are integer minor units (pence). Baskit data export.",
      user,
      lists,
      items: items.map(({ lists: links, ...rest }) => ({ ...rest, lists: links.map((l) => l.listId) })),
    };
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="baskit-export.json"`,
      },
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
