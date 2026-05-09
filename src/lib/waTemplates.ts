/**
 * Plantillas de mensajes de WhatsApp por etapa del pipeline.
 *
 * Patrón: cada plantilla tiene un `body` con placeholders `{nombre}`,
 * `{producto}`, `{monto}`, `{negocio}` que se reemplazan con datos del
 * lead antes de mandar el mensaje.
 *
 * `stage: null` significa que la plantilla aplica a cualquier etapa
 * (genéricos como "Saludo informal").
 *
 * En una iteración futura: persistir en SQLite por workspace para que
 * cada negocio personalice sus plantillas.
 */

import type { LeadStage } from "../types/domain";

export interface WaTemplate {
  id: string;
  /** Etapa en la que aplica esta plantilla. null = aplica a cualquiera. */
  stage: LeadStage | null;
  name: string;
  body: string;
}

export const WA_TEMPLATES: WaTemplate[] = [
  // ─── Genéricos (cualquier etapa) ─────────────────────────────
  {
    id: "saludo-corto",
    stage: null,
    name: "Saludo corto",
    body: "Hola {nombre}, ¿cómo va? Te escribo de {negocio}.",
  },

  // ─── Prospecto ─────────────────────────────────────────────
  {
    id: "prospecto-primer-contacto",
    stage: "prospecto",
    name: "Primer contacto",
    body:
      "Hola {nombre}! Vi que estás interesado en el {producto}. ¿Cuándo podríamos hablar para pasarte la info y precio actualizado?",
  },
  {
    id: "prospecto-info",
    stage: "prospecto",
    name: "Mandar info",
    body:
      "Hola {nombre}, te paso la info del {producto}. Si te interesa, podemos coordinar una visita o seña directo. Avisame!",
  },

  // ─── Contactado ─────────────────────────────────────────────
  {
    id: "contactado-precio",
    stage: "contactado",
    name: "Pasar precio",
    body:
      "Hola {nombre}, como hablamos: el {producto} sale {monto} USD. ¿Te sirve? Cualquier consulta avisame.",
  },
  {
    id: "contactado-followup",
    stage: "contactado",
    name: "Volver a contactar",
    body:
      "Hola {nombre}, ¿pudiste pensar lo del {producto}? Si necesitás más info o tenemos que coordinar algo, decime.",
  },

  // ─── Visita agendada ─────────────────────────────────────────
  {
    id: "visita-confirmar",
    stage: "visita-agendada",
    name: "Confirmar visita",
    body:
      "Hola {nombre}, ¿confirmamos la visita por el {producto}? Te paso la dirección cuando me digas la hora exacta.",
  },
  {
    id: "visita-recordatorio",
    stage: "visita-agendada",
    name: "Recordatorio del día",
    body:
      "Hola {nombre}, recordatorio: hoy te espero por el {producto}. Si surge algo, avisame y reagendamos.",
  },

  // ─── Presupuestado ─────────────────────────────────────────
  {
    id: "presupuestado-followup",
    stage: "presupuestado",
    name: "Seguimiento presupuesto",
    body:
      "Hola {nombre}, ¿pudiste revisar el presupuesto del {producto} ({monto} USD)? Cualquier ajuste o duda me decís.",
  },

  // ─── Negociando ─────────────────────────────────────────────
  {
    id: "negociando-cierre",
    stage: "negociando",
    name: "Cierre / oferta final",
    body:
      "Hola {nombre}, te tengo el {producto} reservado. Te propongo cerrar en {monto} USD para que lo tengas esta semana. ¿Avanzamos?",
  },
  {
    id: "negociando-financiacion",
    stage: "negociando",
    name: "Opciones de pago",
    body:
      "Hola {nombre}, te paso opciones para el {producto}: efectivo {monto} USD, transferencia o tarjeta con un pequeño recargo. Decime cuál te conviene.",
  },

  // ─── Cerrado ─────────────────────────────────────────────────
  {
    id: "cerrado-gracias",
    stage: "cerrado",
    name: "Agradecimiento post-venta",
    body:
      "¡Gracias {nombre} por tu compra del {producto}! Cualquier consulta de uso, garantía o accesorios estoy a disposición. 🙌",
  },
  {
    id: "cerrado-recomendacion",
    stage: "cerrado",
    name: "Pedir referidos",
    body:
      "Hola {nombre}, espero que estés contento con el {producto}. Si conocés a alguien que esté buscando algo similar, te agradezco la recomendación 🙏",
  },
];

/**
 * Reemplaza los placeholders del body con datos del lead.
 * Si un placeholder no tiene valor, se reemplaza con un fallback razonable
 * (ej: "el producto", "tu compra") en lugar de dejar el `{producto}` literal.
 */
export function applyTemplate(
  body: string,
  data: {
    nombre?: string | null;
    producto?: string | null;
    monto?: number | null;
    negocio?: string | null;
  },
): string {
  const nombre = (data.nombre ?? "").trim() || "amigo";
  const producto = (data.producto ?? "").trim() || "el producto";
  const monto = data.monto ? String(data.monto) : "—";
  const negocio = (data.negocio ?? "").trim() || "el negocio";

  return body
    .replace(/\{nombre\}/g, nombre)
    .replace(/\{producto\}/g, producto)
    .replace(/\{monto\}/g, monto)
    .replace(/\{negocio\}/g, negocio);
}

/** Devuelve las plantillas aplicables a una etapa dada (incluye genéricas). */
export function templatesForStage(stage: LeadStage): WaTemplate[] {
  return WA_TEMPLATES.filter((t) => t.stage === null || t.stage === stage);
}
