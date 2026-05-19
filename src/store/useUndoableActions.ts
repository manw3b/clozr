/**
 * Sistema de "undoable actions" estilo Gmail/Linear.
 *
 * Filosofía:
 * - El usuario hace una acción destructiva (ej: eliminar método de pago).
 * - La acción se REGISTRA acá, pero NO se ejecuta de inmediato en DB.
 * - El UI hace un optimistic remove para que se sienta inmediato.
 * - Aparece un toast con countdown + botón "Deshacer".
 * - Si el usuario apreta deshacer antes del timeout: cancelamos, llamamos
 *   onUndo() para que el caller revierta el optimistic update.
 * - Si pasa el timeout: ejecutamos commit() (el delete real en DB).
 *
 * Cualquier delete que pueda esperar 5-8s para "consumarse" puede usar
 * este patrón. Para acciones irreversibles o que requieren atomicidad
 * inmediata (ej: vaciar workspace entero), seguir usando confirm modal.
 */

import { create } from "zustand";

export interface UndoableAction {
  /** Identificador único — usado para cancelar/trigger del toast. */
  id: string;
  /** Texto principal mostrado en el toast (ej: "Crypto USDT eliminado"). */
  label: string;
  /** Texto secundario opcional (ej: "Movimiento de venta · US$ 1.100"). */
  sublabel?: string;
  /** Cuándo expira (timestamp ms). Cuando expira, se llama commit(). */
  expiresAt: number;
  /** Duración total en ms (para el progress bar). */
  durationMs: number;
  /** Ejecutado al expirar el timer — la acción REAL (delete en DB). */
  commit: () => Promise<void> | void;
  /** Ejecutado si el usuario apreta "Deshacer" — revierte el optimistic. */
  onUndo: () => void;
}

interface UndoableState {
  actions: UndoableAction[];
  /**
   * Registra una nueva acción "undoable". Devuelve el id para que el
   * caller pueda cancelarla manualmente si fuera necesario.
   */
  register: (input: {
    label: string;
    sublabel?: string;
    commit: () => Promise<void> | void;
    onUndo: () => void;
    /** Duración del toast antes de auto-commit. Default 6s. */
    durationMs?: number;
  }) => string;
  /** Cancela el commit pendiente y dispara onUndo. */
  undo: (id: string) => void;
  /** Internal: dispara el commit ahora (típicamente cuando expira). */
  flush: (id: string) => Promise<void>;
  /** Dispara el commit de TODAS las acciones pendientes — útil al cerrar
   *  la app, así no se pierden deletes pendientes. */
  flushAll: () => Promise<void>;
}

export const useUndoableActions = create<UndoableState>((set, get) => ({
  actions: [],

  register({ label, sublabel, commit, onUndo, durationMs = 6000 }) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const action: UndoableAction = {
      id,
      label,
      sublabel,
      expiresAt: now + durationMs,
      durationMs,
      commit,
      onUndo,
    };
    set((s) => ({ actions: [...s.actions, action] }));

    // Programamos el flush al expirar. Si el usuario hace undo antes, el
    // flush sigue corriendo pero find() no encuentra la action y noop.
    setTimeout(() => {
      void get().flush(id);
    }, durationMs);

    return id;
  },

  undo(id) {
    const action = get().actions.find((a) => a.id === id);
    if (!action) return;
    set((s) => ({ actions: s.actions.filter((a) => a.id !== id) }));
    try {
      action.onUndo();
    } catch (e) {
      console.error("undo callback threw:", e);
    }
  },

  async flush(id) {
    const action = get().actions.find((a) => a.id === id);
    if (!action) return; // ya fue undone o flushed
    set((s) => ({ actions: s.actions.filter((a) => a.id !== id) }));
    try {
      await action.commit();
    } catch (e) {
      console.error("undoable commit threw:", e);
    }
  },

  async flushAll() {
    const pending = get().actions;
    set({ actions: [] });
    await Promise.all(
      pending.map(async (a) => {
        try {
          await a.commit();
        } catch (e) {
          console.error("flushAll commit threw:", e);
        }
      }),
    );
  },
}));
