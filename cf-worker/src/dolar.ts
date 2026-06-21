/**
 * Cotización del dólar para billing (server-side).
 *
 * Los precios de Clozr son en USD (fuente de verdad) pero se cobran en ARS.
 * Convertimos USD→ARS con el dólar BLUE de dolarapi.com — la MISMA fuente que
 * usa el chip del frontend (src/lib/dolar.ts) — para que el cobro siga al
 * dólar y no perdamos si el peso se devalúa.
 *
 * La cotización se resuelve SIEMPRE en el Worker (no se confía en un valor que
 * mande el cliente: sería manipulable para pagar menos). Cache in-memory por
 * isolate con TTL para no pegarle a dolarapi en cada checkout.
 */

const RATE_TTL_MS = 60 * 60 * 1000; // 1h
let cached: { value: number; at: number } | null = null;

/**
 * Devuelve el dólar blue (venta) en ARS. Lanza si no puede resolverlo —
 * el caller decide (ej: el checkout devuelve 503 y el usuario reintenta).
 */
export async function getBlueRate(): Promise<number> {
  if (cached && Date.now() - cached.at < RATE_TTL_MS) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let res: Response;
  try {
    res = await fetch("https://dolarapi.com/v1/dolares/blue", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`[dolar] HTTP ${res.status}`);

  const data = (await res.json().catch(() => null)) as { venta?: number; compra?: number } | null;
  const value = Number(data?.venta);
  if (!value || !Number.isFinite(value) || value <= 0) {
    // Si dolarapi cambió el shape o vino basura, reusamos el último bueno antes de fallar.
    if (cached) return cached.value;
    throw new Error("[dolar] cotización inválida");
  }
  cached = { value, at: Date.now() };
  return value;
}

/** Convierte un monto USD a ARS entero, al blue actual. */
export async function usdToArs(usd: number): Promise<number> {
  const rate = await getBlueRate();
  return Math.round(usd * rate);
}
