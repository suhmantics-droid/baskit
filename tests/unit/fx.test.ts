import { describe, expect, it } from "vitest";
import {
  RATES_TTL,
  convertMinor,
  itemsInBase,
  rateBetween,
  ratesStale,
  sumInBase,
  toIso,
  type Rates,
} from "../../lib/fx";
import { listSpent } from "../../lib/budget";
import type { Item, List } from "../../lib/types";

/** GBP-based table, close enough to real rates for the maths to be readable. */
const RATES: Rates = {
  base: "GBP",
  rates: { USD: 1.25, EUR: 1.15, INR: 107, JPY: 190 },
  fetchedAt: 1_000_000,
};

function item(over: Partial<Item> & { id: string }): Item {
  return {
    name: over.id,
    currency: "GBP",
    stock: "unknown",
    tags: [],
    status: "want",
    priority: "nice",
    cooldownDays: 0,
    bought: false,
    fav: false,
    createdAt: 0,
    lists: [],
    ...over,
  } as Item;
}

describe("toIso", () => {
  it("maps the prototype's display symbols to codes", () => {
    expect(toIso("£")).toBe("GBP");
    expect(toIso("₹")).toBe("INR");
    expect(toIso("$")).toBe("USD");
    expect(toIso("¥")).toBe("JPY");
  });

  it("passes codes through and defaults empty input to GBP", () => {
    expect(toIso("usd")).toBe("USD");
    expect(toIso(null)).toBe("GBP");
    expect(toIso("")).toBe("GBP");
  });
});

describe("rateBetween", () => {
  it("is 1 for the same currency, even with no table", () => {
    expect(rateBetween("GBP", "GBP", null)).toBe(1);
    expect(rateBetween("£", "GBP", null)).toBe(1);
  });

  it("reads a leg straight off a table quoted in that base", () => {
    expect(rateBetween("GBP", "INR", RATES)).toBe(107);
  });

  it("inverts when converting back to the base", () => {
    expect(rateBetween("INR", "GBP", RATES)).toBeCloseTo(1 / 107, 10);
  });

  it("crosses two non-base currencies through the base", () => {
    expect(rateBetween("USD", "EUR", RATES)).toBeCloseTo(1.15 / 1.25, 10);
  });

  it("returns null rather than guessing when a leg is missing", () => {
    expect(rateBetween("GBP", "SEK", RATES)).toBeNull();
    expect(rateBetween("GBP", "INR", null)).toBeNull();
  });
});

describe("convertMinor", () => {
  it("converts the reported bug: ₹6,000 is about £56, not £6,000", () => {
    const gbp = convertMinor(600_000, "₹", "GBP", RATES);
    expect(gbp).toBe(5_607); // £56.07
  });

  it("goes via major units so zero-decimal currencies are not out by 100", () => {
    // ¥19,000 is stored as 19000 minor (JPY has no minor unit) = £100.
    expect(convertMinor(19_000, "JPY", "GBP", RATES)).toBe(10_000);
    // And back: £100 -> ¥19,000, not ¥1,900,000.
    expect(convertMinor(10_000, "GBP", "JPY", RATES)).toBe(19_000);
  });

  it("is a no-op within one currency and null when unconvertible", () => {
    expect(convertMinor(1_299, "GBP", "GBP", null)).toBe(1_299);
    expect(convertMinor(1_299, "SEK", "GBP", RATES)).toBeNull();
    expect(convertMinor(null, "USD", "GBP", RATES)).toBeNull();
  });
});

describe("sumInBase", () => {
  it("adds mixed currencies in the base rather than summing raw units", () => {
    const out = sumInBase(
      [
        { minor: 10_000, currency: "GBP" }, // £100
        { minor: 600_000, currency: "₹" }, // ₹6,000 -> £56.07
        { minor: 2_500, currency: "USD" }, // $25 -> £20
      ],
      "GBP",
      RATES,
    );
    expect(out.total).toBe(10_000 + 5_607 + 2_000);
    expect(out.complete).toBe(true);
    expect(out.unconverted).toEqual([]);
  });

  it("reports what it could not convert instead of dropping it silently", () => {
    const out = sumInBase(
      [
        { minor: 10_000, currency: "GBP" },
        { minor: 5_000, currency: "SEK" },
        { minor: 2_000, currency: "SEK" },
      ],
      "GBP",
      RATES,
    );
    expect(out.total).toBe(10_000);
    expect(out.complete).toBe(false);
    expect(out.unconverted).toEqual([{ currency: "SEK", total: 7_000 }]);
  });

  it("skips null prices without counting them as zero-currency entries", () => {
    const out = sumInBase([{ minor: null, currency: "SEK" }], "GBP", RATES);
    expect(out).toEqual({ total: 0, unconverted: [], complete: true });
  });
});

describe("ratesStale", () => {
  it("is stale when absent, and only after the TTL elapses", () => {
    expect(ratesStale(null, 0)).toBe(true);
    expect(ratesStale(RATES, RATES.fetchedAt + RATES_TTL - 1)).toBe(false);
    expect(ratesStale(RATES, RATES.fetchedAt + RATES_TTL)).toBe(true);
  });
});

describe("itemsInBase", () => {
  it("restates prices, targets and history in the base currency", () => {
    const [only] = itemsInBase(
      [
        item({
          id: "sari",
          currency: "INR",
          price: 600_000,
          targetPrice: 500_000,
          prices: [{ price: 700_000, checkedAt: 1 }, { price: 600_000, checkedAt: 2 }],
        }),
      ],
      "GBP",
      RATES,
    ).items;

    expect(only.currency).toBe("GBP");
    expect(only.price).toBe(5_607);
    expect(only.targetPrice).toBe(4_673);
    expect(only.prices?.map((p) => p.price)).toEqual([6_542, 5_607]);
  });

  it("leaves unconvertible items out of the set and names their currency", () => {
    const out = itemsInBase(
      [item({ id: "a", currency: "GBP", price: 100 }), item({ id: "b", currency: "SEK", price: 900 })],
      "GBP",
      RATES,
    );
    expect(out.items.map((i) => i.id)).toEqual(["a"]);
    expect(out.unconverted).toEqual(["SEK"]);
  });

  it("fixes the budget roll-up it feeds", () => {
    const lists: List[] = [{ id: "trip", name: "India trip", emoji: "🇮🇳" }];
    const items = [
      item({ id: "sari", currency: "INR", price: 600_000, lists: ["trip"] }),
      item({ id: "case", currency: "GBP", price: 10_000, lists: ["trip"] }),
    ];

    // Before: raw minor units summed across currencies.
    expect(listSpent(lists, items, "trip")).toBe(610_000); // "£6,100"

    // After: everything in GBP first.
    const converted = itemsInBase(items, "GBP", RATES).items;
    expect(listSpent(lists, converted, "trip")).toBe(15_607); // £156.07
  });
});
