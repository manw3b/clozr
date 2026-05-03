/**
 * Source of truth para query keys de TanStack Query.
 *
 * Reglas:
 * - Cada feature tiene un namespace (mi-dia, ventas, clientes, etc.).
 * - Las keys son tuples con cada nivel listado, para invalidación granular:
 *     qc.invalidateQueries({ queryKey: ['ventas'] }) → invalida toda la rama
 *     qc.invalidateQueries({ queryKey: qk.ventaById(id) }) → solo esa
 * - Funciones, no constantes, para que TS valide los args.
 */

export const qk = {
  // ── Mi Día ─────────────────────────────────────────────
  miDia: () => ["mi-dia"] as const,
  dayScore: (wid: string) => ["mi-dia", "score", wid] as const,

  // ── Tasks ──────────────────────────────────────────────
  tasks: (wid: string) => ["tasks", wid] as const,

  // ── Followups ──────────────────────────────────────────
  followupsForDay: (wid: string, bid: string, date: string) =>
    ["followups", "for-day", wid, bid, date] as const,
  followupsAll: (wid: string, bid: string) => ["followups", "all", wid, bid] as const,

  // ── Clientes ───────────────────────────────────────────
  clientsAll: () => ["clientes"] as const,
  clientsList: (wid: string) => ["clientes", "list", wid] as const,
  clientDetail: (wid: string, clientId: string | null) =>
    ["clientes", "detail", wid, clientId] as const,

  // ── Pipeline ───────────────────────────────────────────
  pipelineAll: () => ["pipeline"] as const,
  pipelineLeads: (wid: string) => ["pipeline", wid] as const,

  // ── Ventas ─────────────────────────────────────────────
  ventasAll: () => ["ventas"] as const,
  salesByPeriod: (wid: string, period: string) => ["ventas", "list", wid, period] as const,
  pendingCobros: (wid: string) => ["ventas", "pending-cobros", wid] as const,

  // ── Caja ───────────────────────────────────────────────
  cashAll: () => ["caja"] as const,
  cashSummary: (wid: string, bid: string, date: string) =>
    ["caja", "summary", wid, bid, date] as const,
} as const;

/**
 * Invalidación cross-feature después de mutations típicas.
 * Llama esto desde `onSuccess` de mutations para no olvidarse de algo.
 */
export const invalidate = {
  /** Después de crear / marcar pagada / actualizar una venta. */
  afterSaleChange: (qc: import("@tanstack/react-query").QueryClient) => {
    qc.invalidateQueries({ queryKey: qk.ventasAll() });
    qc.invalidateQueries({ queryKey: qk.miDia() });
    qc.invalidateQueries({ queryKey: qk.cashAll() });
    qc.invalidateQueries({ queryKey: qk.clientsAll() });
  },
  /** Después de crear / editar / eliminar un cliente. */
  afterClientChange: (qc: import("@tanstack/react-query").QueryClient) => {
    qc.invalidateQueries({ queryKey: qk.clientsAll() });
    qc.invalidateQueries({ queryKey: qk.miDia() });
  },
  /** Después de mover un lead. */
  afterLeadChange: (qc: import("@tanstack/react-query").QueryClient) => {
    qc.invalidateQueries({ queryKey: qk.pipelineAll() });
    qc.invalidateQueries({ queryKey: qk.miDia() });
  },
  /** Después de crear un movimiento de caja. */
  afterCashChange: (qc: import("@tanstack/react-query").QueryClient) => {
    qc.invalidateQueries({ queryKey: qk.cashAll() });
    qc.invalidateQueries({ queryKey: qk.miDia() });
  },
  /** Después de toggle / crear / borrar tarea. */
  afterTaskChange: (qc: import("@tanstack/react-query").QueryClient, wid: string) => {
    qc.invalidateQueries({ queryKey: qk.tasks(wid) });
    qc.invalidateQueries({ queryKey: qk.dayScore(wid) });
  },
} as const;
