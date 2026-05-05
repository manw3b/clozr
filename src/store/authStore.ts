import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "owner" | "admin" | "vendedor" | "viewer";

interface AuthState {
  userId: string | null;
  userName: string | null;
  /** Rol del usuario en el workspace activo. Default 'owner' (mono-usuario). */
  userRole: UserRole;
  setUser: (id: string, name: string, role?: UserRole) => void;
  setUserRole: (role: UserRole) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      userName: null,
      userRole: "owner",
      setUser: (id, name, role = "owner") => set({ userId: id, userName: name, userRole: role }),
      setUserRole: (role) => set({ userRole: role }),
      clearUser: () => set({ userId: null, userName: null, userRole: "owner" }),
    }),
    { name: "clozr-auth" },
  ),
);

/* ─────────────────────────────────────────────────────────────────────
 * Matriz de permisos (granular). Cada permiso lista los roles habilitados.
 * ───────────────────────────────────────────────────────────────────── */

export const PERMISSIONS: Readonly<Record<string, readonly UserRole[]>> = {
  // Lecturas sensibles
  viewCost: ["owner", "admin"],

  // Catálogo / pricing / inventario
  editPricing: ["owner", "admin"],
  editCatalogItem: ["owner", "admin"],
  deleteCatalogItem: ["owner", "admin"],
  manageFeatured: ["owner", "admin"],

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
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role);
}

/**
 * Throws si el rol actual no puede ejecutar la acción.
 * Uso típico en mutationFn de TanStack Query — el error sube y se muestra
 * vía la handler global de errores (que ya mostramos como toast).
 */
export function assertCan(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(
      `Permiso denegado: tu rol "${role}" no puede "${permission}". Pedí al owner/admin.`,
    );
  }
}

/* ── Helpers legacy (compatibilidad con código existente) ────────── */
export function canViewCost(role: UserRole): boolean {
  return can(role, "viewCost");
}
export function canEditPricing(role: UserRole): boolean {
  return can(role, "editPricing");
}
export function canRegularizeSale(role: UserRole): boolean {
  return can(role, "regularizeSale");
}
