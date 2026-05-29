/** Fecha local "YYYY-MM-DD" de hoy. Respeta el huso del dispositivo
 *  (no usa toISOString, que convierte a UTC y adelanta el día de noche). */
export function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
