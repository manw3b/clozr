import type { IndustryConfig } from "./index";

export const foodIndustry: IndustryConfig = {
  slug: "food",
  label: "Gastronomía y delivery",
  icon: "🍕",
  description: "Para deliveries, food trucks, dark kitchens. Tracking de pedidos por turno, repartidores asignados, plantillas de confirmación.",
  isPaid: true,
  priceUsd: 120,
  status: "coming-soon",
  highlights: [
    "Pedidos por turno (almuerzo / cena) con horario estimado",
    "Asignación de repartidor + tracking del pedido",
    "Pipeline simple: Recibido → Cocinando → En camino → Entregado",
    "Plantillas WhatsApp: confirmación, estimado, entregado",
  ],
  inventoryLabel: "Menú",
};
