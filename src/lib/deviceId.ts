/**
 * IMEI / Serie = el "DNI" de un celular. Lo usamos para validar cada vez que un
 * equipo ENTRA al sistema (carga de stock, canje).
 *
 * Regla (definida con el negocio):
 *   - IMEI: exactamente 15 dígitos numéricos.
 *   - Serie: texto libre (cuando el equipo no tiene IMEI). Cualquier valor que
 *     NO sea puramente numérico se acepta como serie.
 *   - Un valor puramente numérico de largo distinto a 15 se considera un IMEI mal
 *     tipeado y se rechaza (evita cargar IMEIs incompletos por error).
 */
export function isValidDeviceId(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (/^\d+$/.test(v)) return v.length === 15; // todo números → IMEI exacto de 15
  return true; // tiene letras/símbolos → serie libre
}

/** ¿Es un IMEI (15 dígitos) o una serie libre? Para etiquetar en comprobantes/UI. */
export function deviceIdKind(raw: string): "imei" | "serie" {
  return /^\d{15}$/.test(raw.trim()) ? "imei" : "serie";
}

/** Etiqueta legible: "IMEI" o "Serie". */
export function deviceIdLabel(raw: string): "IMEI" | "Serie" {
  return deviceIdKind(raw) === "imei" ? "IMEI" : "Serie";
}

/**
 * Separa una lista cruda de identificadores en válidos e inválidos (descarta
 * los vacíos). Útil para la carga masiva (pegar varios IMEIs).
 */
export function partitionDeviceIds(raw: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const r of raw) {
    const v = r.trim();
    if (!v) continue;
    if (isValidDeviceId(v)) valid.push(v);
    else invalid.push(v);
  }
  return { valid, invalid };
}
