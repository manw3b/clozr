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

  address: "calle 44 e/ 17 y 18 Número 1136 (Timbre 101)",
  codePrefix: "B",
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
}

export function applyVisitTemplate(body: string, data: VisitTemplateData): string {
  const fb = (v: string | null | undefined, fallback: string) =>
    (v ?? "").trim() || fallback;

  return body
    .replace(/\{nombre\}/g, fb(data.nombre, "—"))
    .replace(/\{equipo\}/g, fb(data.equipo, "—"))
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
