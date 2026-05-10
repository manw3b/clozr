/**
 * Persistencia local del snapshot de cotizaciones del dólar AR.
 *
 * El backend es la tabla `dolar_rates`. Una fila por tipo (oficial, blue,
 * cripto, etc.). Globales — no son por-workspace porque el dólar es el
 * mismo para cualquier negocio en Argentina.
 */

import { dbSelect, dbExecute, runWrite } from './index';
import type { DolarRate } from '../dolaresAr';

interface DolarRateRow {
  kind: string;
  nombre: string;
  compra: number | null;
  venta: number;
  source_updated_at: string;
  fetched_at: string;
}

export async function getAll(): Promise<DolarRate[]> {
  const rows = await dbSelect<DolarRateRow>(
    'SELECT * FROM dolar_rates ORDER BY rowid ASC',
  );
  return rows.map((r) => ({
    kind: r.kind,
    nombre: r.nombre,
    compra: r.compra,
    venta: r.venta,
    sourceUpdatedAt: r.source_updated_at,
  }));
}

export async function getOne(kind: string): Promise<DolarRate | null> {
  const rows = await dbSelect<DolarRateRow>(
    'SELECT * FROM dolar_rates WHERE kind = ? LIMIT 1',
    [kind],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    kind: r.kind,
    nombre: r.nombre,
    compra: r.compra,
    venta: r.venta,
    sourceUpdatedAt: r.source_updated_at,
  };
}

/**
 * Fecha del último fetch exitoso (la más reciente entre todas las filas).
 * Sirve para mostrar "Actualizado hace X" en el UI.
 */
export async function getLastFetchedAt(): Promise<string | null> {
  const rows = await dbSelect<{ last_fetched: string }>(
    "SELECT MAX(fetched_at) as last_fetched FROM dolar_rates",
  );
  return rows[0]?.last_fetched ?? null;
}

export async function saveSnapshot(rates: DolarRate[]): Promise<void> {
  if (rates.length === 0) return;
  const fetchedAt = new Date().toISOString();
  await runWrite(async () => {
    for (const r of rates) {
      await dbExecute(
        `INSERT INTO dolar_rates (kind, nombre, compra, venta, source_updated_at, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(kind) DO UPDATE SET
           nombre = excluded.nombre,
           compra = excluded.compra,
           venta = excluded.venta,
           source_updated_at = excluded.source_updated_at,
           fetched_at = excluded.fetched_at`,
        [r.kind, r.nombre, r.compra, r.venta, r.sourceUpdatedAt, fetchedAt],
      );
    }
  });
}

export const dolaresArDb = {
  getAll,
  getOne,
  getLastFetchedAt,
  saveSnapshot,
};
