import { create } from "zustand";

export type ScreenId =
  | "home"
  | "customers"
  | "pipeline"
  | "tasks"
  | "sales"
  | "inventory"
  | "catalog"
  | "stock"
  | "stock-list"
  | "cash"
  | "deudas"
  | "reportes"
  | "team"
  | "settings";

export type QuickModal = "sale" | "movement" | null;

export interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

interface UIState {
  activeScreen: ScreenId;
  toasts: Toast[];
  quickModal: QuickModal;
  inventoryOpenSale: boolean;
  setActiveScreen: (screen: ScreenId) => void;
  showToast: (message: string, type?: Toast["type"]) => void;
  dismissToast: (id: string) => void;
  setQuickModal: (modal: QuickModal) => void;
  setInventoryOpenSale: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeScreen: "home",
  toasts: [],
  quickModal: null,
  inventoryOpenSale: false,

  setActiveScreen: (screen) => set({ activeScreen: screen }),
  setQuickModal: (modal) => set({ quickModal: modal }),
  setInventoryOpenSale: (open) => set({ inventoryOpenSale: open }),

  showToast: (message, type = "error") => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
