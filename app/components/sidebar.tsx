"use client";
/**
 * Sidebar list tree (ticket E2-4) — segments & groups with roll-up cap bars,
 * plus the Favourites and Purchases views. Numbers come precomputed from
 * GET /api/lists (spent/itemCount/capState per node).
 */
import type { WireListNode } from "@/lib/client/api";
import { formatMoney } from "@/lib/format";

export type Scope = "all" | "__fav" | "__bought" | "__budget" | string;

export interface SidebarProps {
  lists: WireListNode[];
  scope: Scope;
  allCount: number;
  favCount: number;
  boughtCount: number;
  open: boolean;
  onSelect: (scope: Scope) => void;
  onNewList: (parentId: string | null) => void;
  onEditList: (id: string) => void;
}

export function Sidebar({ lists, scope, allCount, favCount, boughtCount, open, onSelect, onNewList, onEditList }: SidebarProps) {
  const childrenOf = (id: string | null) => lists.filter((l) => l.parentId === id);

  const node = (l: WireListNode, depth: number): React.ReactElement => {
    const kids = childrenOf(l.id);
    const over = l.cap != null && l.spent > l.cap;
    return (
      <div key={l.id}>
        <div className={`side-item${scope === l.id ? " active" : ""}`} onClick={() => onSelect(l.id)}>
          <div className="side-row">
            <span className="em">{l.emoji}</span>
            <span className="nm">{l.name}</span>
            <button
              className="tw"
              title="Add a group inside"
              onClick={(e) => {
                e.stopPropagation();
                onNewList(l.id);
              }}
            >
              ＋
            </button>
            <button
              className="tw"
              title="Edit"
              onClick={(e) => {
                e.stopPropagation();
                onEditList(l.id);
              }}
            >
              ✎
            </button>
            <span className="ct">{l.itemCount}</span>
          </div>
          {l.cap != null && (
            <div className={`side-cap cap-${l.capState}`}>
              <div className="capbar">
                <span style={{ width: `${Math.min(100, (l.spent / l.cap) * 100).toFixed(0)}%` }} />
              </div>
              <div className="lbl">
                <span>{formatMoney(l.spent)}</span>
                <span>{over ? `+${formatMoney(l.spent - l.cap)}` : `cap ${formatMoney(l.cap)}`}</span>
              </div>
            </div>
          )}
        </div>
        {kids.length > 0 && <div className="kids">{kids.map((k) => node(k, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="side-h">
        <span>Segments &amp; groups</span>
        <button className="side-add" title="New list" onClick={() => onNewList(null)}>
          ＋
        </button>
      </div>
      <div className={`side-item${scope === "all" ? " active" : ""}`} onClick={() => onSelect("all")}>
        <div className="side-row">
          <span className="em">🧺</span>
          <span className="nm">All items</span>
          <span className="ct">{allCount}</span>
        </div>
      </div>
      <div className={`side-item${scope === "__fav" ? " active" : ""}`} onClick={() => onSelect("__fav")}>
        <div className="side-row">
          <span className="em" style={{ color: "#e0426e" }}>
            ♥
          </span>
          <span className="nm">Favourites</span>
          <span className="ct">{favCount}</span>
        </div>
      </div>
      <div className={`side-item${scope === "__bought" ? " active" : ""}`} onClick={() => onSelect("__bought")}>
        <div className="side-row">
          <span className="em">🧾</span>
          <span className="nm">Purchases</span>
          <span className="ct">{boughtCount}</span>
        </div>
      </div>
      <div className={`side-item${scope === "__budget" ? " active" : ""}`} onClick={() => onSelect("__budget")}>
        <div className="side-row">
          <span className="em">💷</span>
          <span className="nm">Budget</span>
        </div>
      </div>
      <div style={{ height: 6 }} />
      {childrenOf(null).map((l) => node(l, 0))}
      {lists.length === 0 && (
        <div className="hint" style={{ padding: "4px 8px" }}>
          No lists yet. Create one and give it a spend cap.
        </div>
      )}
    </aside>
  );
}
