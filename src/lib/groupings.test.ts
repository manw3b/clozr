import { describe, expect, it } from "vitest";
import { groupLeadsByStage, buildSalesTimeline } from "./groupings";
import type { Lead, Sale } from "../types/domain";

function lead(partial: Partial<Lead>): Lead {
  return {
    id: partial.id ?? "l",
    clientId: partial.clientId ?? "c",
    clientName: partial.clientName ?? "Cliente",
    stage: partial.stage ?? "prospecto",
    createdAt: partial.createdAt ?? "2026-01-01",
    ...partial,
  } as Lead;
}

function sale(partial: Partial<Sale>): Sale {
  return {
    id: partial.id ?? "s",
    clientId: partial.clientId ?? "c",
    clientName: partial.clientName ?? "Cliente",
    amount: partial.amount ?? 0,
    status: partial.status ?? "paid",
    paid: partial.paid ?? 0,
    product: partial.product ?? "x",
    createdAt: partial.createdAt ?? new Date().toISOString(),
    ...partial,
  } as Sale;
}

describe("groupLeadsByStage", () => {
  it("returns empty object when no leads (buckets son on-demand)", () => {
    const grouped = groupLeadsByStage([]);
    expect(Object.keys(grouped)).toEqual([]);
  });

  it("buckets leads by their stage", () => {
    const leads = [
      lead({ id: "1", stage: "prospecto" }),
      lead({ id: "2", stage: "negociando" }),
      lead({ id: "3", stage: "prospecto" }),
    ];
    const grouped = groupLeadsByStage(leads);
    expect(grouped.prospecto).toHaveLength(2);
    expect(grouped.negociando).toHaveLength(1);
  });

  it("sorts within stage by position asc", () => {
    const leads = [
      lead({ id: "1", stage: "prospecto", position: 3 }),
      lead({ id: "2", stage: "prospecto", position: 1 }),
      lead({ id: "3", stage: "prospecto", position: 2 }),
    ];
    const grouped = groupLeadsByStage(leads);
    expect(grouped.prospecto?.map((l) => l.id)).toEqual(["2", "3", "1"]);
  });
});

describe("buildSalesTimeline", () => {
  it("returns N buckets", () => {
    const buckets = buildSalesTimeline([], 7);
    expect(buckets).toHaveLength(7);
  });

  it("aggregates sales into the right day bucket", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const sales = [
      sale({ id: "1", amount: 100, createdAt: today.toISOString() }),
      sale({ id: "2", amount: 200, createdAt: today.toISOString() }),
    ];
    const buckets = buildSalesTimeline(sales, 7);
    const last = buckets[buckets.length - 1];
    expect(last?.total).toBe(300);
    expect(last?.count).toBe(2);
  });

  it("ignores sales outside the window", () => {
    const old = new Date(Date.now() - 60 * 86400000).toISOString();
    const sales = [sale({ id: "1", amount: 999, createdAt: old })];
    const buckets = buildSalesTimeline(sales, 7);
    const totalAcrossWindow = buckets.reduce((sum, b) => sum + b.total, 0);
    expect(totalAcrossWindow).toBe(0);
  });
});
