/**
 * Web Push subscription API (ticket E4-3).
 *   GET    /api/push — { publicKey } so the client can subscribe (no build-time env)
 *   POST   /api/push — body = PushSubscription JSON from the browser; upserts
 *   DELETE /api/push — body { endpoint }; removes that device
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? null;
  return Response.json({ publicKey });
}

const subSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

export async function POST(request: Request) {
  try {
    const { id: userId } = await requireUser();
    const parsed = subSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "invalid_subscription" }, { status: 400 });
    }
    const { endpoint, keys } = parsed.data;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}

export async function DELETE(request: Request) {
  try {
    const { id: userId } = await requireUser();
    const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
    if (!body?.endpoint) return Response.json({ error: "invalid_body" }, { status: 400 });
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId } });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
