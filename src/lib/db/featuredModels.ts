import { dbSelect, dbExecute } from "./index";

/**
 * Productos destacados (⭐) por workspace.
 * Cada destacado puede tener un `color` específico (variante a destacar) o
 * NULL = usar la imagen default del modelo.
 *
 * Visible en el VisualProductPicker como badge ⭐ DESTACADO.
 * Configurable desde Ajustes → Productos destacados (owner/admin).
 */

export type FeaturedMap = Map<string, string | null>;

/**
 * Devuelve un Map de model_id → color elegido (o NULL si default).
 * Tiene `.has(modelId)` para chequear si está destacado.
 */
export async function getAll(workspaceId: string): Promise<FeaturedMap> {
  try {
    const rows = await dbSelect<{ model_id: string; color: string | null }>(
      "SELECT model_id, color FROM workspace_featured_models WHERE workspace_id = ?",
      [workspaceId],
    );
    const map: FeaturedMap = new Map();
    for (const r of rows) map.set(r.model_id, r.color ?? null);
    return map;
  } catch {
    return new Map();
  }
}

export async function isFeatured(workspaceId: string, modelId: string): Promise<boolean> {
  const map = await getAll(workspaceId);
  return map.has(modelId);
}

/** Marca un modelo como destacado (con color opcional). Idempotente. */
export async function setFeatured(
  workspaceId: string,
  modelId: string,
  color: string | null,
): Promise<void> {
  await dbExecute(
    `INSERT INTO workspace_featured_models (workspace_id, model_id, color, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (workspace_id, model_id) DO UPDATE SET color = excluded.color`,
    [workspaceId, modelId, color, new Date().toISOString()],
  );
}

export async function unsetFeatured(workspaceId: string, modelId: string): Promise<void> {
  await dbExecute(
    "DELETE FROM workspace_featured_models WHERE workspace_id = ? AND model_id = ?",
    [workspaceId, modelId],
  );
}

/**
 * Toggle: si está destacado lo quita; si no, lo marca con color=null (default).
 * Para elegir un color específico, usar setFeatured.
 */
export async function toggle(workspaceId: string, modelId: string): Promise<boolean> {
  const map = await getAll(workspaceId);
  if (map.has(modelId)) {
    await unsetFeatured(workspaceId, modelId);
    return false;
  }
  await setFeatured(workspaceId, modelId, null);
  return true;
}

export const featuredModelsDb = { getAll, isFeatured, setFeatured, unsetFeatured, toggle };
