"use client";
/**
 * Moments bell + feed (ticket E4-4) — the header bell shows how many nudges
 * are waiting; opening the feed marks them seen (pending→sent), clicking one
 * opens the item and records the click, × dismisses. Every moment's body says
 * why it fired — that IS the "why am I seeing this".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { ago } from "@/lib/format";

const KIND_ICON: Record<string, string> = {
  target_hit: "🎯",
  price_drop: "📉",
  sale: "🏷",
  cooloff_done: "⏳",
  back_in_stock: "📦",
  budget_window: "💷",
  occasion_soon: "📅",
};

interface FeedMoment {
  id: string;
  itemId: string | null;
  kind: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
}

export function MomentsBell({
  now,
  onOpenItem,
}: {
  now: number;
  onOpenItem: (itemId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [moments, setMoments] = useState<FeedMoment[]>([]);
  const [pending, setPending] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (): Promise<FeedMoment[]> => {
    try {
      const res = await api.moments();
      setMoments(res.moments);
      setPending(res.pendingCount);
      return res.moments;
    } catch {
      return []; // quiet — the bell just stays empty
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.moments();
        if (!cancelled) {
          setMoments(res.moments);
          setPending(res.pendingCount);
        }
      } catch {
        // quiet — the bell just stays empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const toggle = async () => {
    const opening = !open;
    setOpen(opening);
    if (!opening) return;
    const fresh = await load();
    // Opening the feed = seeing it: clear the badge, keep the entries.
    const pendingIds = fresh.filter((m) => m.status === "pending").map((m) => m.id);
    setPending(0);
    if (pendingIds.length) {
      setMoments((ms) => ms.map((m) => (m.status === "pending" ? { ...m, status: "sent" } : m)));
      api.patchMoments(pendingIds, "sent").catch(() => {});
    }
  };

  const openMoment = (m: FeedMoment) => {
    api.patchMoments([m.id], "clicked").catch(() => {});
    setOpen(false);
    if (m.itemId) onOpenItem(m.itemId);
  };

  const dismiss = (m: FeedMoment) => {
    setMoments((ms) => ms.filter((x) => x.id !== m.id));
    if (m.status === "pending") setPending((p) => Math.max(0, p - 1));
    api.patchMoments([m.id], "dismissed").catch(() => {});
  };

  return (
    <div className="moments" ref={boxRef}>
      <button
        className="icon-btn"
        title="Moments"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {pending > 0 && <span className="bell-badge">{pending > 9 ? "9+" : pending}</span>}
      </button>
      {open && (
        <div className="moments-pop" onClick={(e) => e.stopPropagation()}>
          <div className="mp-head">Moments</div>
          {moments.length === 0 ? (
            <div className="mp-empty">
              Nothing yet. When a price drops, hits your target, or a cool-off ends, it lands here.
            </div>
          ) : (
            moments.map((m) => (
              <div key={m.id} className={`mp-row${m.status === "clicked" ? " seen" : ""}`}>
                <button className="mp-main" onClick={() => openMoment(m)}>
                  <span className="mp-ico">{KIND_ICON[m.kind] ?? "✨"}</span>
                  <span>
                    <span className="mp-title">{m.title}</span>
                    <span className="mp-body">{m.body}</span>
                    <span className="mp-when">{ago(now, new Date(m.createdAt).getTime())}</span>
                  </span>
                </button>
                <button className="mp-x" title="Dismiss" onClick={() => dismiss(m)}>
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
