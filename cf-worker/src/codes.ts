/**
 * Generación de códigos canjeables "CLOZR-XXXX-XXXX".
 *
 * Módulo neutral (sin deps) para que lo compartan la Consola (routes/console.ts)
 * y el cron de win-back (cron/dunning.ts) sin ciclos de import.
 */

/** Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para códigos legibles. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Genera "CLOZR-XXXX-XXXX" con entropía de crypto. */
export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    if (i === 3) s += "-";
  }
  return `CLOZR-${s}`;
}
