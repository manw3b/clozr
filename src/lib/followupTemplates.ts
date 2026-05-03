import type { FollowUp } from "../types/domain";

/**
 * Construye el texto sugerido para enviar por WhatsApp según el tipo de
 * followup. Editable por el usuario antes de mandarlo (WhatsApp lo deja
 * pre-llenado en el chat).
 *
 * Usar firstName(clientName) para no decir "Hola Juan Carlos Pérez González".
 */
export function buildFollowupWhatsAppMessage(f: FollowUp): string {
  const name = firstName(f.clientName);

  switch (f.reason) {
    case "post-venta": {
      // notes formato: "Post-venta · iPhone 17 Pro Max"
      const product = (f.notes ?? "").replace(/^post-venta\s*[·.-]\s*/i, "").trim();
      if (product) {
        return `Hola ${name}! Te quería preguntar cómo va el ${product}. Cualquier cosa, acá estoy. 👋`;
      }
      return `Hola ${name}! Te quería preguntar cómo va con la compra. Cualquier cosa, acá estoy. 👋`;
    }
    case "cliente-inactivo":
      return `Hola ${name}! Hace tiempo que no charlamos. ¿Cómo andás? ¿Algún cambio de equipo en mente?`;
    case "cobro-pendiente":
      return `Hola ${name}, te paso a recordar el pago pendiente. Avisame cuando puedas. ¡Gracias!`;
    case "cotizacion-enviada":
      return `Hola ${name}! ¿Pudiste ver la cotización que te pasé? Cualquier duda me decís.`;
    case "sin-respuesta":
      return `Hola ${name}! ¿Cómo andás? Te paso para retomar la charla.`;
    case "lead-tibio":
      return `Hola ${name}! ¿Pudiste pensarlo? Cualquier consulta acá estoy.`;
    case "recordatorio":
    default:
      return f.notes && f.notes.length > 0
        ? `Hola ${name}! ${f.notes}`
        : `Hola ${name}! ¿Cómo andás?`;
  }
}

function firstName(full: string): string {
  return (full ?? "").split(/\s+/)[0] || full || "";
}
