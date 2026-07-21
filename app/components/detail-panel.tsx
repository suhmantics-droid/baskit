"use client";
/**
 * Item detail panel (ticket E2-5) — score ring with reasons, cool-off actions,
 * price block with history sparkline, details and quick actions. Fetches the
 * full item (with PricePoints) from GET /api/items/:id on open.
 */
import { useEffect, useState } from "react";
import { api, wireToDomainItem } from "@/lib/client/api";
import { scoreItem } from "@/lib/decision";
import { firstPrice, latestPrice } from "@/lib/items";
import { ago, daysBetween, formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/format";
import type { Item, PricePoint } from "@/lib/types";

function scoreColor(cls: string) {
  return cls === "go" ? "var(--good)" : cls === "cool" ? "var(--accent)" : cls === "decide" ? "var(--warn)" : "var(--bad)";
}

function ScoreRing({ score, cls }: { score: number; cls: string }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  const col = scoreColor(cls);
  return (
    <div className="ring">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={col}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c.toFixed(1)}
          strokeDashoffset={off.toFixed(1)}
          transform="rotate(-90 38 38)"
        />
      </svg>
      <div className="num" style={{ color: col }}>
        {score}
      </div>
    </div>
  );
}

function Sparkline({ prices, currency }: { prices: PricePoint[]; currency: string }) {
  const w = 340,
    h = 64,
    pad = 6;
  const ps = prices.map((p) => p.price);
  const mn = Math.min(...ps);
  let mx = Math.max(...ps);
  if (mx === mn) mx = mn + 1;
  const n = prices.length;
  const pts = prices.map((p, i) => {
    const px = pad + (w - 2 * pad) * (n === 1 ? 0.5 : i / (n - 1));
    const py = h - pad - (h - 2 * pad) * ((p.price - mn) / (mx - mn));
    return [px, py] as const;
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L${pts[0][0].toFixed(1)} ${h - pad} Z`;
  const last = pts[pts.length - 1];
  return (
    <>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
        <defs>
          <linearGradient id="sgApp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sgApp)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="3.5" fill="var(--accent)" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>
        <span>{formatMoney(prices[0].price, currency)}</span>
        <span>{formatMoney(prices[prices.length - 1].price, currency)}</span>
      </div>
    </>
  );
}

export interface DetailPanelProps {
  itemId: string;
  budget: number | null;
  listNames: Map<string, { name: string; emoji: string }>;
  now: number;
  onClose: () => void;
  onEdit: (item: Item) => void;
  onChanged: () => void;
  showToast: (msg: string) => void;
}

export function DetailPanel({ itemId, budget, listNames, now, onClose, onEdit, onChanged, showToast }: DetailPanelProps) {
  const [item, setItem] = useState<Item | null>(null);
  const [version, setVersion] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/items/${itemId}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setItem(wireToDomainItem(data.item));
      } catch {
        if (!cancelled) {
          showToast("Couldn't load that item");
          onClose();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, version, onClose, showToast]);

  const refresh = () => {
    setVersion((v) => v + 1);
    onChanged();
  };

  if (!item) {
    return (
      <>
        <div className="overlay open" onClick={onClose} />
        <div className="panel open">
          <div className="phead">
            <div style={{ fontWeight: 600 }}>Loading…</div>
            <button className="close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
      </>
    );
  }

  const d = scoreItem(item, { now, budget });
  const price = latestPrice(item);
  const was = firstPrice(item);
  const prices = item.prices ?? [];
  const coolLeft = item.cooldownDays > 0 && item.waitUntil ? daysBetween(item.waitUntil, now) : null;

  const patch = async (body: unknown, msg: string) => {
    try {
      await api.patchItem(item.id, body);
      refresh();
      showToast(msg);
    } catch {
      showToast("Couldn't save that");
    }
  };

  const waitLonger = async () => {
    try {
      await api.patchItem(item.id, { cooldownDays: 0 });
      await api.patchItem(item.id, { cooldownDays: 7 });
      refresh();
      showToast("Cooling off 7 more days");
    } catch {
      showToast("Couldn't save that");
    }
  };

  const logPrice = async () => {
    const v = prompt(`Today's price (${item.currency}):`, price != null ? String(fromMinorUnits(price, item.currency)) : "");
    if (v === null) return;
    const n = parseFloat(v);
    if (Number.isNaN(n)) return;
    await patch({ price: toMinorUnits(n, item.currency) }, "Price logged");
  };

  const copyCode = async () => {
    if (!item.code) return;
    try {
      await navigator.clipboard.writeText(item.code);
      showToast(`Copied “${item.code}”`);
    } catch {
      showToast(item.code);
    }
  };

  const checkNow = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await api.priceCheck(item.id);
      const c = res.check;
      if (c.ok && c.priceChanged) {
        const fresh = res.item.price;
        const prev = c.previousPrice;
        showToast(
          prev != null && fresh != null && fresh < prev
            ? `Price dropped to ${formatMoney(fresh, res.item.currency)} ↓`
            : `Price updated to ${formatMoney(fresh, res.item.currency)}`,
        );
      } else if (c.ok) {
        showToast("Checked — same price as before");
      } else if (c.blocked) {
        showToast("This store blocks auto-checks, so we check it less often");
      } else {
        showToast("Couldn't read a price from that page");
      }
      refresh();
    } catch {
      showToast("Couldn't check right now");
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <div className="overlay open" onClick={onClose} />
      <div className="panel open">
        <div className="phead">
          <div>
            <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-.02em" }}>{item.name}</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>
              {formatMoney(price, item.currency)} · {item.status === "want" ? "Want now" : item.status === "later" ? "Save for later" : "Researching"}
              {item.category ? ` · ${item.category}` : ""}
              {item.bought ? " · Bought" : ""}
            </div>
          </div>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="pbody">
          <div className="score-block">
            <ScoreRing score={d.score} cls={d.cls} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.band}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>{d.verdict}</div>
              <ul className="reasons">
                {d.reasons.slice(0, 4).map((r, i) => (
                  <li key={i} className={r.delta >= 0 ? "pos" : "neg"}>
                    <span className="s">{r.delta >= 0 ? "+" : "−"}</span>
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {coolLeft !== null && coolLeft > 0 && (
            <div className="verdict cool">
              ⏳ Cooling off, {coolLeft} day{coolLeft > 1 ? "s" : ""} left.
              <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => patch({ cooldownDays: 0 }, "Cool-off ended")}>
                Decide now
              </button>
            </div>
          )}
          {coolLeft !== null && coolLeft <= 0 && (
            <div className="verdict decide">
              ⚑ Cool-off finished. Still want it?
              <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={waitLonger}>
                Wait longer
              </button>
            </div>
          )}

          <div>
            <div className="sec-t">Price</div>
            <div className="kv">
              <span className="k">Current</span>
              <span className="mono">{formatMoney(price, item.currency)}</span>
            </div>
            {item.targetPrice != null && (
              <div className="kv">
                <span className="k">Target</span>
                <span className="mono">
                  {formatMoney(item.targetPrice, item.currency)}{" "}
                  {price != null && price <= item.targetPrice ? (
                    <span style={{ color: "var(--good)" }}>✓ hit</span>
                  ) : price != null ? (
                    <span style={{ color: "var(--ink-faint)" }}>{formatMoney(price - item.targetPrice, item.currency)} to go</span>
                  ) : null}
                </span>
              </div>
            )}
            {was != null && price != null && was !== price && (
              <div className="kv">
                <span className="k">Since you saved</span>
                <span className="mono" style={{ color: was > price ? "var(--good)" : "var(--bad)" }}>
                  {was > price ? "↓ " : "↑ "}
                  {formatMoney(Math.abs(was - price), item.currency)}
                </span>
              </div>
            )}
            {prices.length > 1 ? (
              <div style={{ marginTop: 10 }}>
                <Sparkline prices={prices} currency={item.currency} />
              </div>
            ) : (
              <div className="hint" style={{ marginTop: 6 }}>
                Log a price over time to build a trend line.
              </div>
            )}
            {item.url && (
              <button
                className="btn ghost sm"
                style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                onClick={checkNow}
                disabled={checking}
              >
                {checking ? "Checking the store…" : "🔄 Check price now"}
              </button>
            )}
          </div>

          <div>
            <div className="sec-t">Details</div>
            <div className="kv">
              <span className="k">Priority</span>
              <span>{item.priority === "must" ? "Must have" : item.priority === "impulse" ? "Impulse" : "Nice to have"}</span>
            </div>
            <div className="kv">
              <span className="k">Stock</span>
              <span>{item.stock === "in" ? "In stock" : item.stock === "low" ? "Low stock" : item.stock === "out" ? "Out of stock" : "Unknown"}</span>
            </div>
            {item.code && (
              <div className="kv">
                <span className="k">Discount code</span>
                <button className="code" onClick={copyCode}>
                  🎟 {item.code} copy
                </button>
              </div>
            )}
            <div className="kv">
              <span className="k">Lists</span>
              <span style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {item.lists.length ? (
                  item.lists.map((id) => {
                    const l = listNames.get(id);
                    return l ? (
                      <span key={id} className="tag list">
                        {l.emoji} {l.name}
                      </span>
                    ) : null;
                  })
                ) : (
                  <span className="hint">None</span>
                )}
              </span>
            </div>
            {item.tags.length > 0 && (
              <div className="kv">
                <span className="k">Tags</span>
                <span style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {item.tags.map((t) => (
                    <span key={t} className="tag">
                      #{t}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>

          {item.notes && (
            <div>
              <div className="sec-t">Notes</div>
              <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{item.notes}</div>
            </div>
          )}

          {item.url && (
            <a className="btn ghost sm" href={item.url} target="_blank" rel="noopener noreferrer" style={{ justifyContent: "center", textDecoration: "none" }}>
              Open product page ↗
            </a>
          )}
          {item.waitUntil == null && item.url != null && (
            <div className="hint">Price checked {item.prices?.length ? ago(now, item.prices[item.prices.length - 1].checkedAt) : "never"}.</div>
          )}
        </div>
        <div className="pfoot">
          <button
            className="btn ghost sm"
            style={{ flex: "0 0 auto", fontSize: 16, color: item.fav ? "#e0426e" : undefined }}
            onClick={() => patch({ fav: !item.fav }, item.fav ? "Removed from favourites" : "Added to favourites ♥")}
          >
            {item.fav ? "♥" : "♡"}
          </button>
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => patch({ bought: !item.bought }, item.bought ? "Marked not bought" : "Marked as bought")}>
            {item.bought ? "Bought ✓" : "Mark bought"}
          </button>
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={logPrice}>
            Log price
          </button>
          <button className="btn sm" style={{ flex: 1 }} onClick={() => onEdit(item)}>
            Edit
          </button>
        </div>
      </div>
    </>
  );
}
