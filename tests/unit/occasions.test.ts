import { describe, it, expect } from "vitest";
import { evaluateOccasion } from "../../lib/occasions";
import { makeItem, makeList, NOW, DAY } from "./fixtures";

// A Christmas/birthday list dated two weeks out, with a spend cap.
const dueIn = (days: number) => NOW + days * DAY;

describe("evaluateOccasion — the persona P1 proof", () => {
  const list = makeList({ name: "Ellie's birthday", emoji: "🎂", cap: 15000, dueDate: dueIn(14) });
  const items = [
    makeItem({ id: "a", bought: true, price: 4500 }),
    makeItem({ id: "b", bought: true, price: 4500 }),
    makeItem({ id: "c", bought: false }),
    makeItem({ id: "d", bought: false }),
    makeItem({ id: "e", bought: false }),
  ];

  it("fires exactly one reminder at the right moment, naming unbought count + remaining budget", () => {
    const m = evaluateOccasion(list, items, { now: NOW, bufferDays: 5 });
    expect(m).not.toBeNull();
    expect(m!.kind).toBe("occasion_soon");
    expect(m!.body).toContain("3 of 5 still to buy");
    expect(m!.body).toContain("£60 of your £150 budget left");
    expect(m!.body).toContain("is in 14 days");
    expect(m!.title).toBe("🎂 Ellie's birthday is coming up");
  });

  it("never fires twice for the same occasion (stable dedupeKey on the date)", () => {
    const a = evaluateOccasion(list, items, { now: NOW, bufferDays: 5 });
    const b = evaluateOccasion(list, items, { now: NOW + 2 * DAY, bufferDays: 5 });
    expect(a!.dedupeKey).toBe(b!.dedupeKey);
    expect(a!.dedupeKey).toBe(`occasion_soon:l1:${dueIn(14)}`);
  });

  it("stays silent when everything is already bought", () => {
    const allBought = items.map((it) => ({ ...it, bought: true, price: 1000 }));
    expect(evaluateOccasion(list, allBought, { now: NOW, bufferDays: 5 })).toBeNull();
  });
});

describe("evaluateOccasion — windows and edges", () => {
  const items = [makeItem({ id: "x", bought: false })];

  it("does not fire when the order-by date is still beyond the lead window", () => {
    const far = makeList({ dueDate: dueIn(40) });
    expect(evaluateOccasion(far, items, { now: NOW })).toBeNull();
  });

  it("does not fire once the order-by date has passed", () => {
    // date tomorrow, 3-day buffer → order-by was 2 days ago
    const past = makeList({ dueDate: dueIn(1), cap: 5000 });
    expect(evaluateOccasion(past, items, { now: NOW, bufferDays: 3 })).toBeNull();
  });

  it("returns null for a list with no date", () => {
    expect(evaluateOccasion(makeList({ dueDate: null }), items, { now: NOW })).toBeNull();
  });

  it("ranks a soon order-by higher, and flags over-budget", () => {
    const soon = makeList({ name: "Christmas", cap: 5000, dueDate: dueIn(4) });
    const over = [
      makeItem({ id: "p", bought: true, price: 6000 }),
      makeItem({ id: "q", bought: false }),
    ];
    const m = evaluateOccasion(soon, over, { now: NOW, bufferDays: 2 });
    expect(m).not.toBeNull();
    expect(m!.priority).toBeGreaterThanOrEqual(5); // ≤3 days to order-by (+1) and over budget (+1)
    expect(m!.body).toContain("over your £50 budget");
  });

  it("omits the budget line when the list has no cap", () => {
    const noCap = makeList({ name: "Gifts", cap: null, dueDate: dueIn(10) });
    const m = evaluateOccasion(noCap, items, { now: NOW, bufferDays: 3 });
    expect(m).not.toBeNull();
    expect(m!.body).not.toContain("budget");
    expect(m!.body).toContain("1 of 1 still to buy");
  });
});
