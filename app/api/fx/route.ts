/**
 * GET /api/fx?from=GBP&to=USD → { rate }
 * GET /api/fx?from=GBP        → { base, rates } — the whole table
 *
 * Tiny exchange-rate proxy so the client never fights CORS. Rates and caching
 * live in lib/fx-server so the server-side roll-ups in /api/lists use exactly the
 * same numbers as the browser. Public reference data, so this is unauthenticated
 * and cached hard — upstream sees a handful of hits a day.
 *
 * The table form exists so a client can convert a whole mixed-currency basket
 * after one round trip instead of one call per pair on screen.
 */
import { rateBetween } from "@/lib/fx";
import { getRates } from "@/lib/fx-server";

const VALID = /^[A-Z]{3}$/;
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" };

export async function GET(request: Request) {
  const u = new URL(request.url);
  const from = (u.searchParams.get("from") ?? "").toUpperCase();
  const to = (u.searchParams.get("to") ?? "").toUpperCase();
  if (!VALID.test(from)) return Response.json({ error: "bad_currency" }, { status: 400 });
  if (to && !VALID.test(to)) return Response.json({ error: "bad_currency" }, { status: 400 });
  if (to && from === to) return Response.json({ rate: 1 });

  const rates = await getRates(from);
  if (!rates) return Response.json({ error: "unavailable" }, { status: 502 });

  if (!to) {
    return Response.json({ base: rates.base, rates: rates.rates }, { headers: CACHE_HEADERS });
  }

  const rate = rateBetween(from, to, rates);
  if (rate == null) return Response.json({ error: "unavailable" }, { status: 502 });
  return Response.json({ rate }, { headers: CACHE_HEADERS });
}
