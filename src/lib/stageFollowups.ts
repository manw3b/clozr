/**
 * Mapeo de transiciones de etapa → followup automático.
 *
 * Cuando un lead se mueve a una nueva etapa, opcionalmente se crea un
 * followup recordatorio para que el vendedor no se olvide de avanzarlo.
 *
 * Si la etapa no está en el mapa, no se crea followup (ej: prospecto
 * inicial, perdido, cerrado se manejan aparte).
 */

import type { LeadStage } from "../types/domain";

export interface StageFollowupConfig {
  /** Días desde hoy hasta el due_date del followup. */
  days: number;
  /** Texto del followup. {nombre} se reemplaza con el nombre del cliente. */
  text: string;
}

/** Configuración por etapa de destino. */
export const STAGE_FOLLOWUPS: Partial<Record<LeadStage, StageFollowupConfig>> = {
  contactado: {
    days: 2,
    text: "Volver a contactar a {nombre} (lead contactado)",
  },
  "visita-agendada": {
    days: 1,
    text: "Confirmar visita con {nombre}",
  },
  presupuestado: {
    days: 3,
    text: "Hacer seguimiento al presupuesto de {nombre}",
  },
  negociando: {
    days: 2,
    text: "Avanzar negociación con {nombre}",
  },
  // cerrado / perdido: sin followup automático en el pipeline. Para "cerrado"
  // ya tenemos createPostSaleFollowup invocado desde el flujo de venta.
};

export function followupForStage(
  stage: LeadStage,
  customerName: string,
): StageFollowupConfig | null {
  const cfg = STAGE_FOLLOWUPS[stage];
  if (!cfg) return null;
  const firstName = customerName.trim().split(/\s+/)[0] ?? customerName;
  return {
    days: cfg.days,
    text: cfg.text.replace(/\{nombre\}/g, firstName),
  };
}
