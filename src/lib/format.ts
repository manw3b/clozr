/**
 * Helpers de formato. Compartidos por toda la app.
 */

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Formatea moneda con separador de miles y sin decimales */
export function formatMoney(amount: number, currency: 'ARS' | 'USD' = 'ARS'): string {
  return (currency === 'USD' ? usdFormatter : arsFormatter).format(amount);
}

/**
 * Formatea moneda compacta para cards de métricas:
 *   1_290_000 → "$1.29M"
 *   54_300    → "$54.3k"
 *   850       → "$850"
 */
export function formatMoneyCompact(amount: number, currency: 'ARS' | 'USD' = 'ARS'): string {
  const sign = amount < 0 ? '-' : '';
  const symbol = currency === 'USD' ? 'US$' : '$';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${symbol}${abs}`;
}

/** Saludo segun la hora del día */
export function greetByHour(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

const greetTexts = {
  morning: 'Buenos días',
  afternoon: 'Buenas tardes',
  evening: 'Buenas tardes',
  night: 'Buenas noches',
};

export function greetText(g: keyof typeof greetTexts): string {
  return greetTexts[g];
}

/** "Sábado, 2 de mayo" */
export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Fecha completa con año, tolerante a ISO inválido:
 *   short → "2 may 2026"  ·  long → "2 de mayo de 2026"
 * Usada por changelog / About / "Novedades".
 */
export function formatDateFull(iso: string, opts: { month?: 'short' | 'long' } = {}): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: opts.month ?? 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** "14:30" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Tiempo relativo desde/hasta:
 *   en 3 horas, hace 2 días, vence hoy, vencido hace 1 día
 */
export function formatRelative(iso: string, opts: { kind?: 'due' | 'past' } = {}): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = target - now;
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  const hrs = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  if (opts.kind === 'due') {
    if (mins < 60) return past ? `vencida hace ${mins}m` : `vence en ${mins}m`;
    if (hrs < 24) return past ? `vencida hace ${hrs}h` : `vence en ${hrs}h`;
    return past ? `vencida hace ${days}d` : `vence en ${days}d`;
  }

  if (mins < 60) return past ? `hace ${mins}m` : `en ${mins}m`;
  if (hrs < 24) return past ? `hace ${hrs}h` : `en ${hrs}h`;
  if (days < 30) return past ? `hace ${days}d` : `en ${days}d`;
  const months = Math.round(days / 30);
  return past ? `hace ${months}m` : `en ${months}m`;
}

/** "Hace 45 días" — para inactividad de clientes */
export function formatDaysAgo(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  if (days < 60) return 'hace 1 mes';
  return `hace ${Math.round(days / 30)} meses`;
}

/** Pluralización simple */
export function plural(n: number, sing: string, plur: string): string {
  return n === 1 ? sing : plur;
}

/**
 * Fecha local "YYYY-MM-DD" de un Date. Usar SIEMPRE esto en vez de
 * `date.toISOString().slice(0, 10)`: toISOString convierte a UTC, y en
 * Argentina (UTC-3) eso adelanta un día a partir de las 21:00 hora local
 * → followups/tareas/cobros con fecha equivocada. Esta versión respeta
 * el huso horario del dispositivo.
 */
export function toLocalISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
