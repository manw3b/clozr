/**
 * Cliente mínimo de Turso para Workers.
 *
 * Usamos el endpoint `/v2/pipeline` directamente vía fetch — mismo
 * patrón que validamos en el spike Tauri-Rust. Sin libsql SDK (no
 * funciona en Workers por usar APIs Node-only).
 *
 * El endpoint acepta un array de "requests" en orden y devuelve un
 * array de "results" con la misma cardinalidad. Soporta queries con
 * args posicionales y named.
 *
 * Docs: https://docs.turso.tech/sdk/http/reference
 */

export interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
}

/** Argumento a un statement: lo serializamos al shape que pide /v2. */
export type TursoArg = string | number | null | boolean;

interface PipelineRequest {
  type: "execute" | "close";
  stmt?: {
    sql: string;
    args?: Array<{ type: "text" | "integer" | "null" | "blob" | "float"; value?: string }>;
  };
}

interface PipelineRow {
  type: "text" | "integer" | "null" | "blob" | "float";
  value?: string;
}

interface PipelineExecuteResult {
  type: "ok";
  response: {
    type: "execute";
    result: {
      cols: Array<{ name: string; decltype: string | null }>;
      rows: PipelineRow[][];
      affected_row_count: number;
      last_insert_rowid: string | null;
    };
  };
}

interface PipelineErrorResult {
  type: "error";
  error: { message: string; code?: string };
}

type PipelineResult = PipelineExecuteResult | PipelineErrorResult | { type: "ok"; response: { type: "close" } };

interface PipelineResponse {
  baton: string | null;
  base_url: string | null;
  results: PipelineResult[];
}

/** Devuelve filas como objects (col_name → value). Strings y números
 *  ya tipados. Null si la columna era NULL.  */
export type Row = Record<string, string | number | null>;

/**
 * Ejecuta uno o varios statements en una sola request HTTP.
 * Devuelve un array con las filas (vacío si era INSERT/UPDATE/DELETE).
 *
 * Lanza Error si Turso devuelve type:error o si la HTTP falla.
 */
export async function tursoQuery(
  env: Env,
  ...statements: Array<{ sql: string; args?: TursoArg[] }>
): Promise<Row[][]> {
  if (statements.length === 0) return [];

  const url = env.TURSO_DATABASE_URL.replace(/^libsql:/, "https:") + "/v2/pipeline";

  const body: { requests: PipelineRequest[] } = {
    requests: [
      ...statements.map<PipelineRequest>((s) => ({
        type: "execute",
        stmt: {
          sql: s.sql,
          args: (s.args ?? []).map(serializeArg),
        },
      })),
      { type: "close" },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[turso] HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as PipelineResponse;

  const out: Row[][] = [];
  for (let i = 0; i < statements.length; i++) {
    const r = data.results[i];
    if (!r) throw new Error(`[turso] missing result for statement ${i}`);
    if (r.type === "error") {
      throw new Error(`[turso] ${r.error.message}`);
    }
    if (r.response.type === "close") continue;
    const exec = r.response;
    const cols = exec.result.cols.map((c) => c.name);
    out.push(
      exec.result.rows.map((row) => {
        const obj: Row = {};
        for (let c = 0; c < cols.length; c++) {
          const colName = cols[c];
          const cell = row[c];
          if (!colName) continue;
          obj[colName] = deserializeCell(cell);
        }
        return obj;
      }),
    );
  }
  return out;
}

/** Convenience: ejecuta un solo statement y devuelve la primera fila o null. */
export async function tursoFirst(
  env: Env,
  sql: string,
  args?: TursoArg[],
): Promise<Row | null> {
  const [rows] = await tursoQuery(env, { sql, args });
  return rows?.[0] ?? null;
}

/** Convenience: ejecuta un solo statement, ignora result, retorna void. */
export async function tursoExec(
  env: Env,
  sql: string,
  args?: TursoArg[],
): Promise<void> {
  await tursoQuery(env, { sql, args });
}

function serializeArg(v: TursoArg): { type: "text" | "integer" | "null" | "float"; value?: string } {
  if (v === null) return { type: "null" };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { type: "integer", value: String(v) }
      : { type: "float", value: String(v) };
  }
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  return { type: "text", value: String(v) };
}

function deserializeCell(cell: PipelineRow | undefined): string | number | null {
  if (!cell || cell.type === "null") return null;
  if (cell.value === undefined) return null;
  if (cell.type === "integer") return Number(cell.value);
  if (cell.type === "float") return Number(cell.value);
  return cell.value;
}
