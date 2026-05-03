import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Business } from "../lib/db/types";
import { businessesDb } from "../lib/db/businesses";

interface BusinessState {
  businesses: Business[];
  activeBusiness: Business | null;
  isLoading: boolean;
  loadBusinesses: (workspaceId: string) => Promise<void>;
  setActiveBusiness: (b: Business) => void;
  addBusiness: (b: Business) => void;
  updateBusiness: (b: Business) => void;
  removeBusiness: (id: string) => void;
}

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      businesses: [],
      activeBusiness: null,
      isLoading: false,

      loadBusinesses: async (workspaceId: string) => {
        set({ isLoading: true });
        try {
          let businesses = await businessesDb.getAll(workspaceId);

          // Auto-seed: si el workspace no tiene ningún negocio (DB nueva sin
          // migración 011 aplicada), creamos uno default con el nombre del
          // workspace. Así el dropdown nunca queda vacío.
          if (businesses.length === 0) {
            try {
              const { workspaceDb } = await import("../lib/db/workspace");
              const ws = await workspaceDb.getById(workspaceId);
              const seeded = await businessesDb.create(workspaceId, {
                name: ws?.name ?? "Mi negocio",
                emoji: ws?.emoji ?? "🏪",
              });
              businesses = [seeded];
            } catch {
              const seeded = await businessesDb.create(workspaceId, {
                name: "Mi negocio",
                emoji: "🏪",
              });
              businesses = [seeded];
            }
          }

          const current = get().activeBusiness;
          const active =
            businesses.find((b) => b.id === current?.id) ?? businesses[0] ?? null;
          set({ businesses, activeBusiness: active, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      },

      setActiveBusiness: (b) => set({ activeBusiness: b }),

      addBusiness: (b) =>
        set((state) => ({
          businesses: [...state.businesses, b],
          activeBusiness: state.activeBusiness ?? b,
        })),

      updateBusiness: (b) =>
        set((state) => ({
          businesses: state.businesses.map((x) => (x.id === b.id ? b : x)),
          activeBusiness: state.activeBusiness?.id === b.id ? b : state.activeBusiness,
        })),

      removeBusiness: (id) =>
        set((state) => {
          const rest = state.businesses.filter((x) => x.id !== id);
          return {
            businesses: rest,
            activeBusiness:
              state.activeBusiness?.id === id ? (rest[0] ?? null) : state.activeBusiness,
          };
        }),
    }),
    {
      name: "clozr-active-business",
      partialize: (state) => ({ activeBusiness: state.activeBusiness }),
    },
  ),
);
