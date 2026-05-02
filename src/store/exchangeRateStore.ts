import { create } from "zustand";
import { exchangeRateDb } from "../lib/db/exchangeRate";

interface ExchangeRateState {
  usdToArs: number;
  lastUpdated: string | null;
  loadRate: (workspaceId: string) => Promise<void>;
  setRate: (workspaceId: string, rate: number) => Promise<void>;
}

export const useExchangeRateStore = create<ExchangeRateState>((set) => ({
  usdToArs: 1000,
  lastUpdated: null,

  loadRate: async (workspaceId: string) => {
    try {
      const r = await exchangeRateDb.getRate(workspaceId);
      set({ usdToArs: r.usd_to_ars, lastUpdated: r.updated_at });
    } catch {
      // keep default
    }
  },

  setRate: async (workspaceId: string, rate: number) => {
    if (rate <= 0) return;
    await exchangeRateDb.setRate(workspaceId, rate);
    set({ usdToArs: rate, lastUpdated: new Date().toISOString() });
  },
}));
