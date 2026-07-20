"use client";
/**
 * Segments dashboard (port of the prototype's renderSegDash): spend-map donut
 * with hover-to-inspect centre, and colour-coded segment cards for root lists.
 */
import { useEffect, useRef, useState } from "react";
import type { WireListNode } from "@/lib/client/api";
import { latestPrice } from "@/lib/items";
import { subtreeIds } from "@/lib/budget";
import { formatMoney } from "@/lib/format";
import type { Item, List } from "@/lib/types";
import { palette } from "./list-header";

interface Slice {
  id: string;
  name: string;
  emoji: string;
  value: number;
  color: string;
}

export interface SegDashProps {
  lists: WireListNode[];
  domainLists: List[];
  items: Item[];
  onSelect: (scope: string) => void;
  onNewList: (parentId: string | null) => void;
}

export function SegDash({ lists, domainLists, items, onSelect, onNewList }: SegDashProps) {
  const roots = lists.filter((l) => !l.parentId);
  const pal = palette();
  const [centre, setCentre] = useState<{ v: string; l: string } | null>(null);
  const [drawn, setDrawn] = useState(false);
  const drawnRef = useRef(false);

  useEffect(() => {
    if (!drawnRef.current) {
      drawnRef.current = true;
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
      return () => cancelAnimationFrame(id);
    }
  }, []);

  if (!roots.length) return null;

  const inAny = new Set(roots.flatMap((r) => subtreeIds(domainLists, r.id)));
  const unsorted = items.filter((it) => !it.lists.some((id) => inAny.has(id)));
  const unsortedValue = unsorted.reduce((s, it) => s + (latestPrice(it) ?? 0), 0);

  const slices: Slice[] = roots.map((r, i) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    value: r.spent,
    color: pal[i % pal.length],
  }));
  if (unsortedValue > 0) slices.push({ id: "__un", name: "Unsorted", emoji: "🧺", value: unsortedValue, color: "var(--ink-faint)" });
  const total = slices.reduce((s, x) => s + x.value, 0);
  const live = slices.filter((s) => s.value > 0);

  const r = 58;
  const C = 2 * Math.PI * r;
  const arcs = live.reduce<{ slice: Slice; len: number; off: number }[]>((out, s) => {
    const prev = out.length ? out[out.length - 1] : null;
    const off = prev ? prev.off - prev.len : 0;
    out.push({ slice: s, len: (s.value / total) * C, off });
    return out;
  }, []);

  return (
    <div className="dash-duo">
      <div className="chartbox">
        <h4>Spend map</h4>
        <div className="sub">Where your saved value sits — hover a slice, click to open</div>
        {total > 0 && live.length ? (
          <div className="donut-wrap">
            <div className="donut">
              <svg width="160" height="160" viewBox="0 0 160 160">
                <g transform="rotate(-90 80 80)">
                  {arcs.map(({ slice: s, len, off }) => (
                    <circle
                      key={s.id}
                      className="dseg"
                      cx="80"
                      cy="80"
                      r={r}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="17"
                      strokeDasharray={drawn ? `${len.toFixed(2)} ${(C - len).toFixed(2)}` : `0 ${C.toFixed(2)}`}
                      strokeDashoffset={drawn ? off.toFixed(2) : 0}
                      onMouseEnter={() => setCentre({ v: formatMoney(s.value), l: `${s.emoji} ${s.name}` })}
                      onMouseLeave={() => setCentre(null)}
                      onClick={() => s.id !== "__un" && onSelect(s.id)}
                    >
                      <title>{`${s.name}: ${formatMoney(s.value)}`}</title>
                    </circle>
                  ))}
                </g>
              </svg>
              <div className="dcenter">
                <div>
                  <b>{centre?.v ?? formatMoney(total)}</b>
                  <span>{centre?.l ?? "total saved"}</span>
                </div>
              </div>
            </div>
            <div className="dlegend">
              {live.map((s) => (
                <div key={s.id} className="dlg" onClick={() => s.id !== "__un" && onSelect(s.id)}>
                  <span className="sw" style={{ background: s.color }} />
                  <span>
                    {s.emoji} {s.name}
                  </span>
                  <span className="pct">{Math.round((s.value / total) * 100)}%</span>
                  <b>{formatMoney(s.value)}</b>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="hint" style={{ padding: "18px 0" }}>
            Add items with prices — your spend map draws itself as the segments fill up.
          </div>
        )}
      </div>
      <div>
        <div className="sec-t" style={{ margin: "4px 0 8px" }}>
          Your segments
        </div>
        <div className="seg-cards">
          {roots.map((s, i) => (
            <div key={s.id} className="segcard" style={{ ["--segcol" as string]: pal[i % pal.length] }} onClick={() => onSelect(s.id)}>
              <div className="sc-top">
                <span className="sc-em">{s.emoji}</span>
                <button
                  className="tw"
                  title="Add a group inside"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewList(s.id);
                  }}
                >
                  ＋
                </button>
              </div>
              <div className="sc-n">{s.name}</div>
              <div className="sc-s">
                {s.itemCount} item{s.itemCount === 1 ? "" : "s"}
                {lists.filter((l) => l.parentId === s.id).length > 0 &&
                  ` · ${lists.filter((l) => l.parentId === s.id).length} group${lists.filter((l) => l.parentId === s.id).length === 1 ? "" : "s"}`}
              </div>
              {s.cap != null ? (
                <div className={`side-cap cap-${s.capState}`}>
                  <div className="capbar">
                    <span style={{ width: `${Math.min(100, (s.spent / s.cap) * 100).toFixed(0)}%` }} />
                  </div>
                  <div className="lbl">
                    <span>{formatMoney(s.spent)}</span>
                    <span>{s.spent > s.cap ? `+${formatMoney(s.spent - s.cap)} over` : `cap ${formatMoney(s.cap)}`}</span>
                  </div>
                </div>
              ) : (
                <div className="sc-v">{formatMoney(s.spent)}</div>
              )}
            </div>
          ))}
          <div className="segcard add" onClick={() => onNewList(null)}>
            ＋ Add segment
          </div>
        </div>
      </div>
    </div>
  );
}
