import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useUIStore } from "./store/uiStore";
import { errorMessage, log } from "./lib/logger";
import "./styles/globals.css";

// Deshabilitar el context menu nativo del WebView (Atrás / Actualizar /
// Imprimir / Inspeccionar / etc) que aparece por default. En una app
// desktop esos items son ruido. En DEV lo dejamos activo para que se
// pueda usar Inspeccionar/F12 al debuggear.
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

const queryCache = new QueryCache({
  onError: (err, query) => {
    log.warn("Query failed", {
      scope: "react-query",
      err,
      data: { queryKey: query.queryKey },
    });
    // Don't toast on background refetches — only on initial fetch failures
    if (query.state.data === undefined) {
      useUIStore.getState().showToast(errorMessage(err, "Error al cargar datos"), "error");
    }
  },
});

const mutationCache = new MutationCache({
  onError: (err) => {
    log.warn("Mutation failed", { scope: "react-query", err });
    // Mutations always toast — they're user-initiated
    useUIStore.getState().showToast(errorMessage(err, "La operación falló"), "error");
  },
});

/**
 * Retry inteligente para queries cloud:
 *   - 4xx (cliente): NO retry. Es nuestra culpa, retry no lo arregla.
 *     401 lo maneja el interceptor de cloudAuth (auto-logout).
 *   - 5xx / red / timeout: hasta 2 retries con backoff exponencial (1s, 3s).
 *   - Otros (errores JS / undefined): 1 retry como antes.
 *
 * Distinguimos por la shape del error: nuestro authFetch lanza
 * `new Error("HTTP 503: ...")` así que matcheamos por prefijo.
 */
const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: (failureCount, err) => {
        const msg = err instanceof Error ? err.message : String(err);
        // 4xx HTTP — no tiene sentido reintentar.
        const status4xx = /HTTP\s+4\d\d/i.test(msg);
        if (status4xx) return false;
        // Retries para 5xx / red / timeout. Capeamos a 2.
        const transient = /HTTP\s+5\d\d|timeout|fetch|network|abort/i.test(msg);
        if (transient) return failureCount < 2;
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(1000 * 3 ** attempt, 5000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Mutations NO retry por defecto — riesgo de doble side-effect
      // (crear venta dos veces, mandar email dos veces). El caller que
      // sepa que es idempotente puede overridear.
      retry: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
