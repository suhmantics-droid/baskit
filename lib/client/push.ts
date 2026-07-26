"use client";
/**
 * Browser-side Web Push opt-in (ticket E4-3). Returns a human message for the
 * toast; never throws.
 */

function b64UrlToUint8(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePushNotifications(): Promise<string> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return "This browser doesn't support notifications";
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "Notifications stayed off";
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = (await (await fetch("/api/push")).json()) as { publicKey: string | null };
    if (!publicKey) return "Notifications aren't switched on server-side yet";
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64UrlToUint8(publicKey).buffer as ArrayBuffer,
      }));
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) return "Couldn't save the subscription";
    return "Notifications on. Price drops will ping this device";
  } catch {
    return "Couldn't turn notifications on";
  }
}
