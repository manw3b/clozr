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

/* ────────────────────────────────────────────────────────────
 *  CSV PARSER — import desde archivos del usuario
 * ──────────────────────────────────────────────────────────── */

/**
 * Parser delimited (CSV o TSV) minimalista que maneja comillas dobles,
 * escape "" → ", BOM, CRLF/LF. Cubre el 99% de los archivos que salen
 * de Excel, Google Sheets, contactos exportados de iPhone/Android.
 *
 * Detecta automáticamente si es TSV (tab-separated) si la primera línea
 * tiene tabs y no comas. Si no, usa coma como separador.
 *
 * Returns: array de filas, cada fila es array de strings.
 */
export function parseCsv(text: string): string[][] {
  return parseDelimited(text, autoDetectDelimiter(text));
}

/** Mismo parser, pero con delimitador explícito (',' o '\t'). */
export function parseTsv(text: string): string[][] {
  return parseDelimited(text, "\t");
}

function autoDetectDelimiter(text: string): "," | "\t" {
  // Mirar la primera línea no-vacía
  const sample = text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const tabs = (sample.match(/\t/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  // Si hay tabs y no comas (o más tabs que comas), es TSV
  return tabs > 0 && tabs >= commas ? "\t" : ",";
}

function parseDelimited(text: string, delim: "," | "\t"): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delim) { row.push(cell); cell = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += c;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}
