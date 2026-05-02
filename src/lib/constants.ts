// Display labels for legacy customer type values in card/row/detail views
export const CUSTOMER_TYPES = [
  { value: "final", label: "Final" },
  { value: "revendedor", label: "Revendedor" },
  { value: "mayorista", label: "Mayorista" },
  { value: "empresa", label: "Empresa" },
] as const;

export const CUSTOMER_STATUSES = [
  { value: "activo", label: "Activo", color: "var(--green)" },
  { value: "potencial", label: "Potencial", color: "var(--blue)" },
  { value: "dormido", label: "Dormido", color: "var(--amber)" },
  { value: "perdido", label: "Perdido", color: "var(--text-tertiary)" },
] as const;

export const INACTIVE_WARNING_DAYS = 7;
export const INACTIVE_CRITICAL_DAYS = 14;
