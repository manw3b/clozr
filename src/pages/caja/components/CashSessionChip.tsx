import { color, radius, space, text, weight } from '../../../tokens';
import { formatRelative } from '../../../lib/format';
import type { CashDaySession } from '../../../lib/db/cashSessions';

interface Props {
  session: CashDaySession | null | undefined;
}

/**
 * Chip pequeño que indica si la sesión de caja del día está abierta o
 * cerrada, con el timestamp relativo. Va al lado del título de la pantalla.
 *
 * - Abierta → punto verde + "Caja abierta · hace 4h"
 * - Cerrada → punto rojo + "Caja cerrada · 9 may 21:30"
 * - Sin sesión real (ghost) → no rendea nada (la app igual funciona).
 */
export function CashSessionChip({ session }: Props) {
  if (!session || session.id === 'ghost-session') return null;

  const isOpen = !session.closed_at;
  const dotColor = isOpen ? color.success : color.danger;
  const label = isOpen ? 'Caja abierta' : 'Caja cerrada';
  const timestamp = isOpen ? session.opened_at : session.closed_at!;
  const relativeText = isOpen
    ? formatRelative(timestamp)
    : new Date(timestamp).toLocaleString('es-AR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });

  return (
    <span
      title={`${label} · ${new Date(timestamp).toLocaleString('es-AR')}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: radius.full,
        background: isOpen ? color.successBg : color.dangerBg,
        border: `1px solid ${isOpen ? color.success : color.danger}33`,
        fontSize: text.xs,
        fontWeight: weight.semibold,
        color: dotColor,
        marginLeft: space[2],
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dotColor,
          // Punto pulsante sutil sólo si está abierta — referencia visual
          // de "está pasando ahora".
          animation: isOpen ? 'clozrPulse 2s ease-in-out infinite' : undefined,
          flexShrink: 0,
        }}
      />
      {label} · {relativeText}
      <style>{`
        @keyframes clozrPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.85); }
        }
      `}</style>
    </span>
  );
}
