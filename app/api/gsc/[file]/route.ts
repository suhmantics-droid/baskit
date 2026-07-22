/**
 * Google Search Console HTML-file verification, answered by the server.
 *
 * Google asks for one specific /google<token>.html whose body is exactly
 * "google-site-verification: google<token>.html". We serve that ONE file and
 * 404 everything else — matching any google*.html looks like a wildcard/hacked
 * server to Google's anti-spoofing decoy check and fails verification.
 * next.config.ts rewrites the google<hex>.html shape here; this handler pins
 * the exact assigned token.
 *
 * TEMPORARY: delete this route (and its rewrite) once the property is verified.
 */
const GSC_FILE = "google80580464c5b1a36a.html";

export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (file !== GSC_FILE) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(`google-site-verification: ${GSC_FILE}`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
