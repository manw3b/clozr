/**
 * Cotizaciones del dólar en Argentina — fetcher a dolarapi.com.
 *
 * dolarapi.com es gratis, tiene CORS abierto y no requiere auth. Devuelve
 * los tipos de cambio principales que un argentino mira: oficial, blue,
 * cripto, mayorista, bolsa (MEP), CCL y tarjeta.
 *
 * Endpoints: https://dolarapi.com/v1/dolares
 *
 * Estrategia:
 *  - Llamamos al endpoint plural (1 request, todos los tipos).
 *  - Si la API está caída, usamos el último snapshot guardado en SQLite —
 *    la app sigue funcionando offline con la última cotización conocida.
 *  - El usuario elige cuál es "el activo" para sus cálculos en Settings.
 */

export type DolarKind =
  | 'oficial'
  | 'blue'
  | 'cripto'
  | 'mayorista'
  | 'bolsa'
  | 'contadoconliqui'
  | 'tarjeta';

export interface DolarRate {
  /** Slug interno de dolarapi (lo usamos como id/clave). */
  kind: DolarKind | string;
  /** Nombre humano que devuelve la API ("Blue", "Oficial", "Bolsa"…). */
  nombre: string;
  /** Precio compra (lo que te pagan por dólar). Puede ser null en algunos. */
  compra: number | null;
  /** Precio venta (lo que pagás por dólar). El que normalmente usamos. */
  venta: number;
  /** ISO timestamp con la última actualización en la fuente original. */
  sourceUpdatedAt: string;
}

const ENDPOINT = 'https://dolarapi.com/v1/dolares';

interface RawRate {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number | null;
  venta: number;
  fechaActualizacion: string;
}

/**
 * Lista de tipos que sí queremos mostrar. dolarapi devuelve algunos extras
 * que no son interesantes para el caso de uso del reseller (ej: "solidario"
 * que es lo mismo que tarjeta + impuestos). Los filtramos.
 */
const SUPPORTED_KINDS: DolarKind[] = [
  'oficial',
  'blue',
  'cripto',
  'mayorista',
  'bolsa',
  'contadoconliqui',
  'tarjeta',
];

/**
 * Etiquetas humanas en castellano. Usamos las propias del API por defecto
 * y override sólo donde el nombre es confuso ("Contado con Liquidación"
 * → "CCL", "Bolsa" → "MEP / Bolsa").
 */
export const DOLAR_KIND_LABELS: Record<string, string> = {
  oficial: 'Oficial',
  blue: 'Blue',
  cripto: 'Cripto',
  mayorista: 'Mayorista',
  bolsa: 'MEP (Bolsa)',
  contadoconliqui: 'CCL',
  tarjeta: 'Tarjeta',
};

/**
 * Trae todas las cotizaciones soportadas en una sola llamada. Si el
 * endpoint plural falla, intenta una vez más; si vuelve a fallar, lanza.
 * El caller decide si mostrar error o caer al cache.
 */
export async function fetchAllRates(): Promise<DolarRate[]> {
  const res = await fetch(ENDPOINT, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    // No cache del navegador: queremos siempre la respuesta más reciente.
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`dolarapi.com respondió ${res.status}`);
  }
  const raw: RawRate[] = await res.json();
  return raw
    .filter((r) => SUPPORTED_KINDS.includes(r.casa as DolarKind))
    .map<DolarRate>((r) => ({
      kind: r.casa as DolarKind,
      nombre: DOLAR_KIND_LABELS[r.casa] ?? r.nombre,
      compra: r.compra ?? null,
      venta: r.venta,
      sourceUpdatedAt: r.fechaActualizacion,
    }))
    // Orden estable para que la UI no salte de posiciones entre fetches.
    .sort((a, b) => SUPPORTED_KINDS.indexOf(a.kind as DolarKind) - SUPPORTED_KINDS.indexOf(b.kind as DolarKind));
}
