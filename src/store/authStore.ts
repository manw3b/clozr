import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRole, Permission } from "../lib/permissions";
import { PERMISSIONS, can, assertCan } from "../lib/permissions";

// Re-export para back-compat con los ~50 callsites que importan de acá.
export type { UserRole, Permission };
export { PERMISSIONS, can, assertCan };

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
