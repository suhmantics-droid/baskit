/**
 * Moment eligibility — candidate "well-timed nudges" for an item.
 *
 * Specified in docs/04-Decision-Engine.md §3 and docs/01 §4. Pure function, no I/O:
 * it returns *candidates*; the worker/delivery layer decides WHEN to actually send
 * (ranking, batching, quiet hours, frequency caps — not here).
 *
 * Each candidate carries a stable `dedupeKey` so the same crossing never fires twice.
 * "now" and all world-state (sale signal, previous stock, open budget window) are
 * passed in via ctx so the function is deterministic and testable.
 */
import type { Item, Stock } from "./types";
import { latestPrice } from "./items";
import { formatMoney } from "./format";
import { scoreItem } from "./decision";

export type MomentKind =
  | "target_hit"
  | "sale"
  | "cooloff_done"
  | "back_in_stock"
  | "budget_window";

export interface Moment {
  itemId: string;
  kind: MomentKind;
  /** Delivery-layer ranking hint; higher = more urgent. */
  priority: number;
  title: string;
  body: string;
  deeplink: string;
  /** Stable key for the crossing — dedupe on this so a repeat never fires twice. */
  dedupeKey: string;
}

/** A sale signal for the item's domain (shared across users). */
export interface SaleContext {
  found: boolean;
  text?: string | null;
  /** Epoch ms the sale ends, if known. */
  endsAt?: number | null;
}

/** An open budget window (month start, or the user's payday). */
export interface BudgetWindow {
  /** Stable identifier for this window (e.g. "2026-07"), used in the dedupeKey. */
  id: string;
  label?: string;
}

export interface MomentContext {
  /** Current time, epoch ms. */
  now: number;
  /** Account-level monthly budget, minor units. null/0 = unset. */
  budget?: number | null;
  /** Sale signal for the item's domain. */
  sale?: SaleContext | null;
  /** The item's stock at the previous check, for detecting a back-in-stock transition. */
  previousStock?: Stock;
  /** Set when a budget window is currently open. */
  budgetWindow?: BudgetWindow | null;
}

/** A sale ending within this window counts as "closing" and ranks higher. */
const SALE_CLOSING_MS = 3 * 86_400_000;
/** A decision score at or above this is "Leaning yes" or better. */
const LEANING_YES = 48;

export function evaluateMoments(item: Item, ctx: MomentContext): Moment[] {
  // A bought item never generates buy-nudges.
  if (item.bought) return [];

  const { now } = ctx;
  const budget = ctx.budget ?? 0;
  const currency = item.currency;
  const price = latestPrice(item) ?? 0;
  const affordable = !budget || price <= budget;
  const deeplink = `/item/${item.id}`;
  const out: Moment[] = [];

  // 1. Target hit — price at or below the target.
  if (item.targetPrice && price <= item.targetPrice) {
    out.push({
      itemId: item.id,
      kind: "target_hit",
      priority: 3,
      title: "Price hit your target",
      body: `${item.name} is ${formatMoney(price, currency)} — at or below your ${formatMoney(
        item.targetPrice,
        currency,
      )} target.`,
      deeplink,
      dedupeKey: `target_hit:${item.id}:${item.targetPrice}`,
    });
  }

  // 2. Sale — the item's domain has an active sale (closing ones rank higher).
  if (ctx.sale && ctx.sale.found) {
    const closing = ctx.sale.endsAt != null && ctx.sale.endsAt - now <= SALE_CLOSING_MS;
    const window = ctx.sale.endsAt ?? ctx.sale.text ?? "active";
    out.push({
      itemId: item.id,
      kind: "sale",
      priority: closing ? 4 : 3,
      title: closing ? "Sale closing on something you saved" : "Something you saved is in a sale",
      body: `${item.name}${item.domain ? ` at ${item.domain}` : ""} is in a sale${
        ctx.sale.text ? ` — ${ctx.sale.text}` : ""
      }.`,
      deeplink,
      dedupeKey: `sale:${item.domain ?? item.id}:${window}`,
    });
  }

  // 3. Cool-off finished — elapsed, still a good decision, and affordable.
  if (item.cooldownDays > 0 && item.waitUntil != null && item.waitUntil <= now && affordable) {
    const decision = scoreItem(item, { now, budget });
    if (decision.score >= LEANING_YES) {
      out.push({
        itemId: item.id,
        kind: "cooloff_done",
        priority: 2,
        title: "Cool-off finished — still want it?",
        body: `You waited out the cool-off on ${item.name}. It's ${formatMoney(
          price,
          currency,
        )} and the signals still line up.`,
        deeplink,
        dedupeKey: `cooloff_done:${item.id}:${item.waitUntil}`,
      });
    }
  }

  // 4. Back in stock — a transition from out/low to in.
  if ((ctx.previousStock === "out" || ctx.previousStock === "low") && item.stock === "in") {
    out.push({
      itemId: item.id,
      kind: "back_in_stock",
      priority: 2,
      title: "Back in stock",
      body: `${item.name} is available again at ${formatMoney(price, currency)}.`,
      deeplink,
      dedupeKey: `back_in_stock:${item.id}`,
    });
  }

  // 5. Budget window — a want-now item that fits and scores well when a window opens.
  if (ctx.budgetWindow && affordable && item.status === "want") {
    const decision = scoreItem(item, { now, budget });
    if (decision.score >= LEANING_YES) {
      out.push({
        itemId: item.id,
        kind: "budget_window",
        priority: 1,
        title: `${ctx.budgetWindow.label ?? "Budget window"} — a top pick`,
        body: `${item.name} fits your budget at ${formatMoney(price, currency)} and scores well.`,
        deeplink,
        dedupeKey: `budget_window:${item.id}:${ctx.budgetWindow.id}`,
      });
    }
  }

  return out;
}
