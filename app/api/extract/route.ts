/**
 * POST /api/extract — paste a product URL, get back what the ladder can read
 * (name, price, image, availability) to pre-fill the add-item form.
 * Auth required; the fetch happens server-side with the polite one-shot rules
 * from lib/extract. Public-web http(s) only — private/loopback hosts refused.
 */
import { z } from "zod";
import { requireUser, UnauthorizedError, unauthorizedResponse } from "@/lib/session";
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

export async function POST(request: Request) {
  try {
    await requireUser();
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
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
}
