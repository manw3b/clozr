import { describe, expect, it } from "vitest";
import {
  greetingForHour,
  nameInitials,
  dbTaskToDomain,
  dbFollowupToDomain,
  dbSaleToDomain,
  dbCustomerToClient,
  leadStageFromDb,
  leadPriorityFromInactiveDays,
  cashCategoryFromDb,
  cashCategoryToDb,
  cashKindFromDb,
} from "./mappers";

describe("greetingForHour", () => {
  it("morning before 12", () => {
    expect(greetingForHour(8)).toBe("morning");
  });
  it("afternoon between 12 and 18", () => {
    expect(greetingForHour(15)).toBe("afternoon");
  });
  it("evening between 19 and 21", () => {
    expect(greetingForHour(20)).toBe("evening");
  });
  it("night from 22 onwards", () => {
    expect(greetingForHour(23)).toBe("night");
  });
});

describe("nameInitials", () => {
  it("returns ? for empty", () => {
    expect(nameInitials(null)).toBe("?");
    expect(nameInitials("")).toBe("?");
  });
  it("uses first 2 chars for single name", () => {
    expect(nameInitials("Carlos")).toBe("CA");
  });
  it("uses first letter of first and last for multi-word", () => {
    expect(nameInitials("Juan Pérez")).toBe("JP");
    expect(nameInitials("Ana María García")).toBe("AG");
  });
});

describe("dbTaskToDomain", () => {
  const base = {
    id: "t1",
    workspace_id: "w1",
    type: "puntual" as const,
    frequency: null,
    custom_days: null,
    title: "Llamar a Carlos",
    completed: 0,
    completed_at: null,
    assigned_to: null,
    due_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    template_id: null,
    target_count: null,
    progress: null,
  };

  it("maps completed=1 to status=done", () => {
    const task = dbTaskToDomain({ ...base, completed: 1 });
    expect(task.status).toBe("done");
  });

  it("maps completed=0 to status=pending", () => {
    expect(dbTaskToDomain(base).status).toBe("pending");
  });

  it("preserves title and id", () => {
    const task = dbTaskToDomain(base);
    expect(task.id).toBe("t1");
    expect(task.title).toBe("Llamar a Carlos");
  });
});

describe("dbFollowupToDomain", () => {
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const past = "2020-01-01";

  const base = {
    id: "f1",
    workspace_id: "w1",
    business_id: "b1",
    customer_id: "c1",
    customer_name: "Carlos",
    text: "Pasar presupuesto",
    due_date: future,
    completed: 0,
    completed_at: null,
    created_at: "2026-01-01",
  };

  it("uses recordatorio for future due_date", () => {
    expect(dbFollowupToDomain(base).reason).toBe("recordatorio");
  });

  it("uses sin-respuesta for past due_date", () => {
    const f = dbFollowupToDomain({ ...base, due_date: past });
    expect(f.reason).toBe("sin-respuesta");
  });

  it("falls back to truncated text when customer_name is null", () => {
    const f = dbFollowupToDomain({ ...base, customer_name: null });
    expect(f.clientName).toBe("Pasar presupuesto");
  });
});

describe("dbSaleToDomain", () => {
  const base = {
    id: "s1abc123",
    workspace_id: "w1",
    business_id: "b1",
    customer_id: "c1",
    customer_name: "Cliente A",
    seller_id: null,
    seller_name: null,
    subtotal: 1000,
    total: 1000,
    total_paid: 0,
    balance: 1000,
    is_paid: 0,
    notes: null,
    sale_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    payment_method: null,
    out_of_stock_sale: 0,
    regularized_at: null,
    regularized_by: null,
  };

  it("status=pending when nothing paid", () => {
    expect(dbSaleToDomain(base).status).toBe("pending");
  });

  it("status=partial when some paid", () => {
    expect(dbSaleToDomain({ ...base, total_paid: 300, balance: 700 }).status).toBe("partial");
  });

  it("status=paid when is_paid=1", () => {
    expect(dbSaleToDomain({ ...base, is_paid: 1, total_paid: 1000, balance: 0 }).status).toBe("paid");
  });

  it("formats sale number from id prefix", () => {
    expect(dbSaleToDomain(base).number).toBe("V-S1ABC1");
  });
});

describe("dbCustomerToClient", () => {
  const base = {
    id: "c1",
    workspace_id: "w1",
    name: "Carlos",
    phone: null,
    email: null,
    type: "final",
    status: "activo" as const,
    pricing_policy_json: null,
    barrio: null,
    address: null,
    notes: null,
    avatar_path: null,
    total_sales: 5000,
    created_by: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    instagram: null,
    facebook: null,
    tiktok: null,
    twitter: null,
  };

  it("maps activo → active", () => {
    expect(dbCustomerToClient(base).status).toBe("active");
  });

  it("maps dormido → inactive", () => {
    expect(dbCustomerToClient({ ...base, status: "dormido" }).status).toBe("inactive");
  });

  it("maps perdido → risk", () => {
    expect(dbCustomerToClient({ ...base, status: "perdido" }).status).toBe("risk");
  });

  it("maps potencial → new", () => {
    expect(dbCustomerToClient({ ...base, status: "potencial" }).status).toBe("new");
  });

  it("maps unknown type to final", () => {
    expect(dbCustomerToClient({ ...base, type: "unknown" }).type).toBe("final");
  });

  it("uses total_sales as lifetimeValue", () => {
    expect(dbCustomerToClient(base).lifetimeValue).toBe(5000);
  });
});

describe("leadStageFromDb", () => {
  it("normalizes label variants", () => {
    expect(leadStageFromDb("Prospecto")).toBe("prospecto");
    expect(leadStageFromDb("Visita Agendada")).toBe("visita-agendada");
    expect(leadStageFromDb("PROSPECT")).toBe("prospecto");
  });

  it("returns input as-is for unknown ids (custom stages)", () => {
    expect(leadStageFromDb("xyz-stage")).toBe("xyz-stage");
    expect(leadStageFromDb("aprobado")).toBe("aprobado");
  });

  it("falls back to prospecto for empty input", () => {
    expect(leadStageFromDb("")).toBe("prospecto");
  });
});

describe("leadPriorityFromInactiveDays", () => {
  it("high when fresh", () => {
    expect(leadPriorityFromInactiveDays(0)).toBe("high");
    expect(leadPriorityFromInactiveDays(6)).toBe("high");
  });
  it("medium between 7 and 13", () => {
    expect(leadPriorityFromInactiveDays(7)).toBe("medium");
    expect(leadPriorityFromInactiveDays(13)).toBe("medium");
  });
  it("low for 14+", () => {
    expect(leadPriorityFromInactiveDays(14)).toBe("low");
    expect(leadPriorityFromInactiveDays(60)).toBe("low");
  });
});

describe("cashKindFromDb", () => {
  it("maps in → income, out → expense", () => {
    expect(cashKindFromDb("in")).toBe("income");
    expect(cashKindFromDb("out")).toBe("expense");
  });
});

describe("cashCategoryFromDb", () => {
  it("in+venta → sale-payment", () => {
    expect(cashCategoryFromDb("venta", "in")).toBe("sale-payment");
  });
  it("in+cobro → sale-payment", () => {
    expect(cashCategoryFromDb("cobro", "in")).toBe("sale-payment");
  });
  it("in+otro → cash-in", () => {
    expect(cashCategoryFromDb("otro", "in")).toBe("cash-in");
  });
  it("out+compra → supplier", () => {
    expect(cashCategoryFromDb("compra", "out")).toBe("supplier");
  });
  it("out+gasto → other", () => {
    expect(cashCategoryFromDb("gasto", "out")).toBe("other");
  });
});

describe("cashCategoryToDb roundtrip", () => {
  it("supplier → out+compra", () => {
    const r = cashCategoryToDb("supplier", "expense");
    expect(r).toEqual({ direction: "out", type: "compra" });
  });

  it("sale-payment+income → in+cobro", () => {
    const r = cashCategoryToDb("sale-payment", "income");
    expect(r).toEqual({ direction: "in", type: "cobro" });
  });

  it("cash-in → in+otro", () => {
    const r = cashCategoryToDb("cash-in", "income");
    expect(r).toEqual({ direction: "in", type: "otro" });
  });
});
