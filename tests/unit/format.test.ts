import { describe, it, expect } from "vitest";
import {
  formatMoney,
  toMinorUnits,
  fromMinorUnits,
  currencySymbol,
  daysBetween,
  ago,
} from "../../lib/format";
import { NOW, DAY } from "./fixtures";

describe("formatMoney", () => {
  it("drops trailing .00 on whole amounts and groups thousands", () => {
    expect(formatMoney(18900, "GBP")).toBe("£189");
    expect(formatMoney(129900, "GBP")).toBe("£1,299");
  });

  it("shows two decimals on non-whole amounts", () => {
    expect(formatMoney(2010, "GBP")).toBe("£20.10");
    expect(formatMoney(129999, "GBP")).toBe("£1,299.99");
  });

  it("renders an em-dash placeholder for null/undefined/NaN", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney(NaN)).toBe("—");
  });

  it("uses the right symbol per currency", () => {
    expect(formatMoney(7900, "USD")).toBe("$79");
    expect(formatMoney(129900, "EUR")).toBe("€1,299");
  });

  it("handles zero-decimal currencies (JPY has no minor unit)", () => {
    expect(formatMoney(79, "JPY")).toBe("¥79");
    expect(formatMoney(1299, "JPY")).toBe("¥1,299");
  });

  it("falls back to the code for unmapped currencies", () => {
    expect(currencySymbol("AUD")).toBe("AUD ");
    expect(formatMoney(5000, "AUD")).toBe("AUD 50");
  });
});

describe("minor-unit conversion", () => {
  it("rounds major to minor units", () => {
    expect(toMinorUnits(12.99)).toBe(1299);
    expect(toMinorUnits(12.995)).toBe(1300);
    expect(toMinorUnits(79, "JPY")).toBe(79);
  });

  it("round-trips back to major units", () => {
    expect(fromMinorUnits(1299)).toBe(12.99);
    expect(fromMinorUnits(79, "JPY")).toBe(79);
  });
});

describe("daysBetween / ago", () => {
  it("counts whole days, rounding up", () => {
    expect(daysBetween(NOW, NOW - 3 * DAY)).toBe(3);
    expect(daysBetween(NOW, NOW - 2 * DAY - DAY / 2)).toBe(3);
    expect(daysBetween(NOW + 5 * DAY, NOW)).toBe(5);
  });

  it("labels recent timestamps", () => {
    expect(ago(NOW, NOW)).toBe("today");
    expect(ago(NOW, NOW - DAY)).toBe("yesterday");
    expect(ago(NOW, NOW - 3 * DAY)).toBe("3 days ago");
    expect(ago(NOW, NOW + DAY)).toBe("today"); // future clamps to "today"
  });
});
