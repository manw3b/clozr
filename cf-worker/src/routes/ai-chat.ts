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
import { getWallet, consumeMessage, canSend } from "../aiWallet";

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
  return json({ ...wallet, enabled: !!env.ANTHROPIC_API_KEY });
}

export async function handleAiChat(workspaceId: string, req: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);

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
  if (!canSend(wallet)) {
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
  const updated = (await consumeMessage(env, workspaceId)) ?? wallet;
  return json({ reply, wallet: updated });
}
