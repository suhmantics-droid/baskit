"use client";
/**
 * Planning cockpit (port of the prototype's renderPlan): this month's spend +
 * plan against the monthly budget, and the ready-to-buy digest with reasons.
 */
import { scoreItem } from "@/lib/decision";
import { firstPrice, latestPrice } from "@/lib/items";
import { daysBetween, formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/format";
import type { Item } from "@/lib/types";
import { api } from "@/lib/client/api";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function monthKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${`0${d.getMonth() + 1}`.slice(-2)}`;
}

function scoreColor(cls: string) {
  return cls === "go" ? "var(--good)" : cls === "cool" ? "var(--accent)" : cls === "decide" ? "var(--warn)" : "var(--bad)";
}

interface BuyRow {
  item: Item;
  score: number;
  cls: string;
  why: string;
}

export interface PlanPanelProps {
  items: Item[];
  budget: number | null;
  now: number;
  onOpen: (id: string) => void;
  onBudgetSaved: () => void;
  showToast: (msg: string) => void;
}

export function PlanPanel({ items, budget, now, onOpen, onBudgetSaved, showToast }: PlanPanelProps) {
  const b = budget ?? 0;
  const curKey = monthKeyOf(now);
  const spentMonth = items
    .filter((it) => it.bought && it.boughtAt && monthKeyOf(it.boughtAt) === curKey)
    .reduce((s, it) => s + (latestPrice(it) ?? 0), 0);
  const committed = items
    .filter((it) => !it.bought && it.status === "want")
    .reduce((s, it) => s + (latestPrice(it) ?? 0), 0);
  const monthName = MONTHS[new Date(now).getMonth()];
  const scale = Math.max(b, spentMonth + committed) || 1;
  const left = b - spentMonth;
  const afterPlan = b - spentMonth - committed;

  const ready: BuyRow[] = items
    .map((it): BuyRow | null => {
      if (it.bought) return null;
      const d = scoreItem(it, { now, budget });
      const price = latestPrice(it) ?? 0;
      const was = firstPrice(it) ?? 0;
      let why: string | null = null;
      if (it.targetPrice != null && price <= it.targetPrice) why = "At your target price";
      else if (it.cooldownDays > 0 && it.waitUntil && daysBetween(it.waitUntil, now) <= 0) why = "Cool-off done, you still want it";
      else if (was - price > 0 && d.score >= 60) why = `Price dropped ${formatMoney(was - price, it.currency)}`;
      else if (d.score >= 70) why = d.reasons.length ? d.reasons[0].text : "Signals line up";
      return why ? { item: it, score: d.score, cls: d.cls, why } : null;
    })
    .filter((r): r is BuyRow => r !== null)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, 4);

  const totalSaved = items
    .filter((it) => it.bought)
    .reduce((s, it) => {
      const f = firstPrice(it);
      const l = latestPrice(it);
      return s + (f != null && l != null && f > l ? f - l : 0);
    }, 0);

  const setBudget = async () => {
    const v = prompt("Monthly budget for wants:", b ? String(fromMinorUnits(b)) : "");
    if (v === null) return;
    const n = parseFloat(v);
    try {
      await api.patchMe({ monthlyBudget: v.trim() === "" || Number.isNaN(n) ? null : toMinorUnits(n) });
      onBudgetSaved();
      showToast("Budget set, the plan is live");
    } catch {
      showToast("Couldn't save the budget");
    }
  };

  return (
    <div className="dash-duo">
      <div className="chartbox">
        <h4>{monthName}’s plan</h4>
        <div className="sub">What you have spent, what is planned, and whether it fits</div>
        <div className="alloc">
          {spentMonth > 0 && (
            <div className="seg" style={{ width: `${((spentMonth / scale) * 100).toFixed(2)}%`, background: "var(--accent)" }} title={`Spent: ${formatMoney(spentMonth)}`} />
          )}
          {committed > 0 && (
            <div className="seg seg-committed" style={{ width: `${((committed / scale) * 100).toFixed(2)}%` }} title={`Planned: ${formatMoney(committed)}`} />
          )}
          {b > 0 && b < scale && <div className="capmark" style={{ left: `${((b / scale) * 100).toFixed(2)}%` }} />}
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          <span className="lg">
            <span className="sw" style={{ background: "var(--accent)" }} />
            Spent <b>{formatMoney(spentMonth)}</b>
          </span>
          <span className="lg">
            <span className="sw seg-committed" style={{ border: "none" }} />
            Planned <b>{formatMoney(committed)}</b>
          </span>
          {b > 0 && (
            <span className="lg">
              <span className="sw" style={{ background: "var(--ink)" }} />
              Budget <b>{formatMoney(b)}</b>
            </span>
          )}
        </div>
        <div className="budget-nums" style={{ marginTop: 10 }}>
          <div className="bn">
            <div className="k">Spent in {monthName}</div>
            <div className="v">{formatMoney(spentMonth)}</div>
          </div>
          <div className="bn">
            <div className="k">Planned (want now)</div>
            <div className="v">{formatMoney(committed)}</div>
          </div>
          {b > 0 && (
            <div className="bn">
              <div className="k">{left >= 0 ? "Budget left" : "Over budget"}</div>
              <div className={`v ${left >= 0 ? "ok" : "over"}`}>{formatMoney(Math.abs(left))}</div>
            </div>
          )}
          {b > 0 && (
            <div className="bn">
              <div className="k">If you buy the plan</div>
              <div className={`v ${afterPlan >= 0 ? "ok" : "over"}`}>
                {afterPlan >= 0 ? `${formatMoney(afterPlan)} spare` : `${formatMoney(Math.abs(afterPlan))} short`}
              </div>
            </div>
          )}
        </div>
        {b === 0 && (
          <div className="hint" style={{ marginTop: 8 }}>
            No monthly budget set.{" "}
            <a style={{ color: "var(--accent)", cursor: "pointer" }} onClick={setBudget}>
              Set one
            </a>{" "}
            and the plan turns into a real yes or no.
          </div>
        )}
      </div>
      <div className="chartbox">
        <h4>Ready to buy now</h4>
        <div className="sub">
          Only items whose signals say go{" "}
          {totalSaved > 0 && <span className="savedpill">↓ {formatMoney(totalSaved)} saved by waiting</span>}
        </div>
        {ready.length ? (
          <div className="buynow">
            {ready.map((r) => (
              <div key={r.item.id} className="bn-row" onClick={() => onOpen(r.item.id)}>
                <span className="score-pill" style={{ borderColor: scoreColor(r.cls) }}>
                  <span className="sd" style={{ background: scoreColor(r.cls) }} />
                  {r.score}
                </span>
                <span className="nm">{r.item.name}</span>
                <span className="why">{r.why}</span>
                <span className="pr">{formatMoney(latestPrice(r.item), r.item.currency)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bn-empty">Nothing is screaming buy today. That is the plan working, not failing.</div>
        )}
      </div>
    </div>
  );
}
