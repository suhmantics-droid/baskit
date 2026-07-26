"use client";
/**
 * Budget view (ticket E2-6, Sagar-spec): its own window with three layers —
 *   1. My money: income − outgoings = what's left. DEVICE-LOCAL ONLY (never
 *      synced, not even to the account) and ALWAYS opens masked.
 *   2. Month-by-month allocation: what's planned (cool-offs landing that
 *      month), what's been bought, and what's left of the monthly budget.
 *   3. Category pie for the selected month.
 * Money entered here is major units (it's personal budgeting); only the
 * derived monthly budget crosses to the server, in minor units.
 */
import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { latestPrice } from "@/lib/items";
import { formatMoney, toMinorUnits } from "@/lib/format";
import { palette } from "./list-header";
import type { Item } from "@/lib/types";

const MONEY_KEY = "baskit.app.money.v1";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface MoneyState {
  income: string;
  outs: { l: string; a: string }[];
}

function loadMoney(): MoneyState {
  if (typeof window === "undefined") return { income: "", outs: [] };
  try {
    const raw = localStorage.getItem(MONEY_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { income?: unknown; outs?: { l?: unknown; a?: unknown }[] };
      return {
        income: String(p.income ?? ""),
        outs: (p.outs ?? []).map((o) => ({ l: String(o.l ?? ""), a: String(o.a ?? "") })),
      };
    }
  } catch {
    // fresh start below
  }
  return { income: "", outs: [{ l: "Rent / mortgage", a: "" }] };
}

function monthKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${`0${d.getMonth() + 1}`.slice(-2)}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

const num = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export interface BudgetViewProps {
  items: Item[];
  budget: number | null; // minor units, account-level monthly budget
  now: number;
  onGoAll: () => void;
  onBudgetSaved: () => void;
  showToast: (msg: string) => void;
}

export function BudgetView({ items, budget, now, onGoAll, onBudgetSaved, showToast }: BudgetViewProps) {
  // My money — always mounts masked; reveal is a deliberate act every visit.
  const [masked, setMasked] = useState(true);
  const [money, setMoney] = useState<MoneyState>(loadMoney);
  const [selMonth, setSelMonth] = useState(() => monthKeyOf(now));

  const patchMoney = (next: MoneyState) => {
    setMoney(next);
    try {
      localStorage.setItem(
        MONEY_KEY,
        JSON.stringify({ income: next.income, outs: next.outs.filter((o) => o.l || o.a) }),
      );
    } catch {
      // storage full/blocked — the form still works for this visit
    }
  };

  const income = num(money.income);
  const outTotal = money.outs.reduce((s, o) => s + num(o.a), 0);
  const left = income - outTotal;
  const mask = (s: string) => (masked ? "••••" : s);

  // Month allocation — current month + the next five.
  const monthKeys = useMemo(() => {
    const d = new Date(now);
    return Array.from({ length: 6 }, (_, i) => {
      const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
      return monthKeyOf(m.getTime());
    });
  }, [now]);

  const curKey = monthKeys[0];

  const byMonth = useMemo(() => {
    const rows = new Map<string, { planned: number; bought: number }>();
    for (const k of monthKeys) rows.set(k, { planned: 0, bought: 0 });
    for (const it of items) {
      const price = latestPrice(it) ?? 0;
      if (!price) continue;
      if (it.bought) {
        const k = it.boughtAt ? monthKeyOf(it.boughtAt) : null;
        if (k && rows.has(k)) rows.get(k)!.bought += price;
      } else {
        // An active cool-off lands in the month it ends; everything else is a
        // this-month intent (mirrors the cockpit's committed number).
        const dueKey = it.waitUntil && it.waitUntil > now ? monthKeyOf(it.waitUntil) : curKey;
        if (rows.has(dueKey)) rows.get(dueKey)!.planned += price;
      }
    }
    return rows;
  }, [items, monthKeys, curKey, now]);

  // Category pie for the selected month (planned + bought that month).
  const pie = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const it of items) {
      const price = latestPrice(it) ?? 0;
      if (!price) continue;
      let inMonth = false;
      if (it.bought) {
        inMonth = it.boughtAt != null && monthKeyOf(it.boughtAt) === selMonth;
      } else {
        const dueKey = it.waitUntil && it.waitUntil > now ? monthKeyOf(it.waitUntil) : curKey;
        inMonth = dueKey === selMonth;
      }
      if (!inMonth) continue;
      const cat = it.category?.trim() || "Uncategorised";
      byCat.set(cat, (byCat.get(cat) ?? 0) + price);
    }
    const pal = palette();
    const slices = [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: pal[i % pal.length] }));
    const total = slices.reduce((s, x) => s + x.value, 0);
    const r = 58;
    const C = 2 * Math.PI * r;
    const arcs = slices.reduce<{ name: string; value: number; color: string; len: number; off: number }[]>(
      (out, s) => {
        const prev = out.length ? out[out.length - 1] : null;
        const off = prev ? prev.off - prev.len : 0;
        out.push({ ...s, len: total ? (s.value / total) * C : 0, off });
        return out;
      },
      [],
    );
    return { arcs, total, C, r };
  }, [items, selMonth, curKey, now]);

  const b = budget ?? 0;

  const useAsBudget = async () => {
    if (left <= 0) {
      showToast("Nothing left after outgoings, adjust the numbers first");
      return;
    }
    try {
      await api.patchMe({ monthlyBudget: toMinorUnits(Math.floor(left)) });
      showToast(`Monthly budget set to ${formatMoney(toMinorUnits(Math.floor(left)))}`);
      onBudgetSaved();
    } catch {
      showToast("Couldn't save the budget");
    }
  };

  return (
    <>
      <div className="lhead">
        <div className="crumb">
          <a onClick={onGoAll}>All items</a> <span>›</span> <span>Budget</span>
        </div>
        <div className="lt">
          <h1>
            <span>💷</span> Budget
          </h1>
        </div>
      </div>

      <div className="money-card">
        <div className="mc-head">
          <div>
            <div className="sec-t" style={{ margin: 0 }}>
              My money
            </div>
            <div className="hint">Stays on this device only. Never uploaded, not even to your account.</div>
          </div>
          <button className="btn ghost sm" onClick={() => setMasked((v) => !v)}>
            {masked ? "👁 Show" : "🙈 Hide"}
          </button>
        </div>
        <div className="mc-grid">
          <div className="mc-col">
            <label className="mc-l">What comes in each month</label>
            <div className="mc-inrow">
              <span className="cur">£</span>
              <input
                className="mc-in"
                type={masked ? "password" : "text"}
                inputMode="decimal"
                placeholder="0"
                value={money.income}
                onChange={(e) => patchMoney({ ...money, income: e.target.value })}
              />
            </div>
            <label className="mc-l" style={{ marginTop: 12 }}>
              What goes out
            </label>
            {money.outs.map((o, i) => (
              <div key={i} className="mc-outrow">
                <input
                  className="mc-in sm"
                  type="text"
                  placeholder="e.g. Rent"
                  value={o.l}
                  onChange={(e) =>
                    patchMoney({ ...money, outs: money.outs.map((x, j) => (j === i ? { ...x, l: e.target.value } : x)) })
                  }
                />
                <span className="cur">£</span>
                <input
                  className="mc-in sm amt"
                  type={masked ? "password" : "text"}
                  inputMode="decimal"
                  placeholder="0"
                  value={o.a}
                  onChange={(e) =>
                    patchMoney({ ...money, outs: money.outs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })
                  }
                />
                <button
                  className="mp-x"
                  title="Remove"
                  onClick={() => patchMoney({ ...money, outs: money.outs.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="btn ghost sm"
              style={{ marginTop: 6 }}
              onClick={() => patchMoney({ ...money, outs: [...money.outs, { l: "", a: "" }] })}
            >
              ＋ Add outgoing
            </button>
          </div>
          <div className="mc-col">
            <div className="kv">
              <span className="k">In</span>
              <span className="mono">{mask(formatMoney(toMinorUnits(income)))}</span>
            </div>
            <div className="kv">
              <span className="k">Out</span>
              <span className="mono">{mask(`−${formatMoney(toMinorUnits(outTotal))}`)}</span>
            </div>
            <div className="kv" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span className="k">Left each month</span>
              <span className="mono" style={{ color: left >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>
                {mask(formatMoney(toMinorUnits(left)))}
              </span>
            </div>
            <button className="btn sm" style={{ marginTop: 10, width: "100%" }} onClick={useAsBudget}>
              Make this my monthly budget
            </button>
            <div className="hint" style={{ marginTop: 8 }}>
              Only the final budget number is saved to your account
              {b ? ` (currently ${formatMoney(b)})` : ""} , and the workings stay here.
            </div>
          </div>
        </div>
      </div>

      <div className="chartbox" style={{ marginBottom: 18 }}>
        <h4>Month by month</h4>
        <div className="sub">Cool-offs land in the month they end; tap a row for its breakdown</div>
        <div className="alloc">
          {monthKeys.map((k) => {
            const row = byMonth.get(k)!;
            const committed = row.planned + row.bought;
            const over = b > 0 && committed > b;
            const width = b > 0 ? Math.min(100, (committed / b) * 100) : committed > 0 ? 100 : 0;
            return (
              <div key={k} className={`alloc-row${selMonth === k ? " active" : ""}`} onClick={() => setSelMonth(k)}>
                <span className="am">{monthLabel(k)}</span>
                <div className="abar">
                  <span style={{ width: `${width.toFixed(0)}%`, background: over ? "var(--bad)" : "var(--accent)" }} />
                </div>
                <span className="av mono">
                  {row.bought > 0 && <b>{formatMoney(row.bought)} spent · </b>}
                  {formatMoney(row.planned)} planned
                  {b > 0 && (
                    <span style={{ color: over ? "var(--bad)" : "var(--ink-faint)" }}>
                      {" "}
                      · {over ? `${formatMoney(committed - b)} over` : `${formatMoney(b - committed)} left`}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {b === 0 && <div className="hint" style={{ marginTop: 8 }}>Set a monthly budget above and each month shows what&rsquo;s left.</div>}
      </div>

      <div className="chartbox">
        <h4>{monthLabel(selMonth)} by category</h4>
        <div className="sub">Planned and bought together, grouped by category</div>
        {pie.total > 0 ? (
          <div className="donut-wrap">
            <div className="donut">
              <svg width="160" height="160" viewBox="0 0 160 160">
                <g transform="rotate(-90 80 80)">
                  {pie.arcs.map((a) => (
                    <circle
                      key={a.name}
                      cx="80"
                      cy="80"
                      r={pie.r}
                      fill="none"
                      stroke={a.color}
                      strokeWidth="17"
                      strokeDasharray={`${a.len.toFixed(2)} ${(pie.C - a.len).toFixed(2)}`}
                      strokeDashoffset={a.off.toFixed(2)}
                    >
                      <title>{`${a.name}: ${formatMoney(a.value)}`}</title>
                    </circle>
                  ))}
                </g>
              </svg>
              <div className="dcenter">
                <div>
                  <b>{formatMoney(pie.total)}</b>
                  <span>this month</span>
                </div>
              </div>
            </div>
            <div className="dlegend">
              {pie.arcs.map((a) => (
                <div key={a.name} className="dlg">
                  <span className="sw" style={{ background: a.color }} />
                  <span>{a.name}</span>
                  <span className="pct">{Math.round((a.value / pie.total) * 100)}%</span>
                  <b>{formatMoney(a.value)}</b>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="hint" style={{ padding: "14px 0" }}>
            Nothing lands in {monthLabel(selMonth)} yet.
          </div>
        )}
      </div>
    </>
  );
}
