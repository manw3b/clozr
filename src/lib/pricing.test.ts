import { describe, it, expect } from "vitest";
import { computeSuggestedPrice, compareToSuggested } from "./pricing";

describe("computeSuggestedPrice", () => {
  it("USD with no modifier", () => {
    const r = computeSuggestedPrice({
      basePriceUsd: 1000,
      usdToArs: 1250,
      modifierPct: 0,
      currency: "USD",
    });
    expect(r.suggested).toBe(1000);
    expect(r.modifierAmount).toBe(0);
    expect(r.modifierLabel).toBe("—");
  });

  it("ARS with no modifier converts via rate", () => {
    const r = computeSuggestedPrice({
      basePriceUsd: 1000,
      usdToArs: 1250,
      modifierPct: 0,
      currency: "ARS",
    });
    expect(r.suggested).toBe(1_250_000);
  });

  it("ARS with negative modifier (cash discount)", () => {
    const r = computeSuggestedPrice({
      basePriceUsd: 1000,
      usdToArs: 1000,
      modifierPct: -3,
      currency: "ARS",
    });
    expect(r.suggested).toBe(970_000);
    expect(r.modifierAmount).toBe(-30_000);
    expect(r.modifierLabel).toBe("-3%");
  });

  it("USD with positive modifier (card surcharge)", () => {
    const r = computeSuggestedPrice({
      basePriceUsd: 1000,
      usdToArs: 1000,
      modifierPct: 12,
      currency: "USD",
    });
    expect(r.suggested).toBe(1120);
    expect(r.modifierAmount).toBe(120);
    expect(r.modifierLabel).toBe("+12%");
  });

  it("falls back gracefully when usdToArs is 0", () => {
    const r = computeSuggestedPrice({
      basePriceUsd: 1000,
      usdToArs: 0,
      modifierPct: 0,
      currency: "ARS",
    });
    expect(r.suggested).toBe(1000); // fallback to 1
  });
});

describe("compareToSuggested", () => {
  it("match when equal", () => {
    const d = compareToSuggested(1000, 1000);
    expect(d.direction).toBe("match");
    expect(d.delta).toBe(0);
  });

  it("above when charged > suggested", () => {
    const d = compareToSuggested(1100, 1000);
    expect(d.direction).toBe("above");
    expect(d.delta).toBe(100);
    expect(d.pct).toBeCloseTo(10);
    expect(d.label).toContain("+100");
    expect(d.label).toContain("+10");
  });

  it("below when charged < suggested", () => {
    const d = compareToSuggested(900, 1000);
    expect(d.direction).toBe("below");
    expect(d.delta).toBe(-100);
    expect(d.pct).toBeCloseTo(-10);
    expect(d.label).toContain("−100");
  });

  it("handles 0 suggested", () => {
    const d = compareToSuggested(500, 0);
    expect(d.direction).toBe("match");
    expect(d.label).toBe("Sin sugerido");
  });

  it("near-zero delta counts as match", () => {
    const d = compareToSuggested(1000.005, 1000);
    expect(d.direction).toBe("match");
  });
});
