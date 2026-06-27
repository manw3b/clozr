/**
 * Plantillas WhatsApp para confirmar la visita / pedido al cliente.
 *
 * Se persisten en `workspace_settings` (KV) para que cada negocio las edite
 * desde Configuración. Acá viven los defaults + el motor de render.
 *
 * Hay dos plantillas separadas (final vs mayorista) porque el flujo es
 * distinto: al cliente final le mandás día/horario; al mayorista le mandás
 * un código de pedido autogenerado para que se anuncie con él.
 *
 * Placeholders soportados:
 *   {nombre}     — cliente (lead.clientName)
 *   {equipo}     — producto (lead.product); fallback "el equipo"
 *   {dia}        — día humano ("Martes 30")
 *   {hora}       — hora humana ("15:00hs")
 *   {direccion}  — dirección del local (setting wa_visit_address)
 *   {codigo}     — código mayorista generado (ej "B1202"); solo mayorista
 *   {negocio}    — nombre del workspace
 */

export const VISIT_TEMPLATE_KEYS = {
  final: "wa_visit_template_final",
  mayorista: "wa_visit_template_mayorista",
  address: "wa_visit_address",
  codePrefix: "wa_wholesale_code_prefix",
  codeCounter: "wa_wholesale_code_counter",
  // Mensaje post-venta: agradecimiento + recordatorio de etiquetarnos en
  // redes a cambio de un descuento en accesorios. Se manda desde el menú
  // contextual de una venta. Editable desde Ajustes.
  postSale: "wa_postsale_template",
  postSaleDiscount: "wa_postsale_discount_pct",
  // Outreach rápido: la plantilla del WhatsApp diario, la más usada.
  // Aparece como opción en el WhatsAppQuickPicker (junto a "vacío"). Una
  // sola plantilla configurable porque la decisión del Sprint 2 fue
  // mantener el picker simple — 2 opciones max.
  quickOutreach: "wa_quick_outreach_template",
} as const;

export const DEFAULT_VISIT_TEMPLATES = {
  final: `Nombre: {nombre}
Equipo: {equipo}

Día: {dia}
Horario: {hora}

Estamos en {direccion} (Por favor respetar el turno asignado).`,

  mayorista: `Anúnciate con el código
{codigo}

PEDIDO:
VUELTO:`,

  // SIN default real: cada negocio carga SU dirección en Ajustes. Vacío para
  // no filtrar datos de un negocio a otro en los mensajes (multi-tenant).
  address: "",
  codePrefix: "B",
  postSale: `¡Hola {nombre}! Gracias por elegirnos en {negocio} para tu {producto} 🙌

Si te gustó la experiencia, te re agradezco si nos etiquetás en tus redes — y como gracias te damos {descuento}% OFF en TODOS los accesorios para tu próxima compra.

¡Cualquier consulta o ayuda con el equipo escribime!`,
  postSaleDiscount: "30",
  quickOutreach: `¡Hola {nombre}! ¿Cómo estás? Te escribo de {negocio}, ¿en qué te puedo ayudar?`,
} as const;

export const PLACEHOLDER_HELP = [
  { token: "{nombre}", label: "Nombre del cliente" },
  { token: "{equipo}", label: "Producto / equipo" },
  { token: "{dia}", label: 'Día ("Martes 30")' },
  { token: "{hora}", label: 'Hora ("15:00hs")' },
  { token: "{direccion}", label: "Dirección del local" },
  { token: "{codigo}", label: "Código mayorista (solo mayorista)" },
  { token: "{negocio}", label: "Nombre del negocio" },
];

export const POSTSALE_PLACEHOLDER_HELP = [
  { token: "{nombre}", label: "Nombre del cliente" },
  { token: "{producto}", label: "Producto comprado (primer ítem)" },
  { token: "{monto}", label: "Total de la venta" },
  { token: "{descuento}", label: "% de descuento (configurable)" },
  { token: "{negocio}", label: "Nombre del negocio" },
];

export const QUICK_OUTREACH_PLACEHOLDER_HELP = [
  { token: "{nombre}", label: "Nombre del cliente" },
  { token: "{negocio}", label: "Nombre del negocio" },
];

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Formatea ISO o "YYYY-MM-DD HH:mm" → "Martes 30". */
export function formatVisitDay(iso: string): string {
  const d = parseLooseDate(iso);
  if (!d) return iso;
  const day = DAYS_ES[d.getDay()] ?? "";
  return `${day} ${d.getDate()}`.trim();
}

/** Formatea ISO o "YYYY-MM-DD HH:mm" → "15:00hs". */
export function formatVisitTime(iso: string): string {
  const d = parseLooseDate(iso);
  if (!d) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}hs`;
}

function parseLooseDate(s: string): Date | null {
  if (!s) return null;
  // Acepta tanto "2026-05-09T15:00" como "2026-05-09 15:00".
  const norm = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(norm);
  return isNaN(d.getTime()) ? null : d;
}

export interface VisitTemplateData {
  nombre?: string | null;
  equipo?: string | null;
  dia?: string | null;
  hora?: string | null;
  direccion?: string | null;
  codigo?: string | null;
  negocio?: string | null;
  // Campos extra usados por la plantilla post-venta. Quedan acá en lugar
  // de un tipo separado para que applyVisitTemplate sea un único renderer
  // que ignora silenciosamente los placeholders no usados por la plantilla.
  producto?: string | null;
  monto?: string | null;
  descuento?: string | null;
}

export function applyVisitTemplate(body: string, data: VisitTemplateData): string {
  const fb = (v: string | null | undefined, fallback: string) =>
    (v ?? "").trim() || fallback;

  return body
    .replace(/\{nombre\}/g, fb(data.nombre, "—"))
    .replace(/\{equipo\}/g, fb(data.equipo, fb(data.producto, "—")))
    .replace(/\{producto\}/g, fb(data.producto, fb(data.equipo, "—")))
    .replace(/\{monto\}/g, fb(data.monto, "—"))
    .replace(/\{descuento\}/g, fb(data.descuento, "30"))
    .replace(/\{dia\}/g, fb(data.dia, "—"))
    .replace(/\{hora\}/g, fb(data.hora, "—"))
    .replace(/\{direccion\}/g, fb(data.direccion, ""))
    .replace(/\{codigo\}/g, fb(data.codigo, "—"))
    .replace(/\{negocio\}/g, fb(data.negocio, ""));
}

/** Formatea un código mayorista a partir de prefijo + número (ej "B" + 1202). */
export function formatWholesaleCode(prefix: string, n: number): string {
  return `${prefix.trim() || "B"}${n}`;
}
