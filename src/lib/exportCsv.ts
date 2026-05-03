/**
 * Exporta una colección a CSV (UTF-8 con BOM para que Excel ARG abra correcto).
 *
 * Ejemplo:
 *   exportToCsv("ventas-2026-01.csv", rows, [
 *     ["Nro", (r) => r.number],
 *     ["Cliente", (r) => r.clientName],
 *     ["Monto", (r) => r.amount],
 *   ]);
 */
type ColExtractor<T> = (row: T) => string | number | null | undefined;

export function exportToCsv<T>(
  filename: string,
  rows: T[],
  columns: Array<[string, ColExtractor<T>]>,
): void {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headers = columns.map(([h]) => escape(h)).join(",");
  const body = rows
    .map((row) => columns.map(([, get]) => escape(get(row))).join(","))
    .join("\n");
  const csv = "﻿" + headers + "\n" + body; // BOM for Excel UTF-8

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function timestamp(): string {
  return new Date().toISOString().slice(0, 10);
}
