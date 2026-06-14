/**
 * AI Triage matutino (PoC) — "Clozr trabaja de noche por vos".
 *
 * Corre por cron (ver wrangler.toml [triggers]). Para cada workspace con
 * oportunidades estancadas (open, sin movimiento hace STALE_DAYS+ días):
 *   1. junta los leads estancados (capeados por workspace para acotar costo),
 *   2. una sola llamada a la API de Claude (Haiku — rápido y barato) que
 *      redacta el follow-up sugerido por lead,
 *   3. inserta una `task` tipo followup por lead, con el mensaje en `notes`.
 *
 * Por qué así y no Managed Agents: esto es 1 cron (infra propia de CF) + 1
 * llamada al modelo. No necesita contenedor/sesión/tools. Costo ~centavos
 * por workspace/día con Haiku. Si más adelante el agente necesita encadenar
 * herramientas de forma autónoma, recién ahí evaluar Managed Agents.
 *
 * Multi-tenant: TODA query filtra por workspace_id. El loop procesa cada
 * workspace por separado y NUNCA cruza datos entre inquilinos.
 *
 * Idempotente: no recrea una task de ai-triage para el mismo cliente el
 * mismo día (ver NOT EXISTS abajo). Correrlo dos veces no duplica.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { tursoQuery, tursoExec, type TursoArg } from "../turso";

/** Días sin updates para considerar un lead "estancado". */
const STALE_DAYS = 5;
/** Cap de leads por workspace por corrida — acota tokens/costo. */
const MAX_LEADS_PER_WS = 15;
/** Haiku 4.5: el más barato/rápido, sobra para redactar un follow-up. */
const MODEL = "claude-haiku-4-5-20251001";
/** Marcador para idempotencia + para distinguir tasks creadas por la IA. */
const TRIAGE_TAG = "ai-triage";

interface StaleLead {
  id: string;
  customer_id: string;
  customer_name: string | null;
  stage_name: string;
  estimated_value: number | null;
  currency: string | null;
  short_note: string | null;
  owner_id: string | null;
  updated_at: string;
}

export interface TriageResult {
  workspaces: number;
  tasksCreated: number;
  skipped?: string;
}

/** Punto de entrada — lo llaman el handler `scheduled` y el trigger manual. */
export async function runAiTriage(env: Env): Promise<TriageResult> {
  await ensureSchema(env);

  if (!env.ANTHROPIC_API_KEY) {
    console.log("[ai-triage] ANTHROPIC_API_KEY no seteado — skip");
    return { workspaces: 0, tasksCreated: 0, skipped: "no_api_key" };
  }

  // Workspaces que tienen al menos un lead abierto y estancado.
  const [wsRows] = await tursoQuery(env, {
    sql: `SELECT DISTINCT workspace_id FROM pipeline_items
            WHERE status = 'open' AND deleted_at IS NULL
              AND updated_at < datetime('now', ?)`,
    args: [`-${STALE_DAYS} days`],
  });

  let tasksCreated = 0;
  for (const ws of wsRows ?? []) {
    const wid = String(ws.workspace_id);
    try {
      tasksCreated += await triageWorkspace(env, wid);
    } catch (err) {
      // Un workspace que falla (datos raros, timeout del modelo) no debe
      // tumbar al resto. Logueamos y seguimos.
      console.error(`[ai-triage] workspace ${wid} falló:`, err);
    }
  }

  console.log(`[ai-triage] listo: ${(wsRows ?? []).length} workspaces, ${tasksCreated} tasks`);
  return { workspaces: (wsRows ?? []).length, tasksCreated };
}

async function triageWorkspace(env: Env, workspaceId: string): Promise<number> {
  // Leads estancados de ESTE workspace, excluyendo los que ya tienen una
  // task de ai-triage creada hoy (idempotencia). Priorizamos por valor.
  const [leads] = await tursoQuery(env, {
    sql: `SELECT pi.id, pi.customer_id, pi.customer_name, pi.stage_name,
                 pi.estimated_value, pi.currency, pi.short_note, pi.owner_id,
                 pi.updated_at
            FROM pipeline_items pi
           WHERE pi.workspace_id = ?
             AND pi.status = 'open' AND pi.deleted_at IS NULL
             AND pi.updated_at < datetime('now', ?)
             AND NOT EXISTS (
               SELECT 1 FROM tasks t
                WHERE t.workspace_id = pi.workspace_id
                  AND t.customer_id = pi.customer_id
                  AND t.template_id = ?
                  AND date(t.created_at) = date('now')
                  AND t.deleted_at IS NULL
             )
           ORDER BY (pi.estimated_value IS NULL), pi.estimated_value DESC
           LIMIT ?`,
    args: [workspaceId, `-${STALE_DAYS} days`, TRIAGE_TAG, MAX_LEADS_PER_WS],
  });

  if (!leads || leads.length === 0) return 0;

  const typed = leads as unknown as StaleLead[];
  const suggestions = await suggestFollowups(env, typed);

  let created = 0;
  for (const lead of typed) {
    const mensaje = suggestions[lead.id];
    if (!mensaje) continue;
    await tursoExec(
      env,
      `INSERT INTO tasks
         (id, workspace_id, type, title, notes, due_at, assigned_to,
          customer_id, template_id, created_by)
       VALUES (?, ?, 'followup', ?, ?, date('now'), ?, ?, ?, NULL)`,
      [
        crypto.randomUUID(),
        workspaceId,
        `Seguir: ${lead.customer_name ?? "cliente sin nombre"}`,
        mensaje,
        lead.owner_id ?? null,
        lead.customer_id,
        TRIAGE_TAG,
      ] as TursoArg[],
    );
    created++;
  }
  return created;
}

/**
 * Una sola llamada a la API de Claude. Le pasamos los leads y pedimos un
 * JSON array {id, mensaje}. Devolvemos un map id→mensaje.
 */
async function suggestFollowups(
  env: Env,
  leads: StaleLead[],
): Promise<Record<string, string>> {
  const list = leads.map((l) => ({
    id: l.id,
    cliente: l.customer_name ?? "Sin nombre",
    etapa: l.stage_name,
    valor: l.estimated_value != null ? `${l.estimated_value} ${l.currency ?? "ARS"}` : "s/d",
    nota: l.short_note ?? "",
    sin_movimiento_desde: l.updated_at,
  }));

  const system =
    "Sos un asistente de ventas para un CRM de PyMEs latinoamericanas. " +
    "Te paso oportunidades de venta estancadas (sin movimiento hace días). " +
    "Para cada una, redactá un mensaje de seguimiento breve (1-2 frases), " +
    "cálido y natural, en español rioplatense, listo para enviar por WhatsApp. " +
    "No inventes datos que no estén. Devolvé ÚNICAMENTE un JSON array de objetos " +
    'con la forma {"id": "<id del lead>", "mensaje": "<texto>"}, sin texto extra.';

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [
        { role: "user", content: "Oportunidades:\n" + JSON.stringify(list, null, 2) },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`[ai-triage] Anthropic HTTP ${res.status}: ${t.slice(0, 300)}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");

  const out: Record<string, string> = {};
  for (const item of extractJsonArray(text)) {
    if (item && typeof item.id === "string" && typeof item.mensaje === "string") {
      out[item.id] = item.mensaje.trim();
    }
  }
  return out;
}

/** Parseo defensivo: extrae el primer array JSON del texto del modelo. */
function extractJsonArray(text: string): Array<{ id?: unknown; mensaje?: unknown }> {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error("[ai-triage] no se pudo parsear el JSON del modelo");
    return [];
  }
}
