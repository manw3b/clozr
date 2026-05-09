/**
 * KV de configuración por workspace.
 *
 * Sirve para guardar pequeños ajustes (plantillas de mensajes, contadores,
 * dirección del local, etc.) sin tener que crear una tabla nueva o agregar
 * columnas a `workspaces` por cada feature. Si una clave crece a algo
 * estructurado (ej: lista de plantillas), se le crea su propia tabla.
 */

import { dbSelect, dbExecute, getDb } from "./index";
import type { WorkspaceSettingRow } from "./types";

export async function get(workspaceId: string, key: string): Promise<string | null> {
  const rows = await dbSelect<WorkspaceSettingRow>(
    "SELECT * FROM workspace_settings WHERE workspace_id = ? AND key = ?",
    [workspaceId, key],
  );
  return rows[0]?.value ?? null;
}

export async function getMany(
  workspaceId: string,
  keys: string[],
): Promise<Record<string, string | null>> {
  if (keys.length === 0) return {};
  const placeholders = keys.map(() => "?").join(",");
  const rows = await dbSelect<WorkspaceSettingRow>(
    `SELECT * FROM workspace_settings WHERE workspace_id = ? AND key IN (${placeholders})`,
    [workspaceId, ...keys],
  );
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = null;
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function set(
  workspaceId: string,
  key: string,
  value: string | null,
): Promise<void> {
  await dbExecute(
    `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(workspace_id, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [workspaceId, key, value],
  );
}

export async function setMany(
  workspaceId: string,
  values: Record<string, string | null>,
): Promise<void> {
  const entries = Object.entries(values);
  if (entries.length === 0) return;
  const db = await getDb();
  await db.execute("BEGIN", []);
  try {
    for (const [k, v] of entries) {
      await db.execute(
        `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(workspace_id, key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
        [workspaceId, k, v],
      );
    }
    await db.execute("COMMIT", []);
  } catch (e) {
    await db.execute("ROLLBACK", []).catch(() => {});
    throw e;
  }
}

/**
 * Incrementa atómicamente un contador entero y devuelve el nuevo valor.
 * Si la clave no existe se inicializa en `start` (default 1) y devuelve `start`.
 *
 * Lo usamos para asignar el código de pedido a clientes mayoristas (B1202,
 * B1203, …). SQLite no tiene secuencias nativas, así que envolvemos en
 * una transacción + UPDATE atómico.
 */
export async function bumpCounter(
  workspaceId: string,
  key: string,
  start = 1,
): Promise<number> {
  const db = await getDb();
  await db.execute("BEGIN", []);
  try {
    const rows = await db.select<Array<{ value: string | null }>>(
      "SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = ?",
      [workspaceId, key],
    );
    const current = rows[0]?.value ? parseInt(rows[0].value, 10) : null;
    const next = Number.isFinite(current as number) ? (current as number) + 1 : start;
    await db.execute(
      `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [workspaceId, key, String(next)],
    );
    await db.execute("COMMIT", []);
    return next;
  } catch (e) {
    await db.execute("ROLLBACK", []).catch(() => {});
    throw e;
  }
}

export const workspaceSettings = {
  get,
  getMany,
  set,
  setMany,
  bumpCounter,
};
