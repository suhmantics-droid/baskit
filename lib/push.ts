/**
 * Web Push delivery (ticket E4-3). Wraps web-push with our VAPID identity and
 * prunes subscriptions the browser has revoked (404/410) so we never keep
 * pushing at dead endpoints. No-op when VAPID env is missing.
 */
import webpush from "web-push";
import { prisma } from "@/lib/db";

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured != null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:suhmantics@gmail.com", pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  deeplink: string;
  /** Collapse key — repeat sends with the same tag replace, not stack. */
  tag?: string;
}

/** Send one payload to every device a user opted in. Returns sends attempted. */
export async function pushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 24 * 3600 },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
      // other failures: transient; the next moment tries again
    }
  }
  return sent;
}
