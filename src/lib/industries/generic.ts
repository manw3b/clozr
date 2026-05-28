/**
 * Industry "generic" — el rubro default.
 *
 * Es lo que tiene un workspace sin compra de nicho específico. Pelado a
 * propósito: pipeline básico, sin catálogo seed, sin WA templates pre-armadas.
 * Funcional para alguien que quiere armar todo desde cero.
 *
 * Ver ROADMAP.md §6 principio 3 — generic debe funcionar de verdad, no ser
 * un placeholder roto.
 */

import type { IndustryConfig } from "./index";

export const genericIndustry: IndustryConfig = {
  slug: "generic",
  label: "Genérico",
  icon: "📦",
  description: "CRM básico para cualquier tipo de negocio. Vos armás todo a mano: catálogo, pipeline, plantillas. Ideal si tu rubro no encaja con los preset, o querés empezar limpio.",
  isPaid: false,
  priceUsd: null,
  status: "ready",
  highlights: [
    "Catálogo libre — agregás tus productos a mano",
    "Pipeline 4 etapas genérico (Prospecto → Vendido)",
    "Plantillas de WhatsApp básicas",
    "Sin tareas obligatorias preconfiguradas",
  ],
};
