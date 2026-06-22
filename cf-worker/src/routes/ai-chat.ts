/**
 * IA de Clozr — asistente conversacional (microtransacción por mensaje).
 *
 *   GET  /workspaces/:wid/ai          → estado de la billetera (créditos, gratis)
 *   POST /workspaces/:wid/ai/chat     → manda un mensaje y devuelve la respuesta
 *
 * Cobro: 1 mensaje gratis por workspace, después 1 crédito por mensaje. Solo se
 * descuenta si el modelo respondió OK (no cobramos errores). Usa Claude Sonnet
 * con un snapshot compacto del negocio inyectado en el system prompt — sin
 * Managed Agents, igual que el triage: 1 request → 1 llamada al modelo.
 */

import type { Env } from "../index";
import { requireAuth } from "../auth";
import { json, getRoleInWorkspace } from "./_generic";
import { tursoFirst } from "../turso";
import { getWallet, consume, canAfford, hasAiAccess, AI_ACTION_COSTS } from "../aiWallet";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800; // acota el costo por mensaje
const MAX_HISTORY = 12; // últimos N turnos que mandamos al modelo
const MAX_CHARS = 4000; // recorte por mensaje

const SYSTEM_BASE =
  "Sos la IA de Clozr, el asistente del CRM \"Clozr — el sistema operativo de tu negocio\". " +
  "Ayudás a cerrar ventas, organizar el inventario y los clientes, y a redactar mensajes (WhatsApp, etc.). " +
  "Respondé en español rioplatense, claro, breve y accionable: primero la respuesta, después el detalle. " +
  "Usá los datos del negocio que te paso abajo cuando sirvan; no inventes números que no tenés. " +
  "Si te piden algo fuera del negocio, redirigí con amabilidad.";

/** Snapshot barato del negocio para que el asistente no responda a ciegas. */
async function businessSnapshot(env: Env, wid: string): Promise<string> {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  try {
    const prod = await tursoFirst(
      env,
      `SELECT COUNT(*) c FROM catalog_items WHERE workspace_id = ? AND deleted_at IS NULL`,
      [wid],
    );
    const sinStock = await tursoFirst(
      env,
      `SELECT COUNT(*) c FROM catalog_items WHERE workspace_id = ? AND deleted_at IS NULL AND track_stock = 1 AND stock <= 0`,
      [wid],
    );
    const clientes = await tursoFirst(
      env,
      `SELECT COUNT(*) c FROM customers WHERE workspace_id = ? AND deleted_at IS NULL`,
      [wid],
    );
    const ventas = await tursoFirst(
      env,
      `SELECT COUNT(*) c, COALESCE(SUM(total), 0) t FROM sales
         WHERE workspace_id = ? AND deleted_at IS NULL
           AND substr(COALESCE(sale_date, created_at), 1, 7) = ?`,
      [wid, month],
    );
    return (
      `Datos del negocio (mes ${month}):\n` +
      `- Productos en catálogo: ${Number(prod?.c ?? 0)}\n` +
      `- Productos sin stock: ${Number(sinStock?.c ?? 0)}\n` +
      `- Clientes: ${Number(clientes?.c ?? 0)}\n` +
      `- Ventas del mes: ${Number(ventas?.c ?? 0)} por un total de $${Math.round(Number(ventas?.t ?? 0)).toLocaleString("es-AR")} ARS`
    );
  } catch {
    return "Datos del negocio: no disponibles en este momento.";
  }
}

export async function handleAiStatus(workspaceId: string, req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const wallet = await getWallet(env, workspaceId);
  const hasPlan = await hasAiAccess(env, workspaceId);
  return json({ ...wallet, enabled: !!env.ANTHROPIC_API_KEY, hasPlan });
}

export async function handleAiChat(workspaceId: string, req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);

  if (!(await hasAiAccess(env, workspaceId))) return json({ error: "ai_requires_plan" }, 403);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "ai_unavailable" }, 503);

  let body: { messages?: unknown };
  try { body = (await req.json()) as { messages?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages = raw
    .map((m) => m as { role?: unknown; content?: unknown })
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, MAX_CHARS) }))
    .slice(-MAX_HISTORY);
  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return json({ error: "no_message" }, 400);
  }

  // Gate: ¿le queda gratis o tiene créditos?
  const wallet = await getWallet(env, workspaceId);
  if (!canAfford(wallet, 1)) {
    return json({ error: "no_credits", wallet }, 402);
  }

  const system = `${SYSTEM_BASE}\n\n${await businessSnapshot(env, workspaceId)}`;

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }),
    });
  } catch (e) {
    console.error("[ai-chat] fetch a Anthropic falló:", e);
    return json({ error: "ai_upstream" }, 502);
  }
  if (!aiRes.ok) {
    console.error("[ai-chat] Anthropic rechazó:", aiRes.status);
    return json({ error: "ai_upstream", status: aiRes.status }, 502);
  }
  const data = (await aiRes.json().catch(() => null)) as
    | { content?: Array<{ type?: string; text?: string }> }
    | null;
  const reply = (data?.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!reply) return json({ error: "ai_empty" }, 502);

  // Recién ahora descontamos (no cobramos errores del modelo).
  const updated = (await consume(env, workspaceId, 1)) ?? wallet;
  return json({ reply, wallet: updated });
}

/* ── POST /workspaces/:wid/ai/action ──────────────────────────────────────
 * Acciones contextuales "Pro AI": generar un mensaje a partir del contexto del
 * cliente, o reescribir un texto cambiando el tono. El contexto llega del CRM
 * (la app lo arma), nunca se le pide al usuario. Cobra según AI_ACTION_COSTS. */

const GEN_KINDS: Record<string, string> = {
  primer_contacto: "primer contacto / presentación",
  seguimiento: "seguimiento de una conversación previa",
  reactivacion: "reactivar a un cliente que dejó de responder",
  agradecimiento: "agradecer una compra o el interés",
  cobranza: "recordar de forma amable un pago pendiente",
  confirmacion: "confirmar una compra, turno o envío",
  recordatorio: "recordar algo acordado",
  upselling: "ofrecer un producto o servicio adicional",
};

const TONES: Record<string, string> = {
  mas_corto: "más corto y al grano",
  mas_profesional: "más profesional",
  mas_vendedor: "más persuasivo y orientado a la venta",
  mas_amigable: "más amigable y cercano",
  mas_formal: "más formal",
  mas_argentino: "más coloquial argentino (rioplatense)",
  mas_directo: "más directo",
};

function formatContext(c: unknown): string {
  if (!c || typeof c !== "object") return "";
  const o = c as Record<string, unknown>;
  const lines: string[] = [];
  const add = (label: string, v: unknown) => {
    if (v != null && String(v).trim()) lines.push(`- ${label}: ${String(v).slice(0, 500)}`);
  };
  add("Cliente", o.cliente);
  add("Producto / interés", o.producto);
  add("Etapa del pipeline", o.etapa);
  add("Tipo de cliente", o.tipo);
  add("Presupuesto / monto", o.monto);
  add("Fuente del lead", o.fuente);
  add("Vendedor asignado", o.vendedor);
  if (o.ultimoContactoDias != null && o.ultimoContactoDias !== "") add("Días sin contacto", o.ultimoContactoDias);
  add("Compras", o.compras);
  add("Deuda", o.deuda);
  add("Historial / actividad", o.historial);
  add("Notas", o.notas);
  return lines.join("\n");
}

export async function handleAiAction(workspaceId: string, req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  if (!(await hasAiAccess(env, workspaceId))) return json({ error: "ai_requires_plan" }, 403);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "ai_unavailable" }, 503);

  let body: { action?: unknown; kind?: unknown; tone?: unknown; text?: unknown; context?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  const action = typeof body.action === "string" ? body.action : "";

  let system: string;
  let userContent: string;
  if (action === "generate") {
    const kind = typeof body.kind === "string" ? body.kind : "";
    const intent = GEN_KINDS[kind];
    if (!intent) return json({ error: "invalid_kind", allowed: Object.keys(GEN_KINDS) }, 400);
    const ctx = formatContext(body.context);
    system =
      "Sos la IA de Clozr, asistente comercial. Redactás mensajes de WhatsApp para vendedores argentinos. " +
      "Tono rioplatense, cercano y profesional; breve (2-4 frases). NUNCA inventes datos que no te den " +
      "(precios, fechas, plazos): si no los tenés, no los menciones. Devolvé SOLO el mensaje, sin comillas " +
      "ni encabezados ni explicaciones.";
    userContent = `Escribí un mensaje de ${intent} para este cliente.\n\n${ctx || "(sin datos extra)"}`;
  } else if (action === "rewrite") {
    const tone = typeof body.tone === "string" ? body.tone : "";
    const toneLabel = TONES[tone];
    const original = typeof body.text === "string" ? body.text.slice(0, MAX_CHARS) : "";
    if (!toneLabel) return json({ error: "invalid_tone", allowed: Object.keys(TONES) }, 400);
    if (!original.trim()) return json({ error: "no_text" }, 400);
    system =
      "Reescribí el mensaje que te paso cambiando SOLO el tono a: " + toneLabel + ". " +
      "No agregues ni inventes información, no cambies los datos. Mantené el idioma. " +
      "Devolvé SOLO el mensaje reescrito, sin comillas ni explicaciones.";
    userContent = original;
  } else if (action === "summary") {
    const ctx = formatContext(body.context);
    system =
      "Sos la IA de Clozr. Hacé un briefing comercial del cliente en 4-6 bullets MUY cortos: quién es, " +
      "su interés/historial, el estado actual, y cerrá con una recomendación concreta de próximo paso. " +
      "Usá SOLO los datos provistos; no inventes. Devolvé solo los bullets, cada uno empezando con '• '.";
    userContent = `Datos del cliente:\n${ctx || "(sin datos)"}`;
  } else if (action === "daybrief") {
    const c = body.context && typeof body.context === "object" ? (body.context as Record<string, unknown>) : {};
    const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
    const parts: string[] = [];
    if (num(c.seguimientos)) parts.push(`${num(c.seguimientos)} seguimientos pendientes`);
    if (num(c.cobros)) parts.push(`${num(c.cobros)} cobros pendientes${c.cobrosMonto ? ` (${String(c.cobrosMonto)})` : ""}`);
    if (num(c.inactivos)) parts.push(`${num(c.inactivos)} clientes inactivos`);
    if (num(c.tareas)) parts.push(`${num(c.tareas)} tareas pendientes`);
    if (num(c.ventasHoy)) parts.push(`${num(c.ventasHoy)} ventas hoy`);
    const cand = Array.isArray(c.candidatos)
      ? (c.candidatos as unknown[]).filter((x) => typeof x === "string").slice(0, 4).join(", ")
      : "";
    system =
      "Sos la IA de Clozr. Escribí un saludo brevísimo y UNA recomendación concreta del día para un " +
      "vendedor argentino, en 2-3 líneas como máximo, tono cercano. Usá SOLO los datos provistos; no " +
      "inventes. Nada de listas largas ni relleno.";
    userContent = `Números del día: ${parts.join("; ") || "sin pendientes"}.${cand ? ` Clientes a priorizar: ${cand}.` : ""}`;
  } else {
    return json({ error: "invalid_action", allowed: ["generate", "rewrite", "summary", "daybrief"] }, 400);
  }

  const cost = AI_ACTION_COSTS[action] ?? 1;
  const wallet = await getWallet(env, workspaceId);
  if (!canAfford(wallet, cost)) return json({ error: "no_credits", wallet, cost }, 402);

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (e) {
    console.error("[ai-action] fetch a Anthropic falló:", e);
    return json({ error: "ai_upstream" }, 502);
  }
  if (!aiRes.ok) return json({ error: "ai_upstream", status: aiRes.status }, 502);
  const data = (await aiRes.json().catch(() => null)) as
    | { content?: Array<{ type?: string; text?: string }> }
    | null;
  const out = (data?.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!out) return json({ error: "ai_empty" }, 502);

  const updated = (await consume(env, workspaceId, cost)) ?? wallet;
  return json({ text: out, wallet: updated });
}
