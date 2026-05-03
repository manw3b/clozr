import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyCompact,
  greetByHour,
  greetText,
  formatDaysAgo,
  plural,
} from "./format";

describe("formatMoney", () => {
  it("formats ARS without decimals", () => {
    const result = formatMoney(1500, "ARS");
    expect(result).toContain("1.500");
  });

  it("formats USD", () => {
    const result = formatMoney(1500, "USD");
    expect(result).toContain("US$");
  });

  it("defaults to ARS", () => {
    expect(formatMoney(100)).toBe(formatMoney(100, "ARS"));
  });
});

describe("formatMoneyCompact", () => {
  it("renders millions as M with 2 decimals", () => {
    expect(formatMoneyCompact(1_290_000)).toBe("$1.29M");
  });

  it("renders thousands as k with 1 decimal", () => {
    expect(formatMoneyCompact(54_300)).toBe("$54.3k");
  });

  it("renders small numbers as-is", () => {
    expect(formatMoneyCompact(850)).toBe("$850");
  });

  it("handles negative", () => {
    expect(formatMoneyCompact(-2_000_000)).toBe("-$2.00M");
  });

  it("uses US$ for USD", () => {
    expect(formatMoneyCompact(50_000, "USD")).toBe("US$50.0k");
  });
});

describe("greetByHour", () => {
  it("morning between 5 and 11", () => {
    expect(greetByHour(5)).toBe("morning");
    expect(greetByHour(11)).toBe("morning");
  });

  it("afternoon between 12 and 17", () => {
    expect(greetByHour(12)).toBe("afternoon");
    expect(greetByHour(17)).toBe("afternoon");
  });

  it("evening between 18 and 21", () => {
    expect(greetByHour(18)).toBe("evening");
    expect(greetByHour(21)).toBe("evening");
  });

  it("night otherwise", () => {
    expect(greetByHour(22)).toBe("night");
    expect(greetByHour(0)).toBe("night");
    expect(greetByHour(3)).toBe("night");
  });
});

describe("greetText", () => {
  it("returns Spanish greetings", () => {
    expect(greetText("morning")).toBe("Buenos días");
    expect(greetText("afternoon")).toBe("Buenas tardes");
    expect(greetText("evening")).toBe("Buenas tardes");
    expect(greetText("night")).toBe("Buenas noches");
  });
});

describe("formatDaysAgo", () => {
  it("returns 'hoy' for 0", () => {
    expect(formatDaysAgo(0)).toBe("hoy");
  });

  it("returns 'ayer' for 1", () => {
    expect(formatDaysAgo(1)).toBe("ayer");
  });

  it("returns days for less than a month", () => {
    expect(formatDaysAgo(15)).toBe("hace 15 días");
  });

  it("returns 'hace 1 mes' between 30 and 59", () => {
    expect(formatDaysAgo(45)).toBe("hace 1 mes");
  });

  it("returns rounded months above 59", () => {
    expect(formatDaysAgo(90)).toBe("hace 3 meses");
  });
});

describe("plural", () => {
  it("returns singular for 1", () => {
    expect(plural(1, "cliente", "clientes")).toBe("cliente");
  });

  it("returns plural for 0 or N>1", () => {
    expect(plural(0, "cliente", "clientes")).toBe("clientes");
    expect(plural(5, "cliente", "clientes")).toBe("clientes");
  });
});
