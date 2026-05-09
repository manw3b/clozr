/**
 * Helpers de agrupamiento / agregación de datos del dominio.
 * No consultan DB ni dependen de mock — son pures.
 */
import type { Lead, Sale } from "../types/domain";

/**
 * Agrupa leads por stage, ordenados por `position` asc dentro de cada columna.
 *
 * Crea buckets on-the-fly para cualquier stage id que aparezca en `leads`
 * (soporta etapas custom del workspace). El caller renderiza las columnas
 * en base a su propia lista de stages — si un lead apunta a un id que ya
 * no existe en la config, igual queda accesible vía `grouped[id]` para
 * que la app pueda detectarlo.
 */
export function groupLeadsByStage(leads: Lead[]): Record<string, Lead[]> {
  const grouped: Record<string, Lead[]> = {};
  for (const lead of leads) {
    const arr = grouped[lead.stage] ?? (grouped[lead.stage] = []);
    arr.push(lead);
  }
  for (const k of Object.keys(grouped)) {
    grouped[k]?.sort((a, b) => (a.position || 0) - (b.position || 0));
  }
  return grouped;
}

/** Construye buckets diarios (últimos N días) sumando ventas por día. */
export function buildSalesTimeline(
  sales: Sale[],
  days: number = 30,
): Array<{ date: string; total: number; count: number }> {
  const buckets: Array<{ date: string; total: number; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    const end = start + 86_400_000;
    let total = 0;
    let count = 0;
    for (const s of sales) {
      const t = new Date(s.createdAt).getTime();
      if (t >= start && t < end) {
        total += s.amount;
        count++;
      }
    }
    buckets.push({ date: d.toISOString(), total, count });
  }
  return buckets;
}
