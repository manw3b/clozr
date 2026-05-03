import { dbSelect, dbExecute } from "./index";
import type { PaymentMethodRow, PaymentMethodKind } from "./types";

export interface PaymentMethodInput {
  name: string;
  modifier_pct: number;
  currency: "ARS" | "USD";
  kind: PaymentMethodKind;
}

export async function getAll(workspaceId: string): Promise<PaymentMethodRow[]> {
  try {
    return await dbSelect<PaymentMethodRow>(
      `SELECT * FROM payment_methods
       WHERE workspace_id = ?
       ORDER BY sort_order ASC, name ASC`,
      [workspaceId],
    );
  } catch {
    return [];
  }
}

export async function getActive(workspaceId: string): Promise<PaymentMethodRow[]> {
  try {
    return await dbSelect<PaymentMethodRow>(
      `SELECT * FROM payment_methods
       WHERE workspace_id = ? AND active = 1
       ORDER BY sort_order ASC, name ASC`,
      [workspaceId],
    );
  } catch {
    return [];
  }
}

export async function create(
  workspaceId: string,
  input: PaymentMethodInput,
): Promise<PaymentMethodRow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = await dbSelect<{ max_order: number }>(
    "SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM payment_methods WHERE workspace_id = ?",
    [workspaceId],
  );
  const sortOrder = (rows[0]?.max_order ?? 0) + 1;
  await dbExecute(
    `INSERT INTO payment_methods
       (id, workspace_id, name, modifier_pct, currency, kind, active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, workspaceId, input.name, input.modifier_pct, input.currency, input.kind, sortOrder, now, now],
  );
  return {
    id,
    workspace_id: workspaceId,
    name: input.name,
    modifier_pct: input.modifier_pct,
    currency: input.currency,
    kind: input.kind,
    active: 1,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  };
}

export async function update(
  id: string,
  patch: Partial<PaymentMethodInput> & { active?: boolean; sort_order?: number },
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    fields.push(`${k} = ?`);
    values.push(typeof v === "boolean" ? (v ? 1 : 0) : v);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);
  await dbExecute(`UPDATE payment_methods SET ${fields.join(", ")} WHERE id = ?`, values);
}

export async function remove(id: string): Promise<void> {
  await dbExecute("DELETE FROM payment_methods WHERE id = ?", [id]);
}

/** Asegura que un workspace tenga al menos los métodos por default. */
export async function seedDefaults(workspaceId: string): Promise<void> {
  const existing = await getAll(workspaceId);
  if (existing.length > 0) return;
  const defaults: PaymentMethodInput[] = [
    { name: "Efectivo ARS", modifier_pct: -3, currency: "ARS", kind: "efectivo" },
    { name: "Efectivo USD", modifier_pct: 0, currency: "USD", kind: "efectivo" },
    { name: "Efectivo USD cara chica", modifier_pct: 5, currency: "USD", kind: "efectivo" },
    { name: "Transferencia", modifier_pct: 0, currency: "ARS", kind: "transferencia" },
    { name: "Crypto USDT", modifier_pct: -2, currency: "USD", kind: "usdt" },
    { name: "MercadoPago", modifier_pct: 6, currency: "ARS", kind: "mercadopago" },
    { name: "Tarjeta crédito", modifier_pct: 12, currency: "ARS", kind: "tarjeta_credito" },
    { name: "Tarjeta débito", modifier_pct: 3, currency: "ARS", kind: "tarjeta_debito" },
    { name: "Cuenta corriente", modifier_pct: 0, currency: "ARS", kind: "cuenta_corriente" },
  ];
  for (const m of defaults) await create(workspaceId, m);
}

export const paymentMethodsDb = {
  getAll,
  getActive,
  create,
  update,
  remove,
  seedDefaults,
};
