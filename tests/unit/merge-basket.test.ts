import { describe, it, expect } from "vitest";
import { mergeBaskets, totalItems, recordStamp, type ProtoDb } from "../../lib/merge-basket";

const PID = "pr1";

/** A basket shaped exactly like the prototype's. */
function basket(opts: {
  items?: Array<{ id: string; name?: string; created?: number; updated?: number }>;
  lists?: Array<{ id: string; name?: string }>;
  lastSaved?: number;
  deleted?: Record<string, number>;
  digestSeen?: Record<string, number | boolean>;
  current?: string;
}): ProtoDb {
  return {
    profiles: [{ id: PID, name: "Stephanie" }],
    current: opts.current ?? PID,
    items: { [PID]: (opts.items ?? []).map((i) => ({ name: "thing", ...i })) },
    lists: { [PID]: opts.lists ?? [] },
    settings: {
      lastSaved: opts.lastSaved ?? 1000,
      ...(opts.deleted ? { deleted: opts.deleted } : {}),
      ...(opts.digestSeen ? { digestSeen: opts.digestSeen } : {}),
    },
  };
}

const ids = (db: ProtoDb) => (db.items?.[PID] ?? []).map((i) => i.id).sort();

describe("mergeBaskets", () => {
  it("keeps items that exist on only one side", () => {
    const local = basket({ items: [{ id: "a" }, { id: "b" }] });
    const remote = basket({ items: [{ id: "c" }] });
    expect(ids(mergeBaskets(local, remote))).toEqual(["a", "b", "c"]);
  });

  it("never loses local additions made while signed out", () => {
    // the exact bug: cloud copy is newer, local has three unsynced additions
    const local = basket({ items: [{ id: "old" }, { id: "new1" }, { id: "new2" }], lastSaved: 500 });
    const remote = basket({ items: [{ id: "old" }, { id: "fromOtherDevice" }], lastSaved: 9999 });
    const merged = mergeBaskets(local, remote);
    expect(ids(merged)).toEqual(["fromOtherDevice", "new1", "new2", "old"]);
    expect(totalItems(merged)).toBe(4);
  });

  it("takes the newer copy when the same item exists on both sides", () => {
    const local = basket({ items: [{ id: "a", name: "stale", updated: 100 }] });
    const remote = basket({ items: [{ id: "a", name: "fresh", updated: 900 }] });
    const merged = mergeBaskets(local, remote);
    expect(merged.items?.[PID][0].name).toBe("fresh");
  });

  it("falls back to basket-level recency when an item carries no stamps", () => {
    const local = basket({ items: [{ id: "a", name: "localWins" }], lastSaved: 5000 });
    const remote = basket({ items: [{ id: "a", name: "remoteStale" }], lastSaved: 100 });
    expect(mergeBaskets(local, remote).items?.[PID][0].name).toBe("localWins");
  });

  it("merges lists as well as items", () => {
    const local = basket({ items: [], lists: [{ id: "l1" }] });
    const remote = basket({ items: [], lists: [{ id: "l2" }] });
    const merged = mergeBaskets(local, remote);
    expect((merged.lists?.[PID] ?? []).map((l) => l.id).sort()).toEqual(["l1", "l2"]);
  });

  it("keeps a deletion buried instead of resurrecting it", () => {
    const local = basket({ items: [{ id: "keep" }], deleted: { gone: 8000 } });
    const remote = basket({ items: [{ id: "keep" }, { id: "gone", created: 100 }] });
    expect(ids(mergeBaskets(local, remote))).toEqual(["keep"]);
  });

  it("resurrects a deleted item if the other device edited it afterwards", () => {
    const local = basket({ items: [], deleted: { x: 1000 } });
    const remote = basket({ items: [{ id: "x", updated: 5000 }] });
    expect(ids(mergeBaskets(local, remote))).toEqual(["x"]);
  });

  it("carries tombstones and digest dismissals through the merge", () => {
    const local = basket({ items: [], deleted: { a: 1 }, digestSeen: { "drop:a:5": 1 } });
    const remote = basket({ items: [], deleted: { b: 2 }, digestSeen: { "cool:b:9": 1 } });
    const merged = mergeBaskets(local, remote);
    expect(Object.keys(merged.settings?.deleted ?? {}).sort()).toEqual(["a", "b"]);
    expect(Object.keys(merged.settings?.digestSeen ?? {}).sort()).toEqual(["cool:b:9", "drop:a:5"]);
  });

  it("is safe on empty, missing and malformed input", () => {
    expect(totalItems(mergeBaskets(null, null))).toBe(0);
    expect(totalItems(mergeBaskets(undefined, basket({ items: [{ id: "a" }] })))).toBe(1);
    expect(totalItems(mergeBaskets(basket({ items: [{ id: "a" }] }), null))).toBe(1);
    // a junk row must not take the whole merge down
    const junk = { profiles: [], items: { [PID]: [null, { noId: true }] } } as unknown as ProtoDb;
    expect(() => mergeBaskets(junk, basket({ items: [{ id: "a" }] }))).not.toThrow();
  });

  it("does not mutate either input", () => {
    const local = basket({ items: [{ id: "a" }] });
    const remote = basket({ items: [{ id: "b" }] });
    mergeBaskets(local, remote);
    expect(ids(local)).toEqual(["a"]);
    expect(ids(remote)).toEqual(["b"]);
  });

  it("keeps this device's settings but adopts the later save time", () => {
    const local = { ...basket({ items: [], lastSaved: 100 }), settings: { lastSaved: 100, autoCheck: false } };
    const remote = { ...basket({ items: [], lastSaved: 900 }), settings: { lastSaved: 900, autoCheck: true } };
    const merged = mergeBaskets(local, remote);
    expect(merged.settings?.autoCheck).toBe(false); // local preference survives
    expect(merged.settings?.lastSaved).toBe(900);
  });
});

describe("recordStamp", () => {
  it("prefers an explicit updated time", () => {
    expect(recordStamp({ id: "a", updated: 5, created: 1 }, 0)).toBe(5);
  });

  it("uses the latest price check or history point when updated is absent", () => {
    expect(recordStamp({ id: "a", created: 1, priceHistory: [{ t: 7, p: 1 }] }, 0)).toBe(7);
    expect(recordStamp({ id: "a", created: 1, lastChecked: 9 }, 0)).toBe(9);
  });

  it("falls back to the basket stamp when a record carries nothing", () => {
    expect(recordStamp({ id: "a" }, 42)).toBe(42);
  });
});
