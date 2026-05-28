import type { IndustryConfig } from "./index";

export const fashionIndustry: IndustryConfig = {
  slug: "fashion",
  label: "Ropa y accesorios",
  icon: "👕",
  description: "Para revendedoras de ropa, indumentaria deportiva, accesorios. Variantes por talle y color, drops por temporada, plantillas de post-venta.",
  isPaid: true,
  priceUsd: 100,
  status: "coming-soon",
  highlights: [
    "Variantes por talle + color sin duplicar productos",
    "Pipeline simple: Interesado → Reservó → Pagó → Entregado",
    "Drops por temporada con fecha de lanzamiento",
    "Plantillas WhatsApp: catálogo del mes, recordatorio, agradecimiento",
  ],
  inventoryLabel: "Colección",
};
