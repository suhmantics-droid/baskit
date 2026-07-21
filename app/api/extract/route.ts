/**
 * POST /api/extract — paste a product URL, get back what the ladder can read
 * (name, price, image, availability) to pre-fill add-item forms.
 *
 * Signed-in callers pass straight through. Anonymous callers are allowed too —
 * the prototype's Fetch runs on this endpoint — but only from our own origins
 * and behind a soft per-IP rate limit, so the endpoint can't be farmed as a
 * general-purpose scraper. Public-web http(s) only; private hosts refused.
 */
import { z } from "zod";
import { auth } from "@/auth";
import { extractFromUrl } from "@/lib/extract";
import { domainOf } from "@/lib/url";

const bodySchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
});

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

function isPrivate(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    if (PRIVATE_HOST.test(host) || host.endsWith(".local") || !host.includes(".")) return true;
    const m = host.match(/^172\.(\d+)\./);
    return m != null && +m[1] >= 16 && +m[1] <= 31;
  } catch {
    return true;
  }
}

/** Origins allowed to use the anonymous lane (the product's own surfaces). */
const OWN_ORIGINS = /^(https:\/\/(baskit\.suhmantics\.com|baskit-app-[a-z0-9-]*\.vercel\.app|baskit[a-z0-9-]*\.vercel\.app)|http:\/\/localhost(:\d+)?)$/i;

function fromOwnSurface(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) return OWN_ORIGINS.test(origin);
  // Same-origin fetches may omit Origin; fall back to Referer's origin.
  const ref = request.headers.get("referer");
  if (!ref) return false;
  try {
    return OWN_ORIGINS.test(new URL(ref).origin);
  } catch {
    return false;
  }
}

// Soft per-IP limiter. Instance-local (serverless resets it), which is fine —
// it exists to stop casual farming, not to be a billing meter.
const hits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 30;
const WINDOW_MS = 10 * 60_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 5000) hits.clear(); // cheap memory backstop
    return false;
  }
  h.count++;
  return h.count > LIMIT;
}

export async function POST(request: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) {
    if (!fromOwnSurface(request)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (rateLimited(ip)) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_url" }, { status: 400 });
  }
  const { url } = parsed.data;
  if (isPrivate(url)) {
    return Response.json({ error: "invalid_url" }, { status: 400 });
  }
  const outcome = await extractFromUrl(url);
  return Response.json({ ...outcome, domain: domainOf(url) });
}
