/**
 * Merging two copies of a prototype basket.
 *
 * The old behaviour was last-write-wins in both directions: signing in either
 * replaced your local basket with the cloud one, or pushed your local one over
 * the cloud. Either way somebody's additions vanished. Adding three things on
 * your phone while signed out and then signing in should not cost you those
 * three things.
 *
 * So: union, never replace. An id present on one side only always survives.
 * When the same id exists on both, the newer copy wins, judged per item where
 * we can tell and per basket otherwise.
 *
 * Deletions are the awkward case. A pure union resurrects anything deleted on
 * one device, so deletes leave a tombstone (`settings.deleted[id] = when`) and
 * a tombstone newer than the item's own timestamp keeps it buried.
 */

export interface ProtoItem {
  id: string;
  created?: number;
  updated?: number;
  lastChecked?: number | null;
  boughtAt?: number | null;
  letGoAt?: number | null;
  priceHistory?: Array<{ t: number; p: number }>;
  [k: string]: unknown;
}

export interface ProtoList {
  id: string;
  created?: number;
  updated?: number;
  [k: string]: unknown;
}

export interface ProtoProfile {
  id: string;
  [k: string]: unknown;
}

export interface ProtoDb {
  profiles?: ProtoProfile[];
  current?: string | null;
  items?: Record<string, ProtoItem[]>;
  lists?: Record<string, ProtoList[]>;
  settings?: {
    lastSaved?: number;
    deleted?: Record<string, number>;
    digestSeen?: Record<string, number | boolean>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/**
 * Best guess at when a record last changed. `updated` is written from now on;
 * older records predate it, so fall back to whatever timestamps they carry.
 */
export function recordStamp(r: ProtoItem | ProtoList, fallback: number): number {
  const item = r as ProtoItem;
  const candidates = [
    typeof r.updated === "number" ? r.updated : 0,
    typeof item.letGoAt === "number" ? item.letGoAt : 0,
    typeof item.boughtAt === "number" ? item.boughtAt : 0,
    typeof item.lastChecked === "number" ? item.lastChecked : 0,
    Array.isArray(item.priceHistory) && item.priceHistory.length
      ? item.priceHistory[item.priceHistory.length - 1]?.t ?? 0
      : 0,
    typeof r.created === "number" ? r.created : 0,
  ];
  const best = Math.max(...candidates);
  return best > 0 ? best : fallback;
}

function stampOf(db: ProtoDb | null | undefined): number {
  return (db?.settings?.lastSaved as number | undefined) ?? 0;
}

/** Union two id-keyed record lists, newer copy winning any collision. */
function mergeList<T extends { id: string }>(
  a: T[],
  b: T[],
  aStamp: number,
  bStamp: number,
  buried: (id: string, stamp: number) => boolean,
): T[] {
  const out = new Map<string, { row: T; stamp: number }>();
  const take = (rows: T[], side: number) => {
    for (const row of rows) {
      if (!row || typeof row.id !== "string") continue;
      const stamp = recordStamp(row as ProtoItem, side);
      const seen = out.get(row.id);
      if (!seen || stamp > seen.stamp) out.set(row.id, { row, stamp });
    }
  };
  take(a, aStamp);
  take(b, bStamp);
  return [...out.values()].filter((e) => !buried(e.row.id, e.stamp)).map((e) => e.row);
}

function mergeKeyed<T extends { id: string }>(
  a: Record<string, T[]> | undefined,
  b: Record<string, T[]> | undefined,
  aStamp: number,
  bStamp: number,
  buried: (id: string, stamp: number) => boolean,
): Record<string, T[]> {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out: Record<string, T[]> = {};
  for (const k of keys) {
    out[k] = mergeList(a?.[k] ?? [], b?.[k] ?? [], aStamp, bStamp, buried);
  }
  return out;
}

/**
 * Merge `remote` into `local`. Neither argument is mutated.
 * `local` wins ties on device-scoped settings, because those describe this
 * device, not the basket.
 */
export function mergeBaskets(local: ProtoDb | null | undefined, remote: ProtoDb | null | undefined): ProtoDb {
  const l: ProtoDb = local ?? {};
  const r: ProtoDb = remote ?? {};
  const lStamp = stampOf(l);
  const rStamp = stampOf(r);

  // A delete on either device buries the id, unless the other side changed it
  // after the delete happened.
  const tombstones: Record<string, number> = {
    ...(r.settings?.deleted ?? {}),
    ...(l.settings?.deleted ?? {}),
  };
  for (const [id, when] of Object.entries(r.settings?.deleted ?? {})) {
    const mine = tombstones[id];
    if (typeof mine !== "number" || when > mine) tombstones[id] = when;
  }
  const buried = (id: string, stamp: number) => {
    const t = tombstones[id];
    return typeof t === "number" && t >= stamp;
  };

  const profiles = mergeList(l.profiles ?? [], r.profiles ?? [], lStamp, rStamp, () => false);

  return {
    ...r,
    ...l,
    profiles,
    current: l.current ?? r.current ?? profiles[0]?.id ?? null,
    items: mergeKeyed(l.items, r.items, lStamp, rStamp, buried),
    lists: mergeKeyed(l.lists, r.lists, lStamp, rStamp, buried),
    settings: {
      ...(r.settings ?? {}),
      ...(l.settings ?? {}), // this device's preferences stay this device's
      deleted: tombstones,
      // dismissing a digest on one device should not resurface it on another
      digestSeen: { ...(r.settings?.digestSeen ?? {}), ...(l.settings?.digestSeen ?? {}) },
      lastSaved: Math.max(lStamp, rStamp),
    },
  };
}

/** Total items across every profile. */
export function totalItems(db: ProtoDb | null | undefined): number {
  const byProfile = db?.items;
  if (!byProfile || typeof byProfile !== "object") return 0;
  return Object.values(byProfile).reduce<number>((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
}
