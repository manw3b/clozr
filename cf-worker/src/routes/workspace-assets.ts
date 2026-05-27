/**
 * Workspace assets (logos + banners) — storage en R2 (I).
 *
 * Routes:
 *   POST   /workspaces/:wid/logo      multipart upload — sube y guarda key en DB
 *   DELETE /workspaces/:wid/logo      borra del bucket + clear key
 *   POST   /workspaces/:wid/banner    idem para banner apaisado
 *   DELETE /workspaces/:wid/banner
 *   GET    /assets/:key+              proxy del bucket con cache headers
 *
 * Keys en R2:
 *   workspaces/{wid}/logo-{timestamp}.{ext}
 *   workspaces/{wid}/banner-{timestamp}.{ext}
 *
 * El timestamp en el nombre evita problemas de cache cuando el user
 * reemplaza el logo (URL nueva = no hay cache stale).
 *
 * Permisos:
 *   - upload/delete = owner|admin (es config del workspace)
 *   - read (GET /assets) = público (autenticado solo agrega complejidad
 *     sin valor real — un logo de negocio no es info sensible).
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoFirst, tursoExec } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";

const MGMT_ROLES = new Set(["owner", "admin"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — logos no necesitan ser HD
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

interface AssetEnv extends Env {
  ASSETS: R2Bucket;
}

function extFromContentType(ct: string): string {
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  return "jpg";
}

async function uploadAssetForKind(
  kind: "logo" | "banner",
  wsId: string,
  req: Request,
  env: AssetEnv,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role || !MGMT_ROLES.has(role)) return json({ error: "forbidden" }, 403);

  const contentType = req.headers.get("content-type") ?? "";
  if (!ALLOWED_TYPES.has(contentType.split(";")[0]!.trim())) {
    return json({ error: "invalid_content_type", allowed: Array.from(ALLOWED_TYPES) }, 400);
  }

  // El body lo recibimos como un blob binario directo (el cliente
  // hace fetch con Content-Type: image/xxx y body=ArrayBuffer).
  // Multipart sería más estándar pero parsearlo en Workers sin lib
  // agrega ~200 LOC; este flow es más simple.
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return json({ error: "empty_body" }, 400);
  if (buf.byteLength > MAX_BYTES) {
    return json({ error: "too_large", maxBytes: MAX_BYTES }, 413);
  }

  // Borrar la key anterior (si existe) para no acumular basura. R2
  // no cobra por DELETE pero sí por almacenamiento — si el user
  // reemplaza 10 veces el logo, sin esto quedan 10 archivos en R2.
  const existing = await tursoFirst(
    env,
    `SELECT ${kind}_key as k FROM cloud_workspaces WHERE id = ?`,
    [wsId],
  );
  const oldKey = existing?.k ? String(existing.k) : null;

  const ext = extFromContentType(contentType.split(";")[0]!.trim());
  const ts = Date.now();
  const newKey = `workspaces/${wsId}/${kind}-${ts}.${ext}`;

  await env.ASSETS.put(newKey, buf, {
    httpMetadata: { contentType: contentType.split(";")[0]!.trim() },
  });

  // Actualizar la columna en DB.
  await tursoExec(
    env,
    `UPDATE cloud_workspaces SET ${kind}_key = ? WHERE id = ?`,
    [newKey, wsId],
  );

  // Limpiar el archivo anterior — fire and forget, no fallar si no se puede.
  if (oldKey && oldKey !== newKey) {
    env.ASSETS.delete(oldKey).catch(() => { /* swallow */ });
  }

  return json({ ok: true, key: newKey, url: `/assets/${newKey}` });
}

async function deleteAssetForKind(
  kind: "logo" | "banner",
  wsId: string,
  req: Request,
  env: AssetEnv,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role || !MGMT_ROLES.has(role)) return json({ error: "forbidden" }, 403);

  const existing = await tursoFirst(
    env,
    `SELECT ${kind}_key as k FROM cloud_workspaces WHERE id = ?`,
    [wsId],
  );
  const key = existing?.k ? String(existing.k) : null;

  await tursoExec(
    env,
    `UPDATE cloud_workspaces SET ${kind}_key = NULL WHERE id = ?`,
    [wsId],
  );

  if (key) {
    env.ASSETS.delete(key).catch(() => { /* swallow */ });
  }

  return json({ ok: true });
}

export function handleUploadLogo(wsId: string, req: Request, env: AssetEnv) {
  return uploadAssetForKind("logo", wsId, req, env);
}
export function handleDeleteLogo(wsId: string, req: Request, env: AssetEnv) {
  return deleteAssetForKind("logo", wsId, req, env);
}
export function handleUploadBanner(wsId: string, req: Request, env: AssetEnv) {
  return uploadAssetForKind("banner", wsId, req, env);
}
export function handleDeleteBanner(wsId: string, req: Request, env: AssetEnv) {
  return deleteAssetForKind("banner", wsId, req, env);
}

/**
 * Proxy de R2 — sirve el archivo binario al cliente con cache headers.
 * Ruta: GET /assets/{key+}  (la key puede tener slashes adentro).
 * Público (sin auth) porque un logo de negocio no es sensible.
 */
export async function handleAssetProxy(key: string, env: AssetEnv): Promise<Response> {
  if (!key) return new Response("not found", { status: 404 });

  const obj = await env.ASSETS.get(key);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  // Inmutable porque los keys incluyen timestamp — cuando cambia el logo,
  // el key cambia, así que cachear agresivo es seguro.
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(obj.body, { headers });
}
