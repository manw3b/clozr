/**
 * Industry "automotive" — concesionarias, agencias de autos usados,
 * compra-venta de motos. Coming-soon hasta cliente piloto real
 * (ROADMAP §9 — no diseñamos para fantasmas).
 */
import type { IndustryConfig } from "./index";

export const automotiveIndustry: IndustryConfig = {
  slug: "automotive",
  label: "Autos",
  icon: "🚗",
  description: "Para concesionarias, agencias de usados, motos. Tracking por patente/dominio, etapas con toma + patentamiento, lead-source para canales (Mercado Libre, Facebook, walk-in).",
  isPaid: true,
  priceUsd: 150,
  status: "coming-soon",
  highlights: [
    "Pipeline 7 etapas: Cotización → Toma → Negociación → Seña → Patentamiento → Entregado",
    "Custom fields: patente, kilometraje, año, dominio, motor",
    "Tracking de canal de adquisición (ML, Facebook, walk-in)",
    "Plantillas WhatsApp: tasación, seña, turno de entrega",
  ],
  inventoryLabel: "Vehículos",
};
