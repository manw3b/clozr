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
          const businesses = await businessesDb.getAll(workspaceId);
          const current = get().activeBusiness;
          // keep active if it belongs to this workspace, else pick first
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
