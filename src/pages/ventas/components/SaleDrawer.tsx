import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Pencil,
  Package,
} from 'lucide-react';
import { WhatsAppIcon } from '../../../components/icons/WhatsAppIcon';
import { Drawer } from '../../../components/Drawer';
import { Button } from '../../../components/Button';
import { Badge } from '../../../components/Badge';
import { Avatar } from '../../../components/Avatar';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney, formatRelative, formatDateLong, formatTime } from '../../../lib/format';
import { salesDb } from '../../../lib/db/sales';
import type { Sale, SaleStatus, PaymentMethod } from '../../../types/domain';
import { PAYMENT_METHOD_LABELS } from '../../../types/domain';
import { qk } from '../../../lib/queryKeys';
import type { SaleItem } from '../../../lib/db/types';

interface SaleDrawerProps {
  sale: Sale;
  onClose: () => void;
  onMarkPaid?: () => void;
  onAddPayment?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onOpenClient?: () => void;
  onSendReceipt?: () => void;
}

export function SaleDrawer({
  sale,
  onClose,
  onMarkPaid,
  onAddPayment,
  onEdit,
  onOpenClient,
  onSendReceipt,
}: SaleDrawerProps) {
  const remaining = sale.amount - sale.paid;
  const isOverdue =
    sale.status !== 'paid' && sale.dueAt && new Date(sale.dueAt).getTime() < Date.now();

  const itemsQ = useQuery({
    queryKey: qk.ventas.saleItems(sale.id),
    queryFn: () => salesDb.getItems(sale.id),
  });
  const paymentsQ = useQuery({
    queryKey: qk.ventas.salePayments(sale.id),
    queryFn: () => salesDb.getPayments(sale.id),
  });

  return (
    <Drawer
      open
      onClose={onClose}
      width="560px"
      header={
        <SaleHeader sale={sale} onClose={onClose} onEdit={onEdit} />
      }
      footer={
        sale.status === 'paid' ? (
          <Button variant="secondary" size="md" iconLeft={<WhatsAppIcon size={15} color="var(--success)" />} fullWidth onClick={onSendReceipt} disabled={!onSendReceipt}>
            Enviar comprobante por WhatsApp
          </Button>
        ) : (
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button variant="secondary" size="md" onClick={onAddPayment} fullWidth>
              Registrar pago
            </Button>
            <Button
              variant="primary"
              size="md"
              iconLeft={<CheckCircle2 size={15} />}
              onClick={onMarkPaid}
              fullWidth
            >
              Marcar pagado
            </Button>
          </div>
        )
      }
    >
      {/* Big amount + status */}
      <div
        style={{
          padding: space[5],
          borderBottom: `1px solid ${color.border}`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: text.xs,
            fontWeight: weight.semibold,
            color: color.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            marginBottom: 4,
          }}
        >
          Total de la venta
        </div>
        <div
          style={{
            fontSize: text['3xl'],
            fontWeight: weight.bold,
            color: color.text,
            letterSpacing: '-0.8px',
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatMoney(sale.amount, sale.currency as 'USD' | 'ARS')}
        </div>
        <div style={{ marginTop: space[2], display: 'inline-flex' }}>
          <StatusBadge status={sale.status} />
        </div>

        {sale.status !== 'paid' && (
          <div
            style={{
              marginTop: space[3],
              padding: `${space[2]} ${space[3]}`,
              background: isOverdue ? color.dangerBg : color.warningBg,
              border: `1px solid ${isOverdue ? color.danger : color.warning}`,
              borderRadius: radius.md,
              display: 'inline-flex',
              alignItems: 'center',
              gap: space[2],
              fontSize: text.sm,
              fontWeight: weight.semibold,
              color: isOverdue ? color.danger : color.warning,
            }}
          >
            <AlertCircle size={14} strokeWidth={2.4} />
            <span>
              Falta {formatMoney(remaining)}{' '}
              {sale.dueAt && (
                <>· {isOverdue ? 'vencida' : 'vence'} {formatRelative(sale.dueAt, { kind: 'due' })}</>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: space[5] }}>
        {/* Productos (multi-item) */}
        <Section title={`Productos${itemsQ.data ? ` · ${itemsQ.data.length}` : ''}`}>
          <ItemsList items={itemsQ.data ?? []} loading={itemsQ.isLoading} fallback={sale.product} />
        </Section>

        <Section title="Detalle">
          <Row label="Forma de pago" value={sale.paymentMethod ? PAYMENT_METHOD_LABELS[sale.paymentMethod] : '—'} />
          <Row label="Fecha" value={`${formatDateLong(sale.createdAt)} · ${formatTime(sale.createdAt)}`} />
          {sale.paidAt && (
            <Row label="Pagado el" value={`${formatDateLong(sale.paidAt)} · ${formatTime(sale.paidAt)}`} />
          )}
          {sale.dueAt && sale.status !== 'paid' && (
            <Row
              label="Vencimiento"
              value={
                <span style={{ color: isOverdue ? color.danger : color.text, fontWeight: weight.semibold }}>
                  {formatDateLong(sale.dueAt)}
                </span>
              }
            />
          )}
          {sale.ownerName && <Row label="Vendedor" value={sale.ownerName} />}
        </Section>

        {/* Cobros */}
        <Section title="Cobros">
          {(paymentsQ.data ?? []).length > 0 ? (
            (paymentsQ.data ?? []).map((p) => (
              <PaymentRow
                key={p.id}
                amount={p.amount}
                kind="paid"
                method={p.method as PaymentMethod}
                date={sale.paidAt || sale.createdAt}
              />
            ))
          ) : (
            <PaymentRow
              amount={sale.paid}
              kind="paid"
              method={sale.paymentMethod}
              date={sale.paidAt || sale.createdAt}
            />
          )}
          {remaining > 0 && (
            <PaymentRow amount={remaining} kind="pending" date={sale.dueAt} />
          )}
        </Section>

        {/* Cliente */}
        <Section title="Cliente">
          <div
            onClick={onOpenClient}
            style={{
              padding: space[3],
              background: color.surface2,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              display: 'flex',
              alignItems: 'center',
              gap: space[3],
              cursor: onOpenClient ? 'pointer' : 'default',
              transition: 'background 100ms',
            }}
            onMouseEnter={(e) => {
              if (onOpenClient) e.currentTarget.style.background = color.surfaceHover;
            }}
            onMouseLeave={(e) => {
              if (onOpenClient) e.currentTarget.style.background = color.surface2;
            }}
          >
            <Avatar name={sale.clientName} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: text.sm,
                  fontWeight: weight.semibold,
                  color: color.text,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {sale.clientName}
              </div>
              <div style={{ fontSize: text.xs, color: color.textMuted }}>Ver detalle del cliente</div>
            </div>
            {onOpenClient && <ExternalLink size={14} color={color.textDim} />}
          </div>
        </Section>

        {sale.notes && (
          <Section title="Notas">
            <p
              style={{
                margin: 0,
                fontSize: text.sm,
                color: color.text,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {sale.notes}
            </p>
          </Section>
        )}
      </div>
    </Drawer>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * ItemsList — render multi-item con thumbnails
 * ────────────────────────────────────────────────────────────────── */

function ItemsList({
  items,
  loading,
  fallback,
}: {
  items: SaleItem[];
  loading: boolean;
  fallback: string;
}) {
  if (loading) {
    return (
      <div style={{ fontSize: text.sm, color: color.textMuted, padding: space[3] }}>Cargando…</div>
    );
  }
  if (items.length === 0) {
    return (
      <div
        style={{
          padding: space[3],
          background: color.surface2,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          fontSize: text.sm,
          color: color.text,
        }}
      >
        {fallback}
      </div>
    );
  }
  return (
    <div
      style={{
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}
    >
      {items.map((it, idx) => (
        <ItemRow key={it.id} item={it} divider={idx < items.length - 1} />
      ))}
    </div>
  );
}

function ItemRow({ item, divider }: { item: SaleItem; divider: boolean }) {
  const subtotal = item.unit_price * item.quantity;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        padding: space[3],
        borderBottom: divider ? `1px solid ${color.border}` : 'none',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          background: color.surface,
          borderRadius: radius.sm,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <Package size={18} color={color.textDim} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.semibold,
            color: color.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.description}
        </div>
        <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
          {item.quantity > 1
            ? `${item.quantity} × ${formatMoney(item.unit_price)}`
            : formatMoney(item.unit_price)}
          {item.imei && ` · IMEI ${item.imei}`}
        </div>
      </div>
      <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text, fontVariantNumeric: 'tabular-nums' }}>
        {formatMoney(subtotal)}
      </div>
    </div>
  );
}

function SaleHeader({ sale, onClose, onEdit }: { sale: Sale; onClose: () => void; onEdit?: () => void }) {
  return (
    <header
      style={{
        padding: `${space[4]} ${space[5]}`,
        borderBottom: `1px solid ${color.border}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: space[3],
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: text.xs,
            fontWeight: weight.semibold,
            color: color.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            marginBottom: 2,
          }}
        >
          Venta {sale.number || sale.id}
        </div>
        <h2
          style={{
            margin: 0,
            fontSize: text.lg,
            fontWeight: weight.bold,
            color: color.text,
            letterSpacing: '-0.3px',
          }}
        >
          {sale.clientName}
        </h2>
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        {onEdit && (
          <button
            onClick={onEdit}
            aria-label="Editar"
            title="Editar"
            style={iconBtnStyle()}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, iconBtnHover())}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, iconBtnReset())}
          >
            <Pencil size={15} strokeWidth={2.2} />
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={iconBtnStyle()}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, iconBtnHover())}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, iconBtnReset())}
        >
          <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 300 }}>×</span>
        </button>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: SaleStatus }) {
  if (status === 'paid')
    return <Badge tone="success" size="md" dot>Pagado</Badge>;
  if (status === 'partial')
    return <Badge tone="warning" size="md" dot>Parcial</Badge>;
  return <Badge tone="danger" size="md" dot>Sin pagar</Badge>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: space[5] }}>
      <h3
        style={{
          margin: 0,
          marginBottom: space[3],
          fontSize: text.xs,
          fontWeight: weight.semibold,
          color: color.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({
  label, value, strong,
}: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: space[3],
        padding: `${space[2]} 0`,
        borderBottom: `1px solid ${color.border}`,
      }}
    >
      <span style={{ fontSize: text.sm, color: color.textMuted }}>{label}</span>
      <span
        style={{
          fontSize: text.sm,
          color: color.text,
          fontWeight: strong ? weight.semibold : weight.medium,
          textAlign: 'right',
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function PaymentRow({
  amount,
  kind,
  method,
  date,
}: {
  amount: number;
  kind: 'paid' | 'pending';
  method?: PaymentMethod;
  date?: string;
}) {
  return (
    <div
      style={{
        padding: space[3],
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        marginBottom: space[2],
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.md,
          background: kind === 'paid' ? color.successBg : color.warningBg,
          color: kind === 'paid' ? color.success : color.warning,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {kind === 'paid' ? <CheckCircle2 size={15} strokeWidth={2.4} /> : <Clock size={15} strokeWidth={2.4} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.semibold,
            color: color.text,
            marginBottom: 1,
          }}
        >
          {kind === 'paid' ? 'Cobrado' : 'Pendiente de cobro'}
        </div>
        <div style={{ fontSize: text.xs, color: color.textMuted }}>
          {method && PAYMENT_METHOD_LABELS[method]}
          {method && date && ' · '}
          {date && formatRelative(date)}
        </div>
      </div>
      <div
        style={{
          fontSize: text.sm,
          fontWeight: weight.bold,
          color: color.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatMoney(amount)}
      </div>
    </div>
  );
}

function iconBtnStyle(): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    color: color.textMuted,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 100ms',
    background: 'transparent',
  };
}
function iconBtnHover() {
  return { background: color.surfaceHover, color: color.text };
}
function iconBtnReset() {
  return { background: 'transparent', color: color.textMuted };
}
