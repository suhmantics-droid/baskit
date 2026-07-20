"use client";
/**
 * List view header (ticket E2-4) — breadcrumb, title with due countdown,
 * over/left pill, budget numbers, allocation bar with cap marker, and the
 * child-caps allocation note. All maths via lib/budget (single source).
 */
import type { WireListNode } from "@/lib/client/api";
import { allocationBar, childCapsAllocated, type AllocationBar } from "@/lib/budget";
import { daysBetween, formatMoney } from "@/lib/format";
import type { Item, List } from "@/lib/types";

const LIGHT = ["#2a78d6", "#008300", "#e87ba4", "#eda100", "#1baf7a", "#eb6834", "#4a3aa7", "#e34948"];
const DARK = ["#3987e5", "#008300", "#d55181", "#c98500", "#199e70", "#d95926", "#9085e9", "#e66767"];

export function palette(): string[] {
  if (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark") return DARK;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return DARK;
  return LIGHT;
}

export interface ListHeaderProps {
  node: WireListNode;
  chain: WireListNode[]; // ancestors first, node last
  domainLists: List[];
  items: Item[];
  now: number;
  onGo: (scope: string) => void;
  onAddItem: () => void;
  onAddSub: () => void;
  onEdit: () => void;
}

export function ListHeader({ node, chain, domainLists, items, now, onGo, onAddItem, onAddSub, onEdit }: ListHeaderProps) {
  const spent = node.spent;
  const cap = node.cap;
  const pal = palette();
  const bar: AllocationBar | null = cap != null ? allocationBar(domainLists, items, node.id, cap) : null;
  const childCaps = childCapsAllocated(domainLists, node.id);

  let due: string | null = null;
  if (node.dueDate) {
    const left = daysBetween(Date.parse(node.dueDate), now);
    due = left > 0 ? `${left} days to go` : left === 0 ? "today" : `${Math.abs(left)} days ago`;
  }

  return (
    <div className="lhead">
      <div className="crumb">
        <a onClick={() => onGo("all")}>All lists</a>
        {chain.map((c, i) => (
          <span key={c.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span>›</span>
            {i < chain.length - 1 ? <a onClick={() => onGo(c.id)}>{c.name}</a> : <span>{c.name}</span>}
          </span>
        ))}
      </div>
      <div className="lt">
        <h1>
          <span>{node.emoji}</span> {node.name} {due && <span className="due">· {due}</span>}
        </h1>
        <div className="lacts">
          {cap != null &&
            (spent > cap ? (
              <span className="overpill">⚠ {formatMoney(spent - cap)} over cap</span>
            ) : (
              <span className="okpill">✓ {formatMoney(cap - spent)} left</span>
            ))}
          <button className="btn ghost sm" onClick={onAddSub}>
            ＋ Sub-list
          </button>
          <button className="btn ghost sm" onClick={onEdit}>
            Edit
          </button>
          <button className="btn sm" onClick={onAddItem}>
            ＋ Add item
          </button>
        </div>
      </div>
      <div className="budget-wrap">
        <div className="budget-nums">
          {cap != null ? (
            <>
              <div className="bn">
                <div className="k">Cap</div>
                <div className="v">{formatMoney(cap)}</div>
              </div>
              <div className="bn">
                <div className="k">Spent</div>
                <div className="v">{formatMoney(spent)}</div>
              </div>
              <div className="bn">
                <div className="k">{cap - spent >= 0 ? "Remaining" : "Over"}</div>
                <div className={`v ${cap - spent >= 0 ? "ok" : "over"}`}>{formatMoney(Math.abs(cap - spent))}</div>
              </div>
            </>
          ) : (
            <>
              <div className="bn">
                <div className="k">Total</div>
                <div className="v">{formatMoney(spent)}</div>
              </div>
              <div className="bn">
                <div className="k">Items</div>
                <div className="v">{node.itemCount}</div>
              </div>
            </>
          )}
          {node.bought > 0 && (
            <div className="bn">
              <div className="k">Bought</div>
              <div className="v">{formatMoney(node.bought)}</div>
            </div>
          )}
        </div>
        {cap == null && (
          <div className="hint" style={{ marginBottom: 8 }}>
            No spend cap set.{" "}
            <a style={{ color: "var(--accent)", cursor: "pointer" }} onClick={onEdit}>
              Set one
            </a>{" "}
            to track this list against a budget.
          </div>
        )}
        {bar && (
          <>
            <div className="alloc">
              {bar.segments.map((s, i) => (
                <div
                  key={s.listId ?? "direct"}
                  className="seg"
                  style={{ width: `${((s.value / bar.scale) * 100).toFixed(2)}%`, background: pal[i % pal.length] }}
                  title={`${s.name}: ${formatMoney(s.value)}`}
                />
              ))}
              {bar.capMarkerRatio != null && <div className="capmark" style={{ left: `${(bar.capMarkerRatio * 100).toFixed(2)}%` }} />}
            </div>
            <div className="legend">
              {bar.segments.map((s, i) => (
                <span key={s.listId ?? "direct"} className="lg">
                  <span className="sw" style={{ background: pal[i % pal.length] }} />
                  {s.name} <b>{formatMoney(s.value)}</b>
                </span>
              ))}
            </div>
            {childCaps > 0 && cap != null && (
              <div className="hint" style={{ marginTop: 8 }}>
                Sub-list caps allocate {formatMoney(childCaps)} of your {formatMoney(cap)} cap
                {childCaps > cap ? (
                  <span style={{ color: "var(--bad)" }}> · {formatMoney(childCaps - cap)} over-allocated</span>
                ) : (
                  <> · {formatMoney(cap - childCaps)} still to allocate</>
                )}
                .
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
