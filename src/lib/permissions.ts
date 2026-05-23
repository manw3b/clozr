/**
 * permissions.ts — fuente de verdad de la matriz rol → permisos.
 *
 * Importada tanto por el frontend (authStore.ts re-exporta para back-compat)
 * como por el cf-worker (via path relativo `../../src/lib/permissions`).
 * Antes la matriz estaba sólo en el frontend y el worker hacía role-checks
 * ad-hoc per-endpoint (Set(['owner','admin']), etc) — si cambiabas un
 * permiso en el front, el worker lo permitía igual.
 *
 * Reglas del módulo:
 *   - Sin imports externos (zustand, React, DOM, etc) para que el worker
 *     pueda consumirlo sin extra dependencies.
 *   - Sin side effects al cargar.
 *
 * Cómo extender:
 *   1. Agregar key nueva al objeto PERMISSIONS con la lista de roles.
 *   2. Usar can(role, "miPermiso") en el callsite (front o back).
 *   3. Si el backend tiene un endpoint que necesita la check, llamar
 *      can() ANTES de hacer el side-effect.
 */

export type UserRole = "owner" | "admin" | "vendedor" | "viewer";

export const PERMISSIONS = {
  // Lecturas sensibles
  viewCost: ["owner", "admin"],

  // Catálogo / pricing / inventario
  editPricing: ["owner", "admin"],
  editCatalogItem: ["owner", "admin"],
  deleteCatalogItem: ["owner", "admin"],
  manageFeatured: ["owner", "admin"],
  /**
   * Decrementar stock — incluye al vendedor porque ocurre como
   * side-effect de crear una venta (no es una acción explícita del
   * vendedor en UI, sino consecuencia automática del flujo de venta).
   */
  decrementStock: ["owner", "admin", "vendedor"],

  // Ventas
  createSale: ["owner", "admin", "vendedor"],
  deleteSale: ["owner", "admin"],
  regularizeSale: ["owner", "admin"],
  markSalePaid: ["owner", "admin", "vendedor"],

  // Caja
  createCashMovement: ["owner", "admin", "vendedor"],
  deleteCashMovement: ["owner", "admin"],

  // Clientes / pipeline
  createClient: ["owner", "admin", "vendedor"],
  editClient: ["owner", "admin", "vendedor"],
  deleteClient: ["owner", "admin"],
  createLead: ["owner", "admin", "vendedor"],
  editLead: ["owner", "admin", "vendedor"],

  // Configuración
  managePaymentMethods: ["owner", "admin"],
  manageCustomerTypes: ["owner", "admin"],
  manageBusiness: ["owner", "admin"],
  manageWorkspaceSettings: ["owner", "admin"],
  manageTeam: ["owner"],
  manageExchangeRate: ["owner", "admin"],
  /** Crear/editar/borrar templates de tareas obligatorias del equipo. */
  manageAssignedTasks: ["owner", "admin"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  // `as readonly string[]`: PERMISSIONS está tipada con tuplas literales por
  // `as const`, así que .includes(role) se queja porque el tipo del array
  // es más narrow que UserRole. Ampliamos para la check de runtime — no
  // perdemos seguridad porque el set válido de roles ya lo limita Permission.
  const allowed = PERMISSIONS[permission] as readonly string[];
  return allowed.includes(role);
}

/**
 * Throws si el rol actual no puede ejecutar la acción. En el frontend
 * sube como Error visible en toast; en el backend sirve para fallar
 * temprano antes del side-effect (catcheado por el handler general
 * y devuelto como 403).
 */
export function assertCan(role: UserRole | string | null | undefined, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(
      `Permiso denegado: rol "${role ?? "ninguno"}" no puede "${permission}".`,
    );
  }
}
