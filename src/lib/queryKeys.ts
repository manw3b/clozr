/**
 * Source of truth para query keys de TanStack Query.
 *
 * Reglas:
 * - Cada feature tiene un namespace (mi-dia, ventas, clientes, etc.).
 * - Las keys son tuples con cada nivel listado, para invalidación granular:
 *     qc.invalidateQueries({ queryKey: qk.ventas.all() })       → toda la rama ventas
 *     qc.invalidateQueries({ queryKey: qk.ventas.byId(id) })    → solo esa venta
 * - Funciones, no constantes, para que TS valide los args.
 * - Cada rama tiene `.all()` que devuelve el prefix — usar SIEMPRE para
 *   invalidar el bucket entero. Si volvés a `["ventas"]` literal te perdés
 *   el chequeo del compilador.
 *
 * Cómo agregar una key nueva:
 * 1. Identificá el namespace (¿es ventas, caja, inventario, settings…?).
 * 2. Sumá la función en su sección. Mantené `.all()` al principio.
 * 3. Usá `as const` para preservar el tuple literal en el tipo.
 */

export const qk = {
  // ════════════════════════════════════════════════════════════
  //  Mi Día
  // ════════════════════════════════════════════════════════════
  miDia: {
    all: () => ["mi-dia"] as const,
    score: (wid: string) => ["mi-dia", "score", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Tasks
  // ════════════════════════════════════════════════════════════
  tasks: {
    all: () => ["tasks"] as const,
    list: (wid: string) => ["tasks", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Followups
  // ════════════════════════════════════════════════════════════
  followups: {
    all: () => ["followups"] as const,
    forDay: (wid: string, bid: string, date: string) =>
      ["followups", "for-day", wid, bid, date] as const,
    list: (wid: string, bid: string) => ["followups", "all", wid, bid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Clientes
  // ════════════════════════════════════════════════════════════
  clientes: {
    all: () => ["clientes"] as const,
    list: (wid: string) => ["clientes", "list", wid] as const,
    detail: (wid: string, clientId: string | null) =>
      ["clientes", "detail", wid, clientId] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Customer tags + types
  // ════════════════════════════════════════════════════════════
  customerTags: {
    all: () => ["customer-tags"] as const,
    list: (wid: string) => ["customer-tags", wid] as const,
    withCount: (wid: string) => ["customer-tags-with-count", wid] as const,
    withCountAll: () => ["customer-tags-with-count"] as const,
  },
  customerTypes: {
    all: () => ["customer-types"] as const,
    list: (wid: string) => ["customer-types", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Pipeline
  // ════════════════════════════════════════════════════════════
  pipeline: {
    all: () => ["pipeline"] as const,
    leads: (wid: string) => ["pipeline", wid] as const,
    stages: (wid: string) => ["pipeline-stages", wid] as const,
    stagesAll: () => ["pipeline-stages"] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Ventas
  // ════════════════════════════════════════════════════════════
  ventas: {
    all: () => ["ventas"] as const,
    byPeriod: (wid: string, period: string) =>
      ["ventas", "list", wid, period] as const,
    saleItems: (saleId: string) => ["sale-items", saleId] as const,
    salePayments: (saleId: string) => ["sale-payments", saleId] as const,
    pendingCobros: (wid: string) => ["ventas", "pending-cobros", wid] as const,
    pendingRegularization: (wid: string) =>
      ["pending-regularization", wid] as const,
    pendingRegularizationAll: () => ["pending-regularization"] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Caja
  // ════════════════════════════════════════════════════════════
  caja: {
    all: () => ["caja"] as const,
    summary: (wid: string, bid: string, from: string, to: string) =>
      ["caja", "summary", wid, bid, from, to] as const,
    summaryAll: () => ["caja", "summary"] as const,
    session: (wid: string, bid: string, date: string) =>
      ["caja", "session", wid, bid, date] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Inventario + Catálogo
  // ════════════════════════════════════════════════════════════
  inventario: {
    all: () => ["inventario"] as const,
    catalog: (wid: string) => ["inventario", "catalog", wid] as const,
    summary: (wid: string) => ["inventario", "summary", wid] as const,
    iphoneTemplates: () => ["inventario", "iphone-templates"] as const,
  },
  catalog: {
    all: () => ["catalog"] as const,
    forLeads: (wid: string) => ["catalog-for-leads", wid] as const,
    itemsSearch: (wid: string) => ["catalog-items-search", wid] as const,
    itemImeis: (itemId: string | undefined) =>
      ["catalog-item-imeis", itemId] as const,
    itemImeisAll: () => ["catalog-item-imeis"] as const,
    itemRecentSales: (itemId: string | undefined, wid: string) =>
      ["catalog-item-recent-sales", itemId, wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Pricing (catalog + resolve)
  // ════════════════════════════════════════════════════════════
  pricing: {
    catalogList: (wid: string) => ["catalog-pricing-list", wid] as const,
    catalogListAll: () => ["catalog-pricing-list"] as const,
    forItem: (itemId: string | undefined) =>
      ["catalog-prices", itemId] as const,
    forItemAll: () => ["catalog-prices"] as const,
    resolve: (itemId: string | undefined, customerTypeId: string | undefined) =>
      ["resolve-price", itemId, customerTypeId] as const,
    resolveAll: () => ["resolve-price"] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Visual picker (categorías / familias / modelos)
  // ════════════════════════════════════════════════════════════
  picker: {
    tree: (wid: string) => ["picker-tree", wid] as const,
    categories: () => ["picker-categories"] as const,
    families: (categoryId: string | undefined) =>
      ["picker-families", categoryId] as const,
    models: (familyId: string | undefined) =>
      ["picker-models", familyId] as const,
    modelColors: (modelId: string) => ["model-colors", modelId] as const,
    pickerColors: (modelId: string | undefined) =>
      ["picker-colors", modelId] as const,
    storages: (modelId: string | undefined, colorId: string | undefined) =>
      ["picker-storages", modelId, colorId] as const,
    allModels: (familyIdsCsv: string) => ["all-models", familyIdsCsv] as const,
    featuredModels: (wid: string) => ["featured-models", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Payment methods
  // ════════════════════════════════════════════════════════════
  paymentMethods: {
    all: () => ["payment-methods"] as const,
    list: (wid: string) => ["payment-methods", wid] as const,
    active: (wid: string) => ["payment-methods-active", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Workspace settings (KV)
  // ════════════════════════════════════════════════════════════
  workspaceSettings: {
    all: (wid: string) => ["workspace-settings", wid] as const,
    waTemplates: (wid: string) => ["workspace-settings", wid, "wa-templates"] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Reportes
  // ════════════════════════════════════════════════════════════
  reportes: {
    all: () => ["reportes"] as const,
    metrics: (wid: string) => ["reportes", "metrics", wid] as const,
    margin: (wid: string) => ["reportes", "margin", wid] as const,
    topCustomers: (wid: string) => ["reportes", "top-customers", wid] as const,
    topProducts: (wid: string) => ["reportes", "top-products", wid] as const,
    byCategory: (wid: string) => ["reportes", "by-category", wid] as const,
    byVendorMargin: (wid: string) =>
      ["reportes", "by-vendor-margin", wid] as const,
    byMonthMargin: (wid: string) =>
      ["reportes", "by-month-margin", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Deudas
  // ════════════════════════════════════════════════════════════
  deudas: {
    all: () => ["deudas"] as const,
    list: (wid: string) => ["deudas", "all", wid] as const,
    customers: (wid: string) => ["deudas", "customers", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Team
  // ════════════════════════════════════════════════════════════
  team: {
    all: () => ["team"] as const,
    list: (wid: string) => ["team", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Notificaciones
  // ════════════════════════════════════════════════════════════
  notifications: {
    list: (wid: string) => ["notifications", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Command palette (búsqueda global)
  // ════════════════════════════════════════════════════════════
  cmdk: {
    all: () => ["cmdk"] as const,
    customers: (wid: string) => ["cmdk", "customers", wid] as const,
    sales: (wid: string) => ["cmdk", "sales", wid] as const,
    leads: (wid: string) => ["cmdk", "leads", wid] as const,
    catalog: (wid: string) => ["cmdk", "catalog", wid] as const,
  },

  // ════════════════════════════════════════════════════════════
  //  Cotización del dólar (ARS)
  // ════════════════════════════════════════════════════════════
  dolaresAr: {
    all: () => ["dolaresAr"] as const,
    rates: () => ["dolaresAr"] as const,
    lastFetched: () => ["dolaresAr", "lastFetched"] as const,
    activeKind: (wid: string) => ["active-dolar-kind", wid] as const,
  },
} as const;

/**
 * Invalidación cross-feature después de mutations típicas.
 * Llama esto desde `onSuccess` de mutations para no olvidarte de algo.
 */
export const invalidate = {
  /** Después de crear / marcar pagada / actualizar una venta. */
  afterSaleChange: (qc: import("@tanstack/react-query").QueryClient) => {
    qc.invalidateQueries({ queryKey: qk.ventas.all() });
    qc.invalidateQueries({ queryKey: qk.miDia.all() });
    qc.invalidateQueries({ queryKey: qk.caja.all() });
    qc.invalidateQueries({ queryKey: qk.clientes.all() });
    // Las ventas con IMEI/auto-FIFO descuentan stock
    qc.invalidateQueries({ queryKey: qk.inventario.all() });
    qc.invalidateQueries({ queryKey: qk.catalog.all() });
    qc.invalidateQueries({ queryKey: qk.catalog.itemImeisAll() });
  },
  /** Después de crear / editar / eliminar un cliente. */
  afterClientChange: (qc: import("@tanstack/react-query").QueryClient) => {
    qc.invalidateQueries({ queryKey: qk.clientes.all() });
    qc.invalidateQueries({ queryKey: qk.miDia.all() });
  },
  /** Después de mover un lead. */
  afterLeadChange: (qc: import("@tanstack/react-query").QueryClient) => {
    qc.invalidateQueries({ queryKey: qk.pipeline.all() });
    qc.invalidateQueries({ queryKey: qk.miDia.all() });
  },
  /** Después de crear un movimiento de caja. */
  afterCashChange: (qc: import("@tanstack/react-query").QueryClient) => {
    qc.invalidateQueries({ queryKey: qk.caja.all() });
    qc.invalidateQueries({ queryKey: qk.miDia.all() });
  },
  /** Después de toggle / crear / borrar tarea. */
  afterTaskChange: (qc: import("@tanstack/react-query").QueryClient, wid: string) => {
    qc.invalidateQueries({ queryKey: qk.tasks.list(wid) });
    qc.invalidateQueries({ queryKey: qk.miDia.score(wid) });
  },
} as const;
