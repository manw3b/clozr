import type { IndustryConfig } from "./index";

export const servicesIndustry: IndustryConfig = {
  slug: "services",
  label: "Servicios profesionales",
  icon: "💼",
  description: "Para freelancers, consultores, estudios profesionales. Gestión por proyecto, facturación recurrente, tareas por cliente.",
  isPaid: true,
  priceUsd: 100,
  status: "coming-soon",
  highlights: [
    "Pipeline orientado a propuestas: Brief → Cotización → Aprobado → En curso → Cerrado",
    "Tracking de horas / facturación recurrente",
    "Tareas por cliente con due date",
    "Plantillas WhatsApp: propuesta, seguimiento, factura",
  ],
};
