/**
 * Guard for the prototype's cloud backup (sync-lite).
 *
 * The prototype stores a whole basket as one JSON blob per user, and pushes it
 * on every change. That makes one failure mode catastrophic: if the client ever
 * holds an empty basket while the cloud holds a full one (a sign-in race, a
 * cleared browser, a mid-load error), the next auto-save silently replaces a
 * real basket with nothing. There is no undo and no history.
 *
 * So: an empty incoming basket may never replace a populated stored one.
 * Losing one deletion from the cloud copy is recoverable on the next real save;
 * losing someone's whole basket is not.
 */

/** A prototype basket: `items` is keyed by profile id, each holding an array. */
export type ProtoBackup = { items?: Record<string, unknown[]> } | null | undefined;

/** Total items across every profile in a prototype basket. */
export function countItems(db: unknown): number {
  const byProfile = (db as ProtoBackup)?.items;
  if (!byProfile || typeof byProfile !== "object" || Array.isArray(byProfile)) return 0;
  return Object.values(byProfile).reduce<number>(
    (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
    0,
  );
}

/**
 * True when writing `incoming` over `stored` would destroy a real basket.
 * Only the empty-over-populated case is blocked; every other write proceeds.
 */
export function wouldWipeBasket(incoming: unknown, stored: unknown): boolean {
  return countItems(incoming) === 0 && countItems(stored) > 0;
}
