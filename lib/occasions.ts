/**
 * Occasion reminders (persona P1: the family planner). A dated list — a
 * birthday, Christmas — is useless if nothing ever mentions the date again.
 * This turns a list's `dueDate` into a well-timed nudge that says how long is
 * left, when to order by, how many gifts are still unbought, and how much of
 * the budget remains.
 *
 * Pure and deterministic (docs/09): takes `now` and all tuning as arguments,
 * never calls Date.now(). The delivery buffer and lead window are passed in so
 * the "how early should it nudge" decision stays tunable once testers weigh in
 * — the defaults here are sensible, not final.
 */
import type { Item, List } from "./types";
import { latestPrice } from "./items";
import { formatMoney } from "./format";

const DAY = 86_400_000;

/** Days a delivery needs to arrive before the date — the order-by is this much earlier. */
export const DEFAULT_BUFFER_DAYS = 3;
/** Start nudging once the order-by date is within this many days. */
export const DEFAULT_LEAD_DAYS = 14;

export interface OccasionContext {
  /** Current time, epoch ms. */
  now: number;
  /** Delivery buffer in days (order-by = dueDate − buffer). */
  bufferDays?: number;
  /** How many days before the order-by date the reminder becomes eligible. */
  leadDays?: number;
}

export interface OccasionMoment {
  listId: string;
  kind: "occasion_soon";
  /** Delivery-layer ranking hint; higher = more urgent. */
  priority: number;
  title: string;
  body: string;
  deeplink: string;
  /** One reminder per occasion instance — never fires twice for the same date. */
  dedupeKey: string;
}

function shortDate(ms: number): string {
  // Deterministic given ms; weekday + day + short month, e.g. "Fri 25 Jul".
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  }).format(new Date(ms));
}

function daysUntil(target: number, now: number): number {
  return Math.ceil((target - now) / DAY);
}

/**
 * Evaluate a single dated list against its items. Returns one reminder
 * candidate, or null when it isn't time, the date has no buffer left, or
 * everything is already bought (stay silent — nothing to nudge).
 */
export function evaluateOccasion(
  list: List,
  items: Item[],
  ctx: OccasionContext,
): OccasionMoment | null {
  if (list.dueDate == null) return null;

  const { now } = ctx;
  const buffer = ctx.bufferDays ?? DEFAULT_BUFFER_DAYS;
  const lead = ctx.leadDays ?? DEFAULT_LEAD_DAYS;

  const orderBy = list.dueDate - buffer * DAY;
  const daysToOrderBy = daysUntil(orderBy, now);

  // Too far out to nudge, or the order-by window has already passed (a "you're
  // cutting it fine" variant can come later — v1 stays silent rather than nag).
  if (daysToOrderBy > lead || daysToOrderBy < 0) return null;

  const unbought = items.filter((it) => !it.bought);
  if (unbought.length === 0) return null; // all sorted — nothing to say

  const spent = items
    .filter((it) => it.bought)
    .reduce((sum, it) => sum + (latestPrice(it) ?? 0), 0);
  const remaining = list.cap != null ? list.cap - spent : null;

  const daysToDate = daysUntil(list.dueDate, now);
  const whenPhrase =
    daysToDate <= 0 ? "is today" : daysToDate === 1 ? "is tomorrow" : `is in ${daysToDate} days`;

  const budgetPhrase =
    remaining != null
      ? remaining >= 0
        ? ` ${formatMoney(remaining)} of your ${formatMoney(list.cap!)} budget left.`
        : ` You're ${formatMoney(-remaining)} over your ${formatMoney(list.cap!)} budget.`
      : "";

  const body =
    `${list.name} ${whenPhrase}. Order by ${shortDate(orderBy)} to be safe. ` +
    `${unbought.length} of ${items.length} still to buy.${budgetPhrase}`;

  return {
    listId: list.id,
    kind: "occasion_soon",
    // Closer dates rank above further ones; over-budget nudges a touch higher.
    priority: (daysToOrderBy <= 3 ? 4 : 3) + (remaining != null && remaining < 0 ? 1 : 0),
    title: `${list.emoji} ${list.name} is coming up`,
    body,
    deeplink: `/list/${list.id}`,
    dedupeKey: `occasion_soon:${list.id}:${list.dueDate}`,
  };
}
