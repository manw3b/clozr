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

const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
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
