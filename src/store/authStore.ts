import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  userId: string | null;
  userName: string | null;
  setUser: (id: string, name: string) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      userName: null,
      setUser: (id, name) => set({ userId: id, userName: name }),
      clearUser: () => set({ userId: null, userName: null }),
    }),
    { name: "clozr-auth" },
  ),
);
