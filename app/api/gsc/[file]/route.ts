/**
 * Google Search Console HTML-file verification, answered by the server.
 *
 * Google asks for /google<token>.html whose body is exactly
 * "google-site-verification: google<token>.html" — the content is derived from
 * the filename, so the site can satisfy the check with no token round trip.
 * next.config.ts rewrites only that filename shape here; everything else 404s.
 *
 * TEMPORARY: delete this route (and its rewrite) once the property is verified.
 * While it exists, anyone who knows the domain could verify it in their own
 * Search Console — which would show them our search stats and let them request
 * URL removals.
 */
const GSC_FILE = /^google[a-f0-9]{6,32}\.html$/;

export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!GSC_FILE.test(file)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(`google-site-verification: ${file}`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
