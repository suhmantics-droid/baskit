/**
 * Shared item accessors used by the decision engine and budget roll-up.
 * Ported from the prototype's latestPrice()/firstPrice() (lines 519-520).
 * All prices are minor units.
 */
import type { Item } from "./types";

/** Latest known price (minor units): newest price point, else the denormalised cache. */
export function latestPrice(item: Item): number | null {
  const history = item.prices;
  if (history && history.length > 0) return history[history.length - 1].price;
  return item.price ?? null;
}

/** First known price (minor units): oldest price point, else the denormalised cache. */
export function firstPrice(item: Item): number | null {
  const history = item.prices;
  if (history && history.length > 0) return history[0].price;
  return item.price ?? null;
}
