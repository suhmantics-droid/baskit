/**
 * Decision engine — "should I actually buy this?" scoring.
 *
 * Ported verbatim from the prototype's `decide()` (basket-prototype.html, lines
 * 595-619) and specified in docs/04-Decision-Engine.md §1. Pure function, no I/O.
 *
 * Start at 50, apply the weighted adjustments below, clamp to [2, 98]. Reasons are
 * returned sorted by absolute weight, descending (show the top ~4 in the UI).
 *
 * Money is minor units + currency code. "now" is passed in — never read the clock
 * here — so cool-off/age behaviour is deterministic in tests.
 */
import type { Item } from "./types";
import { latestPrice, firstPrice } from "./items";
import { formatMoney, daysBetween } from "./format";

export type DecisionClass = "go" | "cool" | "decide" | "skip";
export type Band = "Buy it" | "Leaning yes" | "Hold off" | "Skip it";

export interface DecisionContext {
  /** Current time, epoch ms. */
  now: number;
  /** Account-level monthly budget for "want now" items, minor units. null/0 = unset. */
  budget?: number | null;
}

export interface DecisionReason {
  /** Signed weight applied to the score. */
  delta: number;
  /** Human-readable explanation. */
  text: string;
}

export interface Decision {
  /** Clamped 0-100 score (actually [2, 98]). */
  score: number;
  band: Band;
  cls: DecisionClass;
  verdict: string;
  /** Reasons, sorted by |delta| descending. */
  reasons: DecisionReason[];
}

export function scoreItem(item: Item, ctx: DecisionContext): Decision {
  const { now } = ctx;
  const budget = ctx.budget ?? 0;
  const currency = item.currency;
  const reasons: DecisionReason[] = [];
  let score = 50;
  const add = (delta: number, text: string) => {
    score += delta;
    reasons.push({ delta, text });
  };

  if (item.priority === "must") add(20, "You marked it a must-have");
  else if (item.priority === "impulse") add(-18, "Flagged as an impulse buy");

  const price = latestPrice(item) ?? 0;

  if (item.targetPrice) {
    if (price <= item.targetPrice) add(16, "At or below your target price");
    else add(-10, `${formatMoney(price - item.targetPrice, currency)} above your target`);
  }

  if (item.prices && item.prices.length > 1) {
    const drop = (firstPrice(item) ?? price) - price;
    if (drop > 0) add(10, `Price dropped ${formatMoney(drop, currency)} since you saved it`);
    else if (drop < 0) add(-6, "Price has risen since you saved it");
  }

  if (budget && item.status === "want") {
    if (price <= budget) add(6, "Fits within your monthly budget");
    else add(-12, "More than your whole monthly budget");
  }

  if (item.cooldownDays > 0 && item.waitUntil) {
    const left = daysBetween(item.waitUntil, now);
    if (left > 0) add(-8, `Still in a ${left}-day cool-off`);
    else add(12, "You waited out the cool-off and still want it");
  } else if (item.priority === "impulse") {
    add(-4, "No cool-off set on an impulse buy");
  }

  const age = daysBetween(now, item.createdAt ?? now);
  if (age >= 14 && item.status !== "want") add(6, `You've wanted this for ${age} days`);

  if (item.stock === "out") add(-6, "Currently out of stock");
  else if (item.stock === "low") add(4, "Low stock — may sell out");

  if (item.fav) add(4, "One of your favourites");

  score = Math.max(2, Math.min(98, Math.round(score)));

  let band: Band;
  let cls: DecisionClass;
  let verdict: string;
  if (score >= 70) {
    band = "Buy it";
    cls = "go";
    verdict = "Worth getting — the signals line up";
  } else if (score >= 48) {
    band = "Leaning yes";
    cls = "cool";
    verdict = "Promising — just check the budget";
  } else if (score >= 28) {
    band = "Hold off";
    cls = "decide";
    verdict = "Give it more time before deciding";
  } else {
    band = "Skip it";
    cls = "skip";
    verdict = "Not worth it right now";
  }

  reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { score, band, cls, verdict, reasons };
}
