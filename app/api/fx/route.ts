/**
 * GET /api/fx?from=GBP&to=USD → { rate }
 *
 * Tiny exchange-rate proxy so the client never fights CORS: frankfurter.app
 * (ECB) first, open.er-api.com as fallback, both free and keyless. Public
 * reference data, so it is unauthenticated and aggressively cached — the
 * in-memory map plus s-maxage means upstream sees a handful of hits a day.
 */
const VALID = /^[A-Z]{3}$/;
const cache = new Map<string, { rate: number; at: number }>();
const TTL = 12 * 3_600_000;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const from = (u.searchParams.get("from") ?? "").toUpperCase();
  const to = (u.searchParams.get("to") ?? "").toUpperCase();
  if (!VALID.test(from) || !VALID.test(to)) {
    return Response.json({ error: "bad_currency" }, { status: 400 });
  }
  if (from === to) return Response.json({ rate: 1 });

  const key = from + to;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return Response.json({ rate: hit.rate }, { headers: { "Cache-Control": "public, s-maxage=43200" } });
  }

  let rate: number | null = null;
  const f = (await fetchJson(`https://api.frankfurter.app/latest?from=${from}&to=${to}`)) as {
    rates?: Record<string, number>;
  } | null;
  rate = f?.rates?.[to] ?? null;
  if (rate == null) {
    const e = (await fetchJson(`https://open.er-api.com/v6/latest/${from}`)) as {
      rates?: Record<string, number>;
    } | null;
    rate = e?.rates?.[to] ?? null;
  }
  if (rate == null) return Response.json({ error: "unavailable" }, { status: 502 });

  cache.set(key, { rate, at: Date.now() });
  return Response.json(
    { rate },
    { headers: { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" } },
  );
}
