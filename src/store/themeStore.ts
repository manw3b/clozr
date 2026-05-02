import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
  applyTheme: () => void;
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function apply(resolved: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", resolved);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      resolved: "dark",
      setTheme: (theme) => {
        const resolved = resolveTheme(theme);
        apply(resolved);
        set({ theme, resolved });
      },
      applyTheme: () => {
        const resolved = resolveTheme(get().theme);
        apply(resolved);
        set({ resolved });
      },
    }),
    {
      name: "clozr-theme",
      onRehydrateStorage: () => (state) => {
        if (state) state.applyTheme();
      },
    },
  ),
);

if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const { theme, applyTheme } = useThemeStore.getState();
    if (theme === "system") applyTheme();
  });
}
