/**
 * Backup diario de la base a R2 (privado) — capa 2 de la estrategia de backups.
 *
 * Vuelca TODAS las tablas de usuario a un único JSON en el bucket PRIVADO
 * `clozr-backups`, con clave `dump/YYYY-MM-DD.json`. El JSON incluye el esquema
 * (CREATE TABLE de cada tabla) + las filas, así es auto-describible y restaurable
 * (ver RESTORE_BACKUP.md).
 *
 * Por qué JSON y no .sql: el cliente libsql devuelve valores JS planos
 * (string/number/null) que JSON.stringify serializa sin riesgo de escaping; un
 * .sql armado a mano es más frágil. El restore recrea el esquema y reinserta
 * desde el JSON.
 *
 * IMPORTANTE: va a un bucket PRIVADO aparte — NO el de `ASSETS`, que se sirve
 * público en /assets/...). Corre en el trigger diario (ver index.ts scheduled).
 * Idempotente: re-correr el mismo día sobre-escribe el dump de ese día.
 *
 * Límite de escala: arma el dump en memoria (~128MB del worker). Para la escala
 * actual sobra; si una tabla supera MAX_ROWS_PER_TABLE se LOGUEA (no se trunca
 * en silencio) para migrar a un dump por streaming cuando haga falta.
 */

import type { Env } from "../index";
import { tursoQuery } from "../turso";

const MAX_ROWS_PER_TABLE = 200_000;
const RETAIN_DAYS = 30;

export interface BackupResult {
  ok: boolean;
  key?: string;
  tables: number;
  rows: number;
  bytes: number;
  truncatedTables: string[];
}

export async function runBackup(env: Env): Promise<BackupResult> {
  if (!env.BACKUPS) {
    console.warn("[cron] backup: binding BACKUPS no configurado — skip");
    return { ok: false, tables: 0, rows: 0, bytes: 0, truncatedTables: [] };
  }

  // Tablas de usuario (excluye internas de sqlite). Los nombres salen de
  // sqlite_master (no de input del usuario) → seguro interpolarlos abajo.
  const [tableRows] = await tursoQuery(env, {
    sql: `SELECT name, sql FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name`,
    args: [],
  });
  const tables = (tableRows ?? []) as Array<{ name: string; sql: string | null }>;

  const dump: {
    generatedAt: string;
    database: string;
    tables: Array<{ name: string; createSql: string | null; rowCount: number; rows: unknown[] }>;
  } = {
    generatedAt: new Date().toISOString(),
    database: "clozr",
    tables: [],
  };

  let totalRows = 0;
  const truncatedTables: string[] = [];

  for (const t of tables) {
    const name = String(t.name);
    const [rows] = await tursoQuery(env, {
      sql: `SELECT * FROM "${name}" LIMIT ${MAX_ROWS_PER_TABLE + 1}`,
      args: [],
    });
    const data = rows ?? [];
    let kept: unknown[] = data;
    if (data.length > MAX_ROWS_PER_TABLE) {
      kept = data.slice(0, MAX_ROWS_PER_TABLE);
      truncatedTables.push(name);
      console.warn(`[cron] backup: tabla ${name} supera ${MAX_ROWS_PER_TABLE} filas — dump PARCIAL`);
    }
    dump.tables.push({ name, createSql: t.sql ?? null, rowCount: kept.length, rows: kept });
    totalRows += kept.length;
  }

  const body = JSON.stringify(dump);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `dump/${today}.json`;
  await env.BACKUPS.put(key, body, { httpMetadata: { contentType: "application/json" } });

  // Retención best-effort: borra dumps más viejos que RETAIN_DAYS.
  await pruneOldBackups(env, RETAIN_DAYS).catch((e) => console.error("[cron] backup prune:", e));

  const result: BackupResult = {
    ok: true,
    key,
    tables: dump.tables.length,
    rows: totalRows,
    bytes: body.length,
    truncatedTables,
  };
  console.log(
    `[cron] backup OK: ${result.tables} tablas, ${result.rows} filas, ${(result.bytes / 1024).toFixed(0)}KB → ${key}`,
  );
  return result;
}

/** Borra los dumps `dump/YYYY-MM-DD.json` anteriores al corte de retención. */
async function pruneOldBackups(env: Env, retainDays: number): Promise<void> {
  const bucket = env.BACKUPS;
  if (!bucket) return;
  const cutoff = new Date(Date.now() - retainDays * 86_400_000).toISOString().slice(0, 10);
  const listed = await bucket.list({ prefix: "dump/" });
  for (const obj of listed.objects) {
    const day = obj.key.match(/^dump\/(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
    if (day && day < cutoff) await bucket.delete(obj.key);
  }
}
