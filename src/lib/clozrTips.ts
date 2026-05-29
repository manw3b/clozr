/**
 * "Did you know" pool para la SplashScreen.
 *
 * Cada tip es una línea breve (idealmente < 80 chars) que enseñe algo útil
 * o le dé personalidad a la app. Se elige uno al azar al arrancar.
 *
 * Reglas para tips nuevos:
 *  - En castellano rioplatense informal.
 *  - Sin emojis al inicio (usamos uno como categoría visual).
 *  - Que enseñen algo accionable o sumen personalidad.
 *  - Máximo 2 líneas en pantalla normal.
 */

export interface ClozrTip {
  /** Emoji que actúa como "icono" de categoría. */
  emoji: string;
  /** Texto del tip. */
  text: string;
}

export const CLOZR_TIPS: ClozrTip[] = [
  // ── Shortcuts y navegación ────────────────────────────────────
  { emoji: "⌘", text: "Apretá Ctrl+K en cualquier pantalla para abrir la búsqueda rápida." },
  { emoji: "🖱️", text: "Click derecho en leads, ventas, clientes o movimientos abre acciones contextuales." },
  { emoji: "📐", text: "Arrastrá las columnas del pipeline para reordenar las etapas — el cambio se guarda solo." },

  // ── Caja y monedas ────────────────────────────────────────────
  { emoji: "💵", text: "Pesos y dólares se contabilizan por separado — son cajas físicas distintas." },
  { emoji: "🇦🇷", text: "Las cotizaciones del dólar se actualizan automáticamente cada 30 minutos (oficial, blue, cripto y más)." },
  { emoji: "🧾", text: "Al cerrar caja podés contar la plata física y Clozr te muestra la diferencia con el sistema." },
  { emoji: "🔗", text: "Click en un movimiento que vino de una venta y se abre la venta original directo." },

  // ── Pipeline ──────────────────────────────────────────────────
  { emoji: "🔥", text: "Marcá un lead como 'caliente' para que aparezca con prioridad en tus filtros." },
  { emoji: "🎯", text: "Los leads tienen 'origen' (referido, walk-in, web…) para que después midas qué canal cierra más." },
  { emoji: "📦", text: "Si elegís un producto del catálogo, el precio se sugiere automático según el tipo de cliente." },
  { emoji: "📅", text: "Agendar una visita arma el mensaje de WhatsApp solo, con día, hora y dirección." },

  // ── WhatsApp y plantillas ─────────────────────────────────────
  { emoji: "💬", text: "Las plantillas de WhatsApp aceptan placeholders: {nombre}, {producto}, {monto}, {negocio}…" },
  { emoji: "🏷️", text: "Los clientes mayoristas reciben un código de pedido autoincremental al agendar visita." },
  { emoji: "🎁", text: "Hay una plantilla post-venta lista que invita al cliente a etiquetarte en redes por un descuento." },

  // ── Inventario y catálogo ─────────────────────────────────────
  { emoji: "📲", text: "El catálogo de iPhones viene precargado — sólo agregás los modelos que vendés." },
  { emoji: "🔍", text: "En Inventario → Agotados aparecen los modelos que podrías sumar pero todavía no tenés." },
  { emoji: "💼", text: "Podés tener un precio distinto por tipo de cliente (final, revendedor, mayorista, empresa)." },

  // ── Datos y backup ────────────────────────────────────────────
  { emoji: "💾", text: "Cada día se hace un backup automático de tu base de datos (los últimos 14)." },
  { emoji: "🛡️", text: "Toda tu data vive localmente en SQLite — sin servidores, sin internet, sin terceros." },

  // ── Personalidad ──────────────────────────────────────────────
  { emoji: "🛠️", text: "Clozr fue hecho desde y para iPhone Club. Lo que ves es lo que necesitábamos." },
  { emoji: "✨", text: "Cada release pasa por verificación automática antes de publicarse — nada llega roto a propósito." },
  { emoji: "📊", text: "En Reportes tenés ventas por período, ticket promedio, ranking de vendedores y top de egresos." },
];

/** Tip random consistente dentro de una misma sesión (no rota al re-render).
 *  Si querés rotar, llamá pickRandomTip() de nuevo. */
export function pickRandomTip(): ClozrTip {
  const i = Math.floor(Math.random() * CLOZR_TIPS.length);
  return CLOZR_TIPS[i]!;
}

/* ════════════════════════════════════════════════════════════════════════
 * FEATURE TIPS — pool del modal "¿Sabías que…?" (J1)
 *
 * Más completos que CLOZR_TIPS (que son one-liners para el splash). Cada
 * uno tiene id estable (para no repetir), título corto y body de 1-2
 * frases. Algunos llevan un CTA opcional con label + path al que navegar.
 *
 * Idioma: rioplatense informal, "vos", sin emojis al inicio del título.
 * ════════════════════════════════════════════════════════════════════════ */

/** Screens a las que un tip puede navegar via su CTA. Subset de ScreenId. */
export type TipScreen = "home" | "cash" | "customers" | "pipeline" | "sales" | "tasks" | "inventory" | "team" | "settings";

export interface FeatureTip {
  /** ID estable para tracking en localStorage (no repetir). */
  id: string;
  emoji: string;
  /** Título corto — el "gancho". */
  title: string;
  /** 1-2 frases explicando la feature. */
  body: string;
  /** CTA opcional. Si está, el botón "Probar" navega a este path. */
  cta?: { label: string; screen: TipScreen };
}

export const FEATURE_TIPS: FeatureTip[] = [
  {
    id: "ctrl-k",
    emoji: "⌘",
    title: "Búsqueda rápida con Ctrl+K",
    body: "En cualquier pantalla apretá Ctrl+K (o Cmd+K en Mac) y saltás directo a un cliente, venta o lead sin clickear menúes.",
  },
  {
    id: "context-menu",
    emoji: "🖱️",
    title: "Click derecho = atajos",
    body: "Click derecho sobre un lead, venta, cliente o movimiento te abre acciones rápidas: cambiar etapa, marcar como caliente, ir a cliente, etc.",
  },
  {
    id: "dollar-quote",
    emoji: "🇦🇷",
    title: "El dólar se actualiza solo",
    body: "Oficial, blue, cripto y más se refrescan cada 30 minutos. Click en la cotización para ver el detalle y elegir cuál usar por defecto.",
    cta: { label: "Ver cotizaciones", screen: "settings" },
  },
  {
    id: "cash-close",
    emoji: "🧾",
    title: "Cierre de caja con conteo físico",
    body: "Al cerrar el turno podés contar la plata billete por billete y Clozr te muestra la diferencia con el sistema.",
    cta: { label: "Ir a caja", screen: "cash" },
  },
  {
    id: "client-status",
    emoji: "🔥",
    title: "Status del cliente automático",
    body: "Activo, dormido o perdido se calculan solos según cuándo te compró por última vez. Filtrá por status para reactivar los dormidos.",
    cta: { label: "Ver clientes", screen: "customers" },
  },
  {
    id: "wa-placeholders",
    emoji: "💬",
    title: "Plantillas WhatsApp con variables",
    body: "Las plantillas aceptan {nombre}, {producto}, {monto}, {negocio}… Se reemplazan al mandar el mensaje sin que toques nada.",
    cta: { label: "Editar plantillas", screen: "settings" },
  },
  {
    id: "customer-prices",
    emoji: "💼",
    title: "Precios por tipo de cliente",
    body: "Definí precio final, revendedor, mayorista y empresa una vez en el catálogo. Al armar una venta se sugiere el correcto según el cliente.",
  },
  {
    id: "pipeline-drag",
    emoji: "📐",
    title: "Pipeline 100% editable",
    body: "Arrastrá columnas para reordenar etapas, renombralas, cambialas de color o marcalas como ‘ganado’/‘perdido’ — el cambio se guarda solo.",
  },
  {
    id: "daily-goal",
    emoji: "🎯",
    title: "Meta diaria visual",
    body: "Configurá un objetivo en USD o ARS y se muestra como barra de progreso en Mi Día. Cumplirla activa una pequeña celebración.",
    cta: { label: "Configurar meta", screen: "settings" },
  },
  {
    id: "assigned-tasks",
    emoji: "✅",
    title: "Tareas obligatorias para el equipo",
    body: "Como owner armás tareas diarias/semanales (ej: 5 contactos por día) y se materializan automáticamente en el Mi Día de cada vendedor.",
    cta: { label: "Configurar tareas", screen: "settings" },
  },
  {
    id: "backups",
    emoji: "💾",
    title: "Backup automático diario",
    body: "Cada día se guarda una copia de tu base de datos. Se mantienen las últimas 14 y podés restaurar a cualquiera con un click.",
    cta: { label: "Ver backups", screen: "settings" },
  },
  {
    id: "industry",
    emoji: "🏷️",
    title: "Adaptá Clozr a tu rubro",
    body: "Si vendés ropa, autos, comida o servicios, podés cambiar el rubro y obtener catálogos, pipelines y plantillas ya armadas.",
    cta: { label: "Elegir rubro", screen: "settings" },
  },
  {
    id: "logo-banner",
    emoji: "🎨",
    title: "Personalizá con logo y banner",
    body: "Subí el logo de tu negocio (cuadrado 512×512) y un banner (1600×400). Aparecen en el topbar, sidebar y Mi Día, vistos por todo el equipo.",
    cta: { label: "Subir logo", screen: "settings" },
  },
  {
    id: "team-cloud",
    emoji: "☁️",
    title: "Sincronización entre PCs",
    body: "Si invitás miembros, cada PC ve los cambios del resto en segundos. Sin instalar nada raro — todo pasa por tu cuenta en la nube.",
    cta: { label: "Ver equipo", screen: "team" },
  },
  {
    id: "followups",
    emoji: "📅",
    title: "Seguimientos automáticos",
    body: "Al crear un lead podés agendar un seguimiento con fecha y hora. Aparece en Mi Día el día indicado con el mensaje WA pre-armado.",
  },
  {
    id: "pin-protection",
    emoji: "🔒",
    title: "PIN de acceso por usuario",
    body: "Cada miembro del equipo puede tener un PIN de 4-6 dígitos. Sin él, cualquiera con acceso al equipo puede entrar a tu sesión.",
    cta: { label: "Crear mi PIN", screen: "settings" },
  },
  {
    id: "shortcuts-keyboard",
    emoji: "⌨️",
    title: "Más atajos de teclado",
    body: "Ctrl+N para nuevo cliente, Ctrl+Shift+V para venta rápida, ESC cierra cualquier drawer. Probalos en cualquier pantalla.",
  },
];

/**
 * Elige un tip al azar que no haya sido visto recientemente. Si `seenIds`
 * cubre toda la pool (raro — son 17+), recicla pero evita el último.
 */
export function pickFeatureTip(seenIds: string[]): FeatureTip {
  const unseen = FEATURE_TIPS.filter((t) => !seenIds.includes(t.id));
  if (unseen.length > 0) {
    const i = Math.floor(Math.random() * unseen.length);
    return unseen[i]!;
  }
  // Reciclar — pero no el último (último elemento de seenIds).
  const lastId = seenIds[seenIds.length - 1];
  const pool = FEATURE_TIPS.filter((t) => t.id !== lastId);
  const i = Math.floor(Math.random() * pool.length);
  return pool[i] ?? FEATURE_TIPS[0]!;
}
