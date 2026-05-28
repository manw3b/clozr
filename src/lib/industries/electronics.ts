/**
 * Industry "electronics" — iPhones, MacBooks, gadgets en general.
 * Este es el dogfood interno (iPhone Club) y el primer nicho que vamos
 * a lanzar pago. Status "ready" en cuanto J4 mueva los seeds de
 * src/lib/db/quickStock.ts a este file (hoy todavía viven globales).
 */
import type { IndustryConfig } from "./index";

export const electronicsIndustry: IndustryConfig = {
  slug: "electronics",
  label: "Electrónica",
  icon: "📱",
  description: "Para revendedores de iPhones, MacBooks, gadgets y accesorios. Catálogo Apple precargado, IMEI tracking, etapas de venta optimizadas para el rubro celular argentino.",
  isPaid: true,
  priceUsd: 80,
  status: "preview", // ready cuando J4 traiga los seeds completos
  highlights: [
    "Catálogo Apple precargado: iPhone 11 a 16 Pro Max + iPads + Macs",
    "Pipeline 6 etapas: Prospecto → Contactado → Interesado → Reservó → Vendido",
    "IMEI tracking + auto-decremento de stock al vender",
    "Plantillas WhatsApp: confirmar reserva, recordatorio, post-venta",
    "Tareas obligatorias sugeridas: subir historia, seguir cuentas, contactar inactivos",
  ],
  inventoryLabel: "Catálogo Apple",
};
