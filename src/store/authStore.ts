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

/** Helper centralizado para preguntar permisos. */
export function canViewCost(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}
export function canEditPricing(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}
export function canRegularizeSale(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}
