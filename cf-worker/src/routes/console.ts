/**
 * Consola Clozr — Fase 1: códigos canjeables (licencia + descuento).
 *
 * Rutas (todas super-admin, gateadas por requireSuperAdmin):
 *   GET    /console/codes            → lista todos los códigos + uso
 *   POST   /console/codes            → crea un código (licencia o descuento)
 *   PATCH  /console/codes/:id        → deshabilitar / editar nota / límites
 *
 * Canje (lo pega el OWNER de un workspace, no el super-admin):
 *   POST   /workspaces/:wid/redeem-code   { code }
 *     - licencia  → activa plan (pro/team) gratis en el workspace, con expiry.
 *     - descuento → registra el canje y devuelve el descuento (la aplicación
 *                   al checkout MP es de una fase posterior).
 *
 * El enforcement es server-side: el frontend oculta la UI pero cada endpoint
 * revalida el gate. Ver superadmin.ts.
 */

import type { Env } from "../index";
import { ensureSchema, ensureConsoleSchema, ensureWorkspaceColumns } from "../schema";
import { requireAuth } from "../auth";
import { requireSuperAdmin } from "../superadmin";
import { tursoQuery, tursoFirst, tursoExec, tursoTransaction, type TursoArg } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePerm } from "../permissions";
import { PLAN_CONFIG } from "./billing";
import { unlockCatalog } from "../catalog";

/* ── helpers ─────────────────────────────────────────────────────────── */

/** Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para códigos legibles. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Genera "CLOZR-XXXX-XXXX" con entropía de crypto. */
function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    if (i === 3) s += "-";
  }
  return `CLOZR-${s}`;
}

/** Normaliza un código tipeado por el usuario: mayúsculas, sin espacios. */
function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function asPosInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n > 0 ? n : null;
}

/** ¿El código está vigente para canjear? (no deshabilitado, no vencido, con cupo) */
function codeRedeemableError(code: Record<string, unknown>): string | null {
  if (code.disabled_at) return "code_disabled";
  const expiresAt = code.expires_at ? String(code.expires_at) : null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "code_expired";
  const maxUses = code.max_uses == null ? null : Number(code.max_uses);
  const uses = Number(code.uses ?? 0);
  if (maxUses != null && uses >= maxUses) return "code_exhausted";
  return null;
}

/* ── GET /console/codes ──────────────────────────────────────────────── */

export async function handleListCodes(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const gate = await requireSuperAdmin(req, env);
  if (gate instanceof Response) return gate;
  await ensureConsoleSchema(env);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT id, code, kind, plan, duration_days, discount_type, discount_value, target,
                 max_uses, uses, expires_at, note, created_at, disabled_at
            FROM console_codes
           ORDER BY created_at DESC`,
  });
  return json({ items: rows ?? [] });
}

/* ── POST /console/codes ─────────────────────────────────────────────── */

export async function handleCreateCode(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const gate = await requireSuperAdmin(req, env);
  if (gate instanceof Response) return gate;
  await ensureConsoleSchema(env);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  const kind = body.kind === "license" || body.kind === "discount" || body.kind === "unlock" ? body.kind : null;
  if (!kind) return json({ error: "invalid_kind", allowed: ["license", "discount", "unlock"] }, 400);

  // Campos comunes opcionales.
  const maxUses = body.max_uses == null ? null : asPosInt(body.max_uses);
  if (body.max_uses != null && maxUses == null) return json({ error: "invalid_max_uses" }, 400);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  let expiresAt: string | null = null;
  if (body.expires_at != null) {
    if (typeof body.expires_at !== "string" || Number.isNaN(new Date(body.expires_at).getTime())) {
      return json({ error: "invalid_expires_at" }, 400);
    }
    expiresAt = body.expires_at;
  }

  // Campos por tipo.
  let plan: string | null = null;
  let durationDays: number | null = null;
  let discountType: string | null = null;
  let discountValue: number | null = null;
  let target: string | null = null;

  if (kind === "license") {
    plan = body.plan === "pro" || body.plan === "team" ? body.plan : null;
    if (!plan) return json({ error: "invalid_plan", allowed: ["pro", "team"] }, 400);
    if (body.duration_days != null) {
      durationDays = asPosInt(body.duration_days);
      if (durationDays == null) return json({ error: "invalid_duration_days" }, 400);
    }
  } else if (kind === "discount") {
    discountType = body.discount_type === "percent" || body.discount_type === "amount" ? body.discount_type : null;
    if (!discountType) return json({ error: "invalid_discount_type", allowed: ["percent", "amount"] }, 400);
    discountValue = asPosInt(body.discount_value);
    if (discountValue == null) return json({ error: "invalid_discount_value" }, 400);
    if (discountType === "percent" && discountValue > 100) return json({ error: "invalid_discount_value", max: 100 }, 400);
    // A qué apunta el descuento (default: todo).
    const allowedTargets = ["all", "plan:any", "plan:pro", "plan:team", "catalog:any", "catalog:apple"];
    target = typeof body.target === "string" && body.target.trim() ? body.target.trim() : "all";
    if (!allowedTargets.includes(target)) return json({ error: "invalid_target", allowed: allowedTargets }, 400);
  } else {
    // unlock: target = "catalog:<key>" (ej "catalog:apple").
    target = typeof body.target === "string" ? body.target.trim().toLowerCase() : "";
    if (!/^catalog:[a-z0-9_-]+$/.test(target)) {
      return json({ error: "invalid_target", hint: "catalog:<key>" }, 400);
    }
  }

  // Código: el cliente puede sugerir uno (custom/vanity) o lo generamos.
  let code = typeof body.code === "string" && body.code.trim() ? normalizeCode(body.code) : generateCode();
  if (code.length < 4 || code.length > 64) return json({ error: "invalid_code" }, 400);

  const id = crypto.randomUUID();
  try {
    await tursoExec(
      env,
      `INSERT INTO console_codes
         (id, code, kind, plan, duration_days, discount_type, discount_value,
          target, max_uses, uses, expires_at, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'))`,
      [id, code, kind, plan, durationDays, discountType, discountValue, target, maxUses, expiresAt, note, gate.userId],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
    if (msg.includes("unique") || msg.includes("constraint")) {
      return json({ error: "code_already_exists", code }, 409);
    }
    throw e;
  }

  return json({
    ok: true,
    code: {
      id, code, kind, plan, duration_days: durationDays,
      discount_type: discountType, discount_value: discountValue, target,
      max_uses: maxUses, uses: 0, expires_at: expiresAt, note, disabled_at: null,
    },
  }, 201);
}

/* ── PATCH /console/codes/:id ────────────────────────────────────────── */

export async function handleUpdateCode(codeId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const gate = await requireSuperAdmin(req, env);
  if (gate instanceof Response) return gate;
  await ensureConsoleSchema(env);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  const sets: string[] = [];
  const args: TursoArg[] = [];

  if (typeof body.disabled === "boolean") {
    sets.push(body.disabled ? "disabled_at = datetime('now')" : "disabled_at = NULL");
  }
  if ("note" in body) {
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    sets.push("note = ?"); args.push(note);
  }
  if ("max_uses" in body) {
    const maxUses = body.max_uses == null ? null : asPosInt(body.max_uses);
    if (body.max_uses != null && maxUses == null) return json({ error: "invalid_max_uses" }, 400);
    sets.push("max_uses = ?"); args.push(maxUses);
  }
  if ("expires_at" in body) {
    let expiresAt: string | null = null;
    if (body.expires_at != null) {
      if (typeof body.expires_at !== "string" || Number.isNaN(new Date(body.expires_at).getTime())) {
        return json({ error: "invalid_expires_at" }, 400);
      }
      expiresAt = body.expires_at;
    }
    sets.push("expires_at = ?"); args.push(expiresAt);
  }

  if (sets.length === 0) return json({ error: "no_fields" }, 400);

  const exists = await tursoFirst(env, `SELECT id FROM console_codes WHERE id = ?`, [codeId]);
  if (!exists) return json({ error: "not_found" }, 404);

  args.push(codeId);
  await tursoExec(env, `UPDATE console_codes SET ${sets.join(", ")} WHERE id = ?`, args);
  return json({ ok: true });
}

/* ── GET /console/workspaces ─────────────────────────────────────────── */

/**
 * Panel de cuentas: todos los workspaces de la plataforma con su dueño
 * (contacto), plan, estado, # de miembros y fecha de creación. Distingue
 * pago real (mp_preapproval_id) de licencia gratis (license_expires_at).
 */
export async function handleListConsoleWorkspaces(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const gate = await requireSuperAdmin(req, env);
  if (gate instanceof Response) return gate;
  // Garantiza la columna license_expires_at (la agrega ensureConsoleSchema).
  await ensureConsoleSchema(env);

  const [rows, userCountRows] = await tursoQuery(
    env,
    {
      sql: `SELECT w.id, w.name, w.plan, w.seats, w.plan_status, w.created_at,
                   w.license_expires_at, w.mp_preapproval_id,
                   u.email AS owner_email, u.name AS owner_name,
                   (SELECT COUNT(*) FROM memberships m
                      WHERE m.workspace_id = w.id AND m.status = 'active') AS member_count
              FROM cloud_workspaces w
              LEFT JOIN users u ON u.id = w.owner_user_id
             ORDER BY w.created_at DESC`,
    },
    { sql: `SELECT COUNT(*) AS n FROM users` },
  );

  return json({ items: rows ?? [], total_users: Number(userCountRows?.[0]?.n ?? 0) });
}

/* ── POST /workspaces/:wid/redeem-code ───────────────────────────────── */
export async function handleRedeemCode(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  // Canjear cambia el plan / aplica un beneficio de billing → solo quien
  // gestiona la facturación del workspace (owner).
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "billing.manage");
  if (denied) return denied;

  await ensureConsoleSchema(env);

  let body: { code?: unknown };
  try { body = (await req.json()) as { code?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.code !== "string" || !body.code.trim()) return json({ error: "missing_code" }, 400);
  const code = normalizeCode(body.code);

  const row = await tursoFirst(
    env,
    `SELECT id, code, kind, plan, duration_days, discount_type, discount_value, target,
            referrer_workspace_id, max_uses, uses, expires_at, disabled_at
       FROM console_codes WHERE code = ?`,
    [code],
  );
  if (!row) return json({ error: "code_not_found" }, 404);

  const invalid = codeRedeemableError(row);
  if (invalid) return json({ error: invalid }, 409);

  const codeId = String(row.id);
  const kind = String(row.kind);

  if (kind === "license") {
    const plan = String(row.plan ?? "");
    const cfg = PLAN_CONFIG[plan];
    if (!cfg) return json({ error: "invalid_license_plan" }, 422);

    // Vigencia del plan activado: duration_days desde hoy; si no, usa el
    // expires_at del propio código; si no, perpetuo (NULL).
    let licenseExpiresAt: string | null = null;
    if (row.duration_days != null) {
      const days = Number(row.duration_days);
      licenseExpiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    } else if (row.expires_at) {
      licenseExpiresAt = String(row.expires_at);
    }

    const redemptionId = crypto.randomUUID();
    await tursoTransaction(
      env,
      {
        sql: `UPDATE cloud_workspaces
                 SET plan = ?, seats = ?, plan_status = 'active',
                     license_expires_at = ?, mp_preapproval_id = NULL,
                     plan_status_changed_at = NULL, updated_at = datetime('now')
               WHERE id = ?`,
        args: [plan, cfg.baseSeats, licenseExpiresAt, workspaceId],
      },
      {
        sql: `UPDATE console_codes SET uses = uses + 1
                WHERE id = ? AND (max_uses IS NULL OR uses < max_uses)`,
        args: [codeId],
      },
      {
        sql: `INSERT INTO console_code_redemptions (id, code_id, code, kind, workspace_id, user_id)
              VALUES (?, ?, ?, 'license', ?, ?)`,
        args: [redemptionId, codeId, code, workspaceId, auth.userId],
      },
    );

    return json({
      ok: true, kind: "license", plan, seats: cfg.baseSeats, license_expires_at: licenseExpiresAt,
    });
  }

  if (kind === "unlock") {
    // Desbloqueo de catálogo premium: target = "catalog:<key>".
    const target = String(row.target ?? "");
    const m = target.match(/^catalog:([a-z0-9_-]+)$/);
    if (!m) return json({ error: "invalid_unlock_target" }, 422);
    const catalogKey = m[1]!;
    await unlockCatalog(env, workspaceId, catalogKey);
    const redemptionId = crypto.randomUUID();
    await tursoTransaction(
      env,
      {
        sql: `UPDATE console_codes SET uses = uses + 1
                WHERE id = ? AND (max_uses IS NULL OR uses < max_uses)`,
        args: [codeId],
      },
      {
        sql: `INSERT INTO console_code_redemptions (id, code_id, code, kind, workspace_id, user_id)
              VALUES (?, ?, ?, 'unlock', ?, ?)`,
        args: [redemptionId, codeId, code, workspaceId, auth.userId],
      },
    );
    return json({ ok: true, kind: "unlock", target, catalog: catalogKey });
  }

  // Descuento (F5): lo GUARDAMOS en el workspace — se aplica en cada checkout
  // cuyo target matchee (plan, empleados, catálogo) y en el re-pricing.
  const discountType = String(row.discount_type ?? "");
  const discountValue = Number(row.discount_value ?? 0);
  const discountTarget = row.target ? String(row.target) : "all";
  // Referidos: si el código pertenece a otro workspace, lo recompensamos con el
  // mismo descuento. No podés usar tu propio código de referido.
  const referrerWid = row.referrer_workspace_id ? String(row.referrer_workspace_id) : null;
  if (referrerWid && referrerWid === workspaceId) return json({ error: "self_referral" }, 409);

  await ensureWorkspaceColumns(env);
  const redemptionId = crypto.randomUUID();
  const stmts = [
    {
      sql: `UPDATE cloud_workspaces
               SET discount_type = ?, discount_value = ?, discount_target = ?, updated_at = datetime('now')
             WHERE id = ?`,
      args: [discountType, discountValue, discountTarget, workspaceId] as TursoArg[],
    },
    {
      sql: `UPDATE console_codes SET uses = uses + 1
              WHERE id = ? AND (max_uses IS NULL OR uses < max_uses)`,
      args: [codeId] as TursoArg[],
    },
    {
      sql: `INSERT INTO console_code_redemptions (id, code_id, code, kind, workspace_id, user_id)
            VALUES (?, ?, ?, 'discount', ?, ?)`,
      args: [redemptionId, codeId, code, workspaceId, auth.userId] as TursoArg[],
    },
  ];
  if (referrerWid) {
    stmts.push({
      sql: `UPDATE cloud_workspaces
               SET discount_type = ?, discount_value = ?, discount_target = ?, updated_at = datetime('now')
             WHERE id = ?`,
      args: [discountType, discountValue, discountTarget, referrerWid] as TursoArg[],
    });
  }
  await tursoTransaction(env, ...stmts);

  return json({
    ok: true, kind: "discount", discount_type: discountType, discount_value: discountValue,
    target: discountTarget, referral: !!referrerWid,
  });
}

/* ── POST /workspaces/:wid/referral ──────────────────────────────────────
 * Código de referido self-serve del workspace (lo comparte el dueño). Es un
 * código de descuento (kind 'discount', percent) con referrer_workspace_id =
 * este workspace; al canjearlo, el referido Y el referidor reciben el descuento.
 * Idempotente: un código por workspace. */
const REFERRAL_PCT = 20;

export async function handleGetReferralCode(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "billing.manage");
  if (denied) return denied;
  await ensureConsoleSchema(env);

  const existing = await tursoFirst(
    env,
    `SELECT code FROM console_codes WHERE referrer_workspace_id = ? LIMIT 1`,
    [workspaceId],
  );
  if (existing?.code) {
    return json({ ok: true, code: String(existing.code), discount_pct: REFERRAL_PCT });
  }

  const id = crypto.randomUUID();
  const code = generateCode();
  await tursoExec(
    env,
    `INSERT INTO console_codes
       (id, code, kind, discount_type, discount_value, target, referrer_workspace_id, uses, created_by, created_at)
     VALUES (?, ?, 'discount', 'percent', ?, 'plan:any', ?, 0, ?, datetime('now'))`,
    [id, code, REFERRAL_PCT, workspaceId, auth.userId],
  );
  return json({ ok: true, code, discount_pct: REFERRAL_PCT });
}
