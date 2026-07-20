/**
 * URL helpers (pure). `domainOf` is the port of the prototype's domain
 * normaliser: host without "www.", lowercased — used for sale grouping and
 * retailer adapters (docs/05).
 */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}
