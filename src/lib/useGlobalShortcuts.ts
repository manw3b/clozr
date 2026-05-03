import { useEffect } from "react";
import { useUIStore, type ScreenId } from "../store/uiStore";

/**
 * Atajos de teclado globales.
 *
 * Activos solo cuando el usuario NO está escribiendo en un input/textarea/select
 * y no tiene un modificador (Ctrl/Cmd) presionado.
 *
 * Acciones rápidas (eventos al window):
 *   V → nueva venta
 *   C → nuevo cliente
 *   M → nuevo movimiento de caja
 *   L → ir a pipeline (lead)
 *   T → nueva tarea
 *
 * Navegación (1-9):
 *   1 → Mi Día
 *   2 → Pipeline
 *   3 → Clientes
 *   4 → Ventas
 *   5 → Caja
 *   6 → Deudas
 *   7 → Inventario
 *   8 → Tareas
 *   9 → Reportes
 *
 * Cmd+K es manejado por CommandPalette (no acá).
 * Cmd+B / barra invertida será handled por sidebar collapse (futuro).
 */
const NAV_BY_DIGIT: Record<string, ScreenId> = {
  "1": "home",
  "2": "pipeline",
  "3": "customers",
  "4": "sales",
  "5": "cash",
  "6": "deudas",
  "7": "inventory",
  "8": "tasks",
  "9": "reportes",
};

const ACTION_EVENT: Record<string, string> = {
  v: "clozr:open-new-sale",
  c: "clozr:open-new-client",
  m: "clozr:open-new-movement",
  t: "clozr:open-new-task",
};

const NAV_BY_LETTER: Partial<Record<string, ScreenId>> = {
  l: "pipeline",
};

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts() {
  const setActiveScreen = useUIStore((s) => s.setActiveScreen);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't fire when modifier keys are involved (preserve Cmd+K, Ctrl+C, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Don't fire when the user is typing
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // Navigation by digit
      if (NAV_BY_DIGIT[key]) {
        e.preventDefault();
        setActiveScreen(NAV_BY_DIGIT[key]);
        return;
      }

      // Navigation by letter
      const navLetter = NAV_BY_LETTER[key];
      if (navLetter) {
        e.preventDefault();
        setActiveScreen(navLetter);
        return;
      }

      // Quick actions
      const ev = ACTION_EVENT[key];
      if (ev) {
        e.preventDefault();
        // Each handler page also navigates if needed
        if (key === "v") setActiveScreen("sales");
        if (key === "c") setActiveScreen("customers");
        if (key === "m") setActiveScreen("cash");
        if (key === "t") setActiveScreen("tasks");
        window.dispatchEvent(new CustomEvent(ev));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiveScreen]);
}
