/**
 * Account routes.
 *   GET    /api/me — the signed-in user's profile (401 signed out; E0-3 guard)
 *   PATCH  /api/me — update profile basics (name, currency, monthlyBudget in minor units)
 *   DELETE /api/me — self-serve account deletion (E6-3): removes the user and,
 *                    via FK cascades + explicit sweeps, everything they own.
 */
import { z } from "zod";
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

const profileSchema = z
  .object({
    name: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(80).nullable()),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    monthlyBudget: z.number().int().min(0).max(100_000_000).nullable(),
  })
  .partial();

export async function PATCH(request: Request) {
  try {
    const { id } = await requireUser();
    const body = await request.json().catch(() => null);
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
    }
    const user = await prisma.user.update({
      where: { id },
      data: parsed.data,
      select: { id: true, email: true, name: true, currency: true, monthlyBudget: true },
    });
    return Response.json({ user });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}

export async function DELETE() {
  try {
    const { id, email } = await requireUser();
    await prisma.$transaction([
      // no FK on these two — sweep explicitly
      prisma.moment.deleteMany({ where: { userId: id } }),
      prisma.reservation.deleteMany({ where: { reservedById: id } }),
      prisma.verificationToken.deleteMany({ where: { identifier: email } }),
      // cascades take items, price points, list links, lists, sessions, accounts
      prisma.user.delete({ where: { id } }),
    ]);
    return Response.json({ ok: true, deleted: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
