import { describe, it, expect } from "vitest";
import { scoreItem, type Decision } from "../../lib/decision";
import { makeItem, history, NOW, DAY } from "./fixtures";

const ctx = (budget?: number) => ({ now: NOW, budget });

function reason(d: Decision, substr: string) {
  return d.reasons.find((r) => r.text.includes(substr));
}

describe("scoreItem — neutral baseline", () => {
  it("a plain item scores 50 (Leaning yes)", () => {
    const d = scoreItem(makeItem(), ctx());
    expect(d.score).toBe(50);
    expect(d.band).toBe("Leaning yes");
    expect(d.cls).toBe("cool");
  });
});

describe("scoreItem — every scoring row", () => {
  it("must-have: +20", () => {
    const r = reason(scoreItem(makeItem({ priority: "must" }), ctx()), "must-have");
    expect(r?.delta).toBe(20);
  });

  it("impulse: -18", () => {
    const r = reason(scoreItem(makeItem({ priority: "impulse" }), ctx()), "impulse buy");
    expect(r?.delta).toBe(-18);
  });

  it("at or below target: +16", () => {
    const r = reason(
      scoreItem(makeItem({ price: 7000, targetPrice: 8000 }), ctx()),
      "At or below your target",
    );
    expect(r?.delta).toBe(16);
  });

  it("above target: -10 with formatted difference", () => {
    const r = reason(
      scoreItem(makeItem({ price: 10000, targetPrice: 8000 }), ctx()),
      "above your target",
    );
    expect(r?.delta).toBe(-10);
    expect(r?.text).toBe("£20 above your target");
  });

  it("price dropped: +10 with formatted drop", () => {
    const r = reason(
      scoreItem(makeItem({ prices: history(11000, 10000) }), ctx()),
      "Price dropped",
    );
    expect(r?.delta).toBe(10);
    expect(r?.text).toBe("Price dropped £10 since you saved it");
  });

  it("price rose: -6", () => {
    const r = reason(scoreItem(makeItem({ prices: history(10000, 11000) }), ctx()), "risen");
    expect(r?.delta).toBe(-6);
  });

  it("fits monthly budget: +6", () => {
    const r = reason(
      scoreItem(makeItem({ price: 5000, status: "want" }), ctx(20000)),
      "Fits within your monthly budget",
    );
    expect(r?.delta).toBe(6);
  });

  it("more than the whole budget: -12", () => {
    const r = reason(
      scoreItem(makeItem({ price: 30000, status: "want" }), ctx(20000)),
      "More than your whole monthly budget",
    );
    expect(r?.delta).toBe(-12);
  });

  it("cool-off active: -8 with days left", () => {
    const r = reason(
      scoreItem(makeItem({ cooldownDays: 7, waitUntil: NOW + 3 * DAY }), ctx()),
      "cool-off",
    );
    expect(r?.delta).toBe(-8);
    expect(r?.text).toBe("Still in a 3-day cool-off");
  });

  it("cool-off elapsed: +12", () => {
    const r = reason(
      scoreItem(makeItem({ cooldownDays: 7, waitUntil: NOW - DAY }), ctx()),
      "waited out the cool-off",
    );
    expect(r?.delta).toBe(12);
  });

  it("no cool-off on an impulse: -4", () => {
    const r = reason(
      scoreItem(makeItem({ priority: "impulse", cooldownDays: 0 }), ctx()),
      "No cool-off set",
    );
    expect(r?.delta).toBe(-4);
  });

  it("wanted a long time and not want-now: +6 with age", () => {
    const r = reason(
      scoreItem(makeItem({ status: "later", createdAt: NOW - 20 * DAY }), ctx()),
      "wanted this for",
    );
    expect(r?.delta).toBe(6);
    expect(r?.text).toBe("You've wanted this for 20 days");
  });

  it("out of stock: -6", () => {
    const r = reason(scoreItem(makeItem({ stock: "out" }), ctx()), "out of stock");
    expect(r?.delta).toBe(-6);
  });

  it("low stock: +4", () => {
    const r = reason(scoreItem(makeItem({ stock: "low" }), ctx()), "Low stock");
    expect(r?.delta).toBe(4);
  });

  it("favourite: +4", () => {
    const d = scoreItem(makeItem({ fav: true }), ctx());
    const r = reason(d, "One of your favourites");
    expect(r?.delta).toBe(4);
    expect(d.score).toBe(54);
  });

  it("not a favourite: no favourite reason", () => {
    expect(reason(scoreItem(makeItem(), ctx()), "favourites")).toBeUndefined();
  });
});

describe("scoreItem — band thresholds", () => {
  // Scores are always even (base 50 + even deltas), so the reachable transitions
  // sit at 70, 48 and 28; we bracket each with the nearest even value below it.
  it("70 → Buy it, 68 → Leaning yes", () => {
    expect(scoreItem(makeItem({ priority: "must" }), ctx()).band).toBe("Buy it");
    const leaning = scoreItem(
      makeItem({ priority: "must", prices: history(10000, 11000), stock: "low" }),
      ctx(),
    );
    expect(leaning.score).toBe(68);
    expect(leaning.band).toBe("Leaning yes");
  });

  it("48 → Leaning yes, 46 → Hold off", () => {
    const leaning = scoreItem(makeItem({ prices: history(10000, 11000), stock: "low" }), ctx());
    expect(leaning.score).toBe(48);
    expect(leaning.band).toBe("Leaning yes");

    const hold = scoreItem(
      makeItem({ price: 10000, targetPrice: 8000, status: "want" }),
      ctx(20000),
    );
    expect(hold.score).toBe(46);
    expect(hold.band).toBe("Hold off");
    expect(hold.cls).toBe("decide");
  });

  it("28 → Hold off, 26 → Skip it", () => {
    const hold = scoreItem(makeItem({ priority: "impulse" }), ctx());
    expect(hold.score).toBe(28);
    expect(hold.band).toBe("Hold off");

    const skip = scoreItem(
      makeItem({
        price: 10000,
        targetPrice: 8000,
        status: "want",
        prices: history(9000, 10000),
        stock: "low",
      }),
      ctx(5000),
    );
    expect(skip.score).toBe(26);
    expect(skip.band).toBe("Skip it");
    expect(skip.cls).toBe("skip");
  });
});

describe("scoreItem — clamping and ordering", () => {
  it("clamps to 98 at the top", () => {
    const d = scoreItem(
      makeItem({
        priority: "must",
        price: 5000,
        targetPrice: 6000,
        prices: history(9000, 5000),
        status: "later",
        createdAt: NOW - 20 * DAY,
        cooldownDays: 7,
        waitUntil: NOW - DAY,
        stock: "low",
      }),
      ctx(20000),
    );
    expect(d.score).toBe(98);
    expect(d.band).toBe("Buy it");
  });

  it("clamps to 2 at the bottom", () => {
    const d = scoreItem(
      makeItem({
        priority: "impulse",
        price: 30000,
        targetPrice: 8000,
        status: "want",
        prices: history(9000, 30000),
        stock: "out",
      }),
      ctx(5000),
    );
    expect(d.score).toBe(2);
    expect(d.band).toBe("Skip it");
  });

  it("sorts reasons by absolute weight, descending", () => {
    const d = scoreItem(
      makeItem({ priority: "must", price: 30000, targetPrice: 8000, status: "want" }),
      ctx(5000),
    );
    const absDeltas = d.reasons.map((r) => Math.abs(r.delta));
    const sorted = [...absDeltas].sort((a, b) => b - a);
    expect(absDeltas).toEqual(sorted);
  });
});
