/**
 * permissions.ts — enforcement server-side de la matriz rol → permiso.
 *
 * Espejo EXACTO de `clozr-web/src/lib/permissions.ts` (la fuente de verdad
 * del frontend). El front ya gatea las acciones por `can(role, perm)`; este
 * módulo aplica la MISMA matriz en el Worker para que un cliente malicioso
 * (o un bug de UI) no pueda saltarse el gate mandando el POST/PATCH/DELETE
 * a mano. Si cambiás un permiso, cambialo en AMBOS lados.
 *
 * Reglas del módulo (igual que el front):
 *   - Sin imports externos ni side-effects al cargar.
 *   - Alcance: permisos de ACCIÓN. El alcance de DATOS del vendedor
 *     ("ve solo lo suyo") es ortogonal y se filtra por `owner_id` en cada
 *     handler — no se resuelve acá.
 *
 * NOTA: existe otro `permissions.ts` en `clozr/src/lib/` (matriz granular
 * del desktop: createSale, deleteSale, etc.) que el handler de
 * decrement-stock importa. Son módulos distintos a propósito: este es el
 * espejo de la matriz por-rol del frontend web.
 */

export type Role = "owner" | "admin" | "vendedor" | "viewer";

export type Permission =
  | "customers.write"
  | "sales.write"
  | "pipeline.write"
  | "cash.write"
  | "inventory.write"
  | "tasks.write"
  | "reports.view"
  | "settings.manage"
  | "team.manage"
  | "billing.manage"
  | "workspace.delete";

const OPERATE: Permission[] = [
  "customers.write",
  "sales.write",
  "pipeline.write",
  "cash.write",
  "tasks.write",
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    ...OPERATE,
    "inventory.write",
    "reports.view",
    "settings.manage",
    "team.manage",
    "billing.manage",
    "workspace.delete",
  ],
  admin: [
    ...OPERATE,
    "inventory.write",
    "reports.view",
    "settings.manage",
    "team.manage",
  ],
  // El vendedor opera el día a día pero no configura el espacio ni ve los
  // números globales del negocio.
  vendedor: [...OPERATE],
  // Solo lectura: ve todo, no escribe nada.
  viewer: [],
};

/** Normaliza un rol crudo del Worker; lo desconocido cae a `viewer` (seguro). */
export function normalizeRole(role: string | null | undefined): Role {
  return role === "owner" || role === "admin" || role === "vendedor" || role === "viewer"
    ? role
    : "viewer";
}

/** ¿El rol tiene el permiso? Acepta el `role` crudo de la membership. */
export function can(role: string | null | undefined, perm: Permission): boolean {
  return ROLE_PERMISSIONS[normalizeRole(role)].includes(perm);
}

/**
 * Guardia para handlers: devuelve un 403 `{error:"forbidden"}` si el rol no
 * tiene el permiso, o `null` si está autorizado (seguí adelante).
 *
 * Uso:
 *   const role = await getRoleInWorkspace(env, wid, auth.userId);
 *   if (!role) return json({ error: "forbidden" }, 403);   // no es miembro
 *   const denied = requirePerm(role, "customers.write");
 *   if (denied) return denied;
 *
 * Construye la Response inline (sin importar el `json` helper) para que el
 * módulo no tenga dependencias — igual que su gemelo del frontend.
 */
export function requirePerm(role: string | null | undefined, perm: Permission): Response | null {
  if (can(role, perm)) return null;
  return new Response(JSON.stringify({ error: "forbidden" }), {
    status: 403,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
