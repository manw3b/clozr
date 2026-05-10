import { useEffect, useState } from 'react';
import { Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Modal, ModalField } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import type { CashSummary } from '../../../types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  summary: CashSummary;
  onConfirm: (input: { ars: number; usd: number }) => Promise<void>;
}

/**
 * Modal de arqueo / cierre de caja.
 *
 * El usuario cuenta físicamente el dinero (ARS y USD por separado) y lo
 * ingresa. El modal muestra:
 *   - Lo que el sistema espera tener (currentBalance del día).
 *   - Lo que efectivamente hay (input físico).
 *   - La diferencia con su signo (sobrante/faltante) en cada moneda.
 *
 * Al confirmar, persiste los valores físicos como closed_balance del día.
 * No fuerza que la diferencia sea 0 — un faltante o sobrante chico es
 * normal y queda registrado en la sesión para auditoría.
 */
export function CloseCashModal({ open, onClose, summary, onConfirm }: Props) {
  const expectedArs = summary.currentBalance.ars;
  const expectedUsd = summary.currentBalance.usd;

  const [arsInput, setArsInput] = useState('');
  const [usdInput, setUsdInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      // Pre-cargamos con lo que espera el sistema — usuario sólo corrige
      // si la cuenta física da distinto. Acelera el flujo cuando todo cuadra.
      setArsInput(String(Math.round(expectedArs)));
      setUsdInput(String(Math.round(expectedUsd)));
    }
  }, [open, expectedArs, expectedUsd]);

  const ars = Number(arsInput) || 0;
  const usd = Number(usdInput) || 0;
  const diffArs = ars - expectedArs;
  const diffUsd = usd - expectedUsd;
  const totalDiffArs = diffArs + diffUsd * (summary.usdRate || 1);

  const isDirty = () => {
    return ars !== Math.round(expectedArs) || usd !== Math.round(expectedUsd);
  };

  const canSubmit = arsInput.trim() !== '' && usdInput.trim() !== '' && !submitting;

  async function handleConfirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm({ ars, usd });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar el modal sin terminar el arqueo?"
      title="Cerrar caja del día"
      maxWidth={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            iconLeft={<Calendar size={14} />}
            onClick={handleConfirm}
            disabled={!canSubmit}
            loading={submitting}
          >
            Confirmar cierre
          </Button>
        </>
      }
    >
      <p style={{ fontSize: text.sm, color: color.textMuted, marginTop: 0, marginBottom: space[3] }}>
        Contá el efectivo físico en caja y registralo abajo. La diferencia
        con lo que el sistema esperaba queda guardada en la sesión para
        auditoría — no tiene que ser exactamente cero.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
        <ModalField label="Pesos contados (ARS)" required>
          <Input
            type="number"
            value={arsInput}
            onChange={(e) => setArsInput(e.target.value)}
            placeholder="0"
            iconLeft={<span style={{ fontSize: 12, fontWeight: weight.semibold }}>$</span>}
            autoFocus
          />
        </ModalField>
        <ModalField label="Dólares contados (USD)" required>
          <Input
            type="number"
            value={usdInput}
            onChange={(e) => setUsdInput(e.target.value)}
            placeholder="0"
            iconLeft={<span style={{ fontSize: 12, fontWeight: weight.semibold }}>US$</span>}
          />
        </ModalField>
      </div>

      {/* Comparativa: sistema vs físico */}
      <div
        style={{
          marginTop: space[4],
          padding: space[3],
          background: color.surface2,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          display: 'flex',
          flexDirection: 'column',
          gap: space[2],
        }}
      >
        <DiffRow
          label="Pesos"
          expected={expectedArs}
          counted={ars}
          diff={diffArs}
          currency="ARS"
        />
        <DiffRow
          label="Dólares"
          expected={expectedUsd}
          counted={usd}
          diff={diffUsd}
          currency="USD"
        />
        <div
          style={{
            borderTop: `1px solid ${color.border}`,
            paddingTop: space[2],
            marginTop: space[1],
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
            Diferencia total (en ARS)
          </span>
          <DiffBadge value={totalDiffArs} currency="ARS" big />
        </div>
      </div>
    </Modal>
  );
}

function DiffRow({
  label,
  expected,
  counted,
  diff,
  currency,
}: {
  label: string;
  expected: number;
  counted: number;
  diff: number;
  currency: 'ARS' | 'USD';
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 100px', gap: space[2], alignItems: 'center' }}>
      <span style={{ fontSize: text.xs, color: color.textMuted, fontWeight: weight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <span style={{ fontSize: text.xs, color: color.textDim, textAlign: 'right' }}>
        Sistema: <strong style={{ color: color.textMuted, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(expected, currency)}</strong>
      </span>
      <span style={{ fontSize: text.xs, color: color.textDim, textAlign: 'right' }}>
        Contado: <strong style={{ color: color.text, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(counted, currency)}</strong>
      </span>
      <DiffBadge value={diff} currency={currency} />
    </div>
  );
}

function DiffBadge({ value, currency, big }: { value: number; currency: 'ARS' | 'USD'; big?: boolean }) {
  const rounded = Math.round(value * 100) / 100;
  const isZero = Math.abs(rounded) < 0.01;
  const isPositive = rounded > 0;

  const tone = isZero ? color.textMuted : isPositive ? color.success : color.danger;
  const toneBg = isZero ? color.surface2 : isPositive ? color.successBg : color.dangerBg;
  const Icon = isZero ? CheckCircle2 : AlertTriangle;
  const label = isZero
    ? 'Cuadra'
    : `${isPositive ? '+' : ''}${formatMoney(rounded, currency)}`;
  const subLabel = isZero ? '' : isPositive ? 'sobra' : 'falta';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: big ? '4px 10px' : '2px 6px',
        borderRadius: radius.sm,
        background: toneBg,
        color: tone,
        fontSize: big ? text.sm : text.xs,
        fontWeight: weight.semibold,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        justifySelf: 'end',
      }}
      title={isZero ? 'Cuadra exacto' : `${label} ${subLabel}`}
    >
      <Icon size={big ? 12 : 10} strokeWidth={2.4} />
      {label}
      {!isZero && !big && <span style={{ opacity: 0.7 }}>{subLabel}</span>}
    </span>
  );
}
