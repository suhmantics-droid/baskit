"use client";
/**
 * Item card — markup and classes mirror the prototype's cardHtml() so the
 * ported stylesheet (app/app.css) renders it identically.
 */
import type { Decision } from "@/lib/decision";
import type { Item } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { firstPrice, latestPrice } from "@/lib/items";

const STOCK: Record<string, [string, string]> = {
  in: ["in", "In stock"],
  low: ["low", "Low stock"],
  out: ["out", "Out of stock"],
  unknown: ["unk", "Stock unknown"],
};

function statusLabel(s: string) {
  return s === "want" ? "Want now" : s === "later" ? "Save for later" : "Researching";
}
function verdictIcon(cls: string) {
  return cls === "go" ? "✓" : cls === "cool" ? "→" : cls === "decide" ? "⏳" : "✕";
}
function scoreColor(cls: string) {
  return cls === "go" ? "var(--good)" : cls === "cool" ? "var(--accent)" : cls === "decide" ? "var(--warn)" : "var(--bad)";
}
function catGlyph(c: string | null | undefined) {
  const s = (c ?? "").toLowerCase();
  if (/tech|electron|gadget|audio/.test(s)) return "💻";
  if (/home|kitchen|furn/.test(s)) return "🏠";
  if (/fashion|cloth|shoe|wear/.test(s)) return "👕";
  if (/book|read/.test(s)) return "📚";
  if (/beauty|care/.test(s)) return "🧴";
  if (/gift/.test(s)) return "🎁";
  if (/game|toy/.test(s)) return "🎮";
  return "🛍️";
}

export interface ItemCardProps {
  item: Item;
  decision: Decision;
  listNames: Map<string, { name: string; emoji: string }>;
  onToggleBought: (id: string) => void;
  onToggleFav: (id: string) => void;
  onOpen: (id: string) => void;
}

export function ItemCard({ item, decision, listNames, onToggleBought, onToggleFav, onOpen }: ItemCardProps) {
  const price = latestPrice(item);
  const was = firstPrice(item);
  const sk = STOCK[item.stock] ?? STOCK.unknown;
  const col = scoreColor(decision.cls);
  const dropped = was != null && price != null && was > price;

  return (
    <div className={`card${item.bought ? " bought" : ""}`} onClick={() => onOpen(item.id)}>
      <div className="thumb">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote product images, arbitrary hosts
          <img src={item.imageUrl} alt="" />
        ) : (
          <div className="ph">{catGlyph(item.category)}</div>
        )}
        <div className="status">
          <span className={`badge ${item.status === "want" ? "want" : item.status === "later" ? "later" : "research"}`}>
            {statusLabel(item.status)}
          </span>
        </div>
        <div className="score-pill" style={{ borderColor: col }}>
          <span className="sd" style={{ background: col }} />
          {decision.score}
        </div>
        {item.bought && (
          <div className="boughttag">
            <span className="badge got">✓ Bought</span>
          </div>
        )}
      </div>
      <button
        className={`cardbuy${item.bought ? " on" : ""}`}
        title={item.bought ? "Bought" : "Mark bought"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleBought(item.id);
        }}
      >
        ✓
      </button>
      <button
        className={`cardfav${item.fav ? " on" : ""}`}
        title={item.fav ? "Unfavourite" : "Favourite"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav(item.id);
        }}
      >
        {item.fav ? "♥" : "♡"}
      </button>
      <div className="body">
        <div className="top">
          <span className="name">{item.name}</span>
          <span className="price">
            {formatMoney(price, item.currency)}
            {dropped && <span className="was">{formatMoney(was, item.currency)}</span>}
          </span>
        </div>
        <div className="meta">
          {item.category && <span className="tag cat">{item.category}</span>}
          {item.lists.slice(0, 2).map((id) => {
            const l = listNames.get(id);
            return l ? (
              <span key={id} className="tag list">
                {l.emoji} {l.name}
              </span>
            ) : null;
          })}
          <span className={`stock ${sk[0]}`}>
            <span className="d" />
            {sk[1]}
          </span>
          {dropped && <span className="drop">↓ {formatMoney(was - price, item.currency)}</span>}
          {item.targetPrice != null && price != null && price <= item.targetPrice && (
            <span className="target-hit">✓ at target</span>
          )}
        </div>
        {(item.tags.length > 0 || item.code) && (
          <div className="meta">
            {item.tags.slice(0, 2).map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
            {item.code && <span className="code">🎟 {item.code}</span>}
          </div>
        )}
        <div className={`verdict ${decision.cls}`} title={decision.verdict}>
          {verdictIcon(decision.cls)} {decision.band}
        </div>
        {item.url && (
          <div style={{ marginTop: 2 }}>
            <a
              className="open"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
            >
              Open ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
