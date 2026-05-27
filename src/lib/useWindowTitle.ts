/**
 * useWindowTitle (I/C) — actualiza el título de la ventana del SO con
 * "Clozr — {nombreDelNegocio}".
 *
 * Cuando el user tiene múltiples Clozr abiertos (ej. PC1 vendiendo iPhones,
 * PC2 vendiendo autos), distinguirlos en alt-tab requiere ver el nombre
 * del negocio en la barra. Default Tauri es solo "Clozr".
 *
 * Falla silencioso si la API no está disponible (web build futuro).
 */
import { useEffect } from "react";

export function useWindowTitle(workspaceName: string | null | undefined): void {
  useEffect(() => {
    const title = workspaceName ? `Clozr — ${workspaceName}` : "Clozr";
    // Dynamic import — la API solo existe en Tauri runtime, no en
    // entorno de tests vitest.
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
      .catch(() => {
        // fallback web: document.title
        try { document.title = title; } catch { /* swallow */ }
      });
  }, [workspaceName]);
}
