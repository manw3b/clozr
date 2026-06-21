/**
 * superadmin.ts — gate de la Consola Clozr (super-admin de la plataforma).
 *
 * Quién es super-admin se define por email en la var `SUPERADMIN_EMAILS`
 * (lista separada por comas en wrangler.toml [vars]). NO es un rol de
 * workspace: es un permiso global de la plataforma (gestionar códigos,
 * anuncios, planes de cualquier workspace, etc).
 *
 * Se enforcea SERVER-SIDE: el frontend oculta la UI de la Consola para los
 * no-super-admin, pero esa es solo cosmética — cada endpoint /console/* vuelve
 * a chequear acá. Nunca confiar en que el cliente no pegue el endpoint a mano.
 */

import type { Env } from "./index";
import { requireAuth, type AuthClaims } from "./auth";

/** ¿El email pertenece a la lista de super-admins configurada? */
export function isSuperAdmin(email: string | null | undefined, env: Env): boolean {
  if (!email) return false;
  const target = email.trim().toLowerCase();
  if (!target) return false;
  return (env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(target);
}

/**
 * Valida el JWT y que el usuario sea super-admin. Devuelve los claims, o una
 * Response de error (401/403) lista para retornar. Uso:
 *
 *   const gate = await requireSuperAdmin(req, env);
 *   if (gate instanceof Response) return gate;
 *   // gate.userId / gate.email son del super-admin
 */
export async function requireSuperAdmin(req: Request, env: Env): Promise<AuthClaims | Response> {
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  if (!isSuperAdmin(auth.email, env)) return json({ error: "forbidden" }, 403);
  return auth;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
