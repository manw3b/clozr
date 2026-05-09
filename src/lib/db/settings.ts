import { dbSelect, dbExecute, runWrite } from "./index";
import type { PipelineStage, CustomerTypeRow, CatalogCategoryRow } from "./types";

// ── Pipeline stages ──────────────────────────────────────────────────

const DEFAULT_PIPELINE_STAGES: Array<Omit<PipelineStage, "workspace_id" | "created_at">> = [
  { id: "prospecto", name: "Prospecto", stage_order: 0, color: "gray", is_won: 0, is_lost: 0 },
  { id: "contactado", name: "Contactado", stage_order: 1, color: "blue", is_won: 0, is_lost: 0 },
  { id: "visita_agendada", name: "Visita agendada", stage_order: 2, color: "blue", is_won: 0, is_lost: 0 },
  { id: "presupuestado", name: "Presupuestado", stage_order: 3, color: "amber", is_won: 0, is_lost: 0 },
  { id: "aprobado", name: "Aprobado", stage_order: 4, color: "amber", is_won: 0, is_lost: 0 },
  { id: "instalado", name: "Instalado", stage_order: 5, color: "green", is_won: 0, is_lost: 0 },
  { id: "cobrado", name: "Cobrado", stage_order: 6, color: "green", is_won: 1, is_lost: 0 },
  { id: "perdido", name: "Perdido", stage_order: 7, color: "red", is_won: 0, is_lost: 1 },
];

export async function getPipelineStages(workspaceId: string): Promise<PipelineStage[]> {
  const rows = await dbSelect<PipelineStage>(
    "SELECT * FROM pipeline_stages WHERE workspace_id = ? ORDER BY stage_order ASC",
    [workspaceId],
  );
  if (rows.length > 0) return rows;

  const now = new Date().toISOString();
  for (const s of DEFAULT_PIPELINE_STAGES) {
    await dbExecute(
      `INSERT OR IGNORE INTO pipeline_stages
       (id, workspace_id, name, stage_order, color, is_won, is_lost, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, workspaceId, s.name, s.stage_order, s.color, s.is_won, s.is_lost, now],
    );
  }
  return dbSelect<PipelineStage>(
    "SELECT * FROM pipeline_stages WHERE workspace_id = ? ORDER BY stage_order ASC",
    [workspaceId],
  );
}

// Sin BEGIN/COMMIT manuales: tauri-plugin-sql envuelve cada execute en su
// propia tx (ver `sales.ts` BUG 2 FIX). El runWrite serializa la secuencia
// completa para que dos guardados no se pisen y que el upsert + delete
// orphan corran en orden previsible.
export async function savePipelineStages(workspaceId: string, stages: PipelineStage[]): Promise<void> {
  await runWrite(async () => {
    try {
      for (const s of stages) {
        await dbExecute(
          `INSERT OR REPLACE INTO pipeline_stages
           (id, workspace_id, name, stage_order, color, is_won, is_lost, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [s.id, workspaceId, s.name, s.stage_order, s.color, s.is_won, s.is_lost],
        );
      }
      if (stages.length > 0) {
        const placeholders = stages.map(() => "?").join(",");
        await dbExecute(
          `DELETE FROM pipeline_stages WHERE workspace_id = ? AND id NOT IN (${placeholders})`,
          [workspaceId, ...stages.map((s) => s.id)],
        );
      } else {
        await dbExecute("DELETE FROM pipeline_stages WHERE workspace_id = ?", [workspaceId]);
      }
    } catch (e) {
      throw new Error(`Error al guardar etapas: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

// ── Customer types ──────────────────────────────────────────────────

const DEFAULT_CUSTOMER_TYPES: CustomerTypeRow[] = [
  { id: "final", workspace_id: "", name: "Final", description: "Consumidor final", color: "blue", sort_order: 0 },
  { id: "revendedor", workspace_id: "", name: "Revendedor", description: "Revende productos", color: "green", sort_order: 1 },
  { id: "mayorista", workspace_id: "", name: "Mayorista", description: "Compra al por mayor", color: "amber", sort_order: 2 },
  { id: "empresa", workspace_id: "", name: "Empresa", description: "Cliente corporativo", color: "purple", sort_order: 3 },
];

export async function getCustomerTypes(workspaceId: string): Promise<CustomerTypeRow[]> {
  const rows = await dbSelect<CustomerTypeRow>(
    "SELECT * FROM customer_types WHERE workspace_id = ? ORDER BY sort_order ASC",
    [workspaceId],
  );
  if (rows.length > 0) return rows;

  for (const t of DEFAULT_CUSTOMER_TYPES) {
    await dbExecute(
      "INSERT OR IGNORE INTO customer_types (id, workspace_id, name, description, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      [t.id, workspaceId, t.name, t.description, t.color, t.sort_order],
    );
  }
  return dbSelect<CustomerTypeRow>(
    "SELECT * FROM customer_types WHERE workspace_id = ? ORDER BY sort_order ASC",
    [workspaceId],
  );
}

export async function saveCustomerTypes(workspaceId: string, types: CustomerTypeRow[]): Promise<void> {
  await runWrite(async () => {
    try {
      for (const t of types) {
        await dbExecute(
          `INSERT OR REPLACE INTO customer_types
           (id, workspace_id, name, description, color, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [t.id, workspaceId, t.name, t.description ?? null, t.color, t.sort_order],
        );
      }
      if (types.length > 0) {
        const placeholders = types.map(() => "?").join(",");
        await dbExecute(
          `DELETE FROM customer_types WHERE workspace_id = ? AND id NOT IN (${placeholders})`,
          [workspaceId, ...types.map((t) => t.id)],
        );
      } else {
        await dbExecute("DELETE FROM customer_types WHERE workspace_id = ?", [workspaceId]);
      }
    } catch (e) {
      throw new Error(`Error al guardar tipos: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

// ── Catalog categories ──────────────────────────────────────────────

export async function getCatalogCategories(workspaceId: string): Promise<CatalogCategoryRow[]> {
  return dbSelect<CatalogCategoryRow>(
    "SELECT * FROM catalog_categories WHERE workspace_id = ? ORDER BY sort_order ASC, name ASC",
    [workspaceId],
  );
}

export async function saveCatalogCategories(workspaceId: string, categories: CatalogCategoryRow[]): Promise<void> {
  await runWrite(async () => {
    try {
      await dbExecute("DELETE FROM catalog_categories WHERE workspace_id = ?", [workspaceId]);
      for (const c of categories) {
        await dbExecute(
          "INSERT INTO catalog_categories (id, workspace_id, name, sort_order) VALUES (?, ?, ?, ?)",
          [c.id, workspaceId, c.name, c.sort_order],
        );
      }
    } catch (e) {
      throw new Error(`Error al guardar categorías: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

// ── Workspace ─────────────────────────────────────────────────────

export async function updateWorkspace(
  id: string,
  data: { name?: string; emoji?: string; color?: string; logo_path?: string | null; daily_goal?: number; daily_goal_currency?: string },
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.name !== undefined) mapped.name = data.name;
  if (data.emoji !== undefined) mapped.emoji = data.emoji;
  if (data.color !== undefined) mapped.color = data.color;
  if (data.logo_path !== undefined) mapped.logo_path = data.logo_path;
  if (data.daily_goal !== undefined) mapped.daily_goal = data.daily_goal;
  if (data.daily_goal_currency !== undefined) mapped.daily_goal_currency = data.daily_goal_currency;
  if (Object.keys(mapped).length === 0) return;
  const fields = Object.keys(mapped).map((k) => `${k} = ?`).join(", ");
  await dbExecute(`UPDATE workspaces SET ${fields} WHERE id = ?`, [...Object.values(mapped), id]);
}

// ── User ──────────────────────────────────────────────────────────

export async function updateUser(
  id: string,
  data: { name?: string; email?: string },
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.name !== undefined) mapped.name = data.name;
  if (data.email !== undefined) mapped.email = data.email;
  if (Object.keys(mapped).length === 0) return;
  const fields = Object.keys(mapped).map((k) => `${k} = ?`).join(", ");
  await dbExecute(`UPDATE users SET ${fields} WHERE id = ?`, [...Object.values(mapped), id]);
}

// ── Export JSON ───────────────────────────────────────────────────

export async function exportWorkspaceJson(workspaceId: string): Promise<string> {
  const [workspaceRows, customers, pipelineItems, pipelineActivities, sales, saleItems, salePayments, tasks, catalogItems, catalogImei] = await Promise.all([
    dbSelect<Record<string, unknown>>("SELECT * FROM workspaces WHERE id = ?", [workspaceId]),
    dbSelect<Record<string, unknown>>("SELECT * FROM customers WHERE workspace_id = ?", [workspaceId]),
    dbSelect<Record<string, unknown>>("SELECT * FROM pipeline_items WHERE workspace_id = ?", [workspaceId]),
    dbSelect<Record<string, unknown>>(
      "SELECT pa.* FROM pipeline_activities pa JOIN pipeline_items pi ON pi.id = pa.pipeline_item_id WHERE pi.workspace_id = ?",
      [workspaceId],
    ),
    dbSelect<Record<string, unknown>>("SELECT * FROM sales WHERE workspace_id = ?", [workspaceId]),
    dbSelect<Record<string, unknown>>(
      "SELECT si.* FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.workspace_id = ?",
      [workspaceId],
    ),
    dbSelect<Record<string, unknown>>(
      "SELECT sp.* FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE s.workspace_id = ?",
      [workspaceId],
    ),
    dbSelect<Record<string, unknown>>("SELECT * FROM tasks WHERE workspace_id = ?", [workspaceId]),
    dbSelect<Record<string, unknown>>("SELECT * FROM catalog_items WHERE workspace_id = ?", [workspaceId]),
    dbSelect<Record<string, unknown>>(
      "SELECT ci.* FROM catalog_imei ci JOIN catalog_items c ON c.id = ci.catalog_item_id WHERE c.workspace_id = ?",
      [workspaceId],
    ),
  ]);

  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      workspace: workspaceRows[0] ?? null,
      customers,
      pipeline_items: pipelineItems,
      pipeline_activities: pipelineActivities,
      sales,
      sale_items: saleItems,
      sale_payments: salePayments,
      tasks,
      catalog_items: catalogItems,
      catalog_imei: catalogImei,
    },
    null,
    2,
  );
}

// ── Clear test data ───────────────────────────────────────────────

export async function clearTestData(workspaceId: string): Promise<number> {
  const ops: Array<[string, string]> = [
    ["customers", "cust-"],
    ["pipeline_items", "pipe-"],
    ["tasks", "task-"],
    ["sales", "sale-"],
    ["catalog_items", "cat-"],
  ];
  let total = 0;
  for (const [table, prefix] of ops) {
    const r = await dbExecute(
      `DELETE FROM ${table} WHERE workspace_id = ? AND id LIKE ?`,
      [workspaceId, `${prefix}%`],
    );
    total += r.rowsAffected;
  }
  return total;
}

export const settingsDb = {
  getPipelineStages,
  savePipelineStages,
  getCustomerTypes,
  saveCustomerTypes,
  getCatalogCategories,
  saveCatalogCategories,
  updateWorkspace,
  updateUser,
  exportWorkspaceJson,
  clearTestData,
};
