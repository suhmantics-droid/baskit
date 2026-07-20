/**
 * Protected test route (ticket E0-3 acceptance): GET /api/me
 * 401 when signed out; the signed-in user's profile when signed in.
 */
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";

export async function GET() {
  try {
    const { id } = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, currency: true, monthlyBudget: true, createdAt: true },
    });
    return Response.json({ user });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
