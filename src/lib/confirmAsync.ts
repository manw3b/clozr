/**
 * confirmAsync — replacement de window.confirm que SÍ funciona en Tauri 2.
 *
 * window.confirm está bloqueado en WebView2 (Tauri 2 Windows) — tira
 * "dialog.confirm not allowed. Command not found" como Uncaught (in
 * promise). Cualquier flujo que dependa de él se rompe silenciosamente
 * o se ejecuta sin pedir confirmación al usuario, con riesgo real
 * (borrar venta, expulsar miembro, etc).
 *
 * Solución: una API imperativa Promise-based:
 *
 *   if (await confirmAsync("¿Eliminar venta?")) {
 *     // user confirmó
 *   }
 *
 * La función pone un estado pending en zustand. El componente
 * <ConfirmHost /> (montado una vez en App.tsx) renderiza el modal y
 * resuelve el promise cuando el user clickea cancelar/confirmar.
 *
 * Bonus vs window.confirm:
 *   - Visual consistente con el resto de la app
 *   - Mensaje multi-línea sin problemas
 *   - tone="danger" para acciones destructivas con botón rojo
 *   - confirmText / cancelText custom
 */

import { create } from "zustand";

export interface ConfirmOpts {
  /** Texto del cuerpo. Puede ser multi-línea con \n. */
  message: string;
  /** Título opcional (h2 arriba). Si omitido, va sin título. */
  title?: string;
  /** Label del botón confirmar. Default "Confirmar". */
  confirmText?: string;
  /** Label del botón cancelar. Default "Cancelar". */
  cancelText?: string;
  /** Si la acción es destructiva, botón rojo. Default false (botón primario). */
  tone?: "default" | "danger";
}

interface PendingConfirm extends ConfirmOpts {
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  pending: PendingConfirm | null;
  open: (p: PendingConfirm) => void;
  /** Resuelve el promise y limpia el estado. */
  finish: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  open: (p) => set({ pending: p }),
  finish: (ok) => {
    const cur = get().pending;
    if (cur) cur.resolve(ok);
    set({ pending: null });
  },
}));

/**
 * Pregunta al usuario y devuelve true/false. Acepta string (mensaje)
 * o un objeto ConfirmOpts.
 *
 * Ejemplo:
 *   if (await confirmAsync("¿Eliminar?")) { ... }
 *   if (await confirmAsync({ message: "¿Eliminar?", tone: "danger" })) { ... }
 */
export function confirmAsync(input: string | ConfirmOpts): Promise<boolean> {
  const opts: ConfirmOpts = typeof input === "string" ? { message: input } : input;
  return new Promise<boolean>((resolve) => {
    useConfirmStore.getState().open({ ...opts, resolve });
  });
}
