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
  { emoji: "📊", text: "Reportes próximamente. Mientras tanto, el ticket promedio y top egresos están en cada pantalla." },
];

/** Tip random consistente dentro de una misma sesión (no rota al re-render).
 *  Si querés rotar, llamá pickRandomTip() de nuevo. */
export function pickRandomTip(): ClozrTip {
  const i = Math.floor(Math.random() * CLOZR_TIPS.length);
  return CLOZR_TIPS[i]!;
}
