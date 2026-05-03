import { useState } from 'react';
import { Search } from 'lucide-react';
import { Modal, ModalField } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import { Input, Select } from '../../../components/Input';
import { color, radius, space, text, weight } from '../../../tokens';
import { PAYMENT_METHOD_LABELS } from '../../../types/domain';
import type { PaymentMethod, SaleStatus } from '../../../types/domain';
import { clientsMock } from '../../../mock/clients';
import { Avatar } from '../../../components/Avatar';

interface NewSaleModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    clientId: string;
    product: string;
    amount: number;
    paymentMethod: PaymentMethod;
    status: SaleStatus;
    paid: number;
  }) => void;
}

/**
 * Modal para registrar una nueva venta.
 *
 * UX:
 * - Búsqueda de cliente con resultados en vivo (4 sugerencias máx)
 * - Seleccionado el cliente, aparece el resto del formulario
 * - "Estado de pago" cambia el comportamiento del campo "Pagado"
 *   (auto-completa el monto si es "Pagado", lo deja en 0 si "Pendiente")
 */
export function NewSaleModal({ open, onClose, onSubmit }: NewSaleModalProps) {
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [product, setProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transferencia');
  const [status, setStatus] = useState<SaleStatus>('paid');
  const [paid, setPaid] = useState('');

  const selectedClient = clientId ? clientsMock.find((c) => c.id === clientId) : null;

  const filteredClients =
    clientSearch.trim().length === 0
      ? clientsMock.slice(0, 4)
      : clientsMock
          .filter((c) =>
            c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
            c.phone?.toLowerCase().includes(clientSearch.toLowerCase())
          )
          .slice(0, 4);

  function reset() {
    setClientSearch('');
    setClientId(null);
    setProduct('');
    setAmount('');
    setPaymentMethod('transferencia');
    setStatus('paid');
    setPaid('');
  }

  function handleStatusChange(s: SaleStatus) {
    setStatus(s);
    if (s === 'paid') setPaid(amount);
    if (s === 'pending') setPaid('0');
  }

  function handleAmountChange(v: string) {
    setAmount(v);
    if (status === 'paid') setPaid(v);
  }

  function handleSubmit() {
    if (!clientId || !product || !amount) return;
    onSubmit({
      clientId,
      product,
      amount: Number(amount),
      paymentMethod,
      status,
      paid: Number(paid || 0),
    });
    reset();
  }

  const canSubmit = !!clientId && !!product && Number(amount) > 0;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Nueva venta"
      subtitle="Registrá una venta y su forma de cobro"
      maxWidth={560}
      footer={
        <>
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={!canSubmit}>
            Registrar venta
          </Button>
        </>
      }
    >
      {/* CLIENTE */}
      <ModalField label="Cliente" required>
        {selectedClient ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space[3],
              padding: space[3],
              background: color.surface2,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
            }}
          >
            <Avatar name={selectedClient.name} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
                {selectedClient.name}
              </div>
              <div style={{ fontSize: text.xs, color: color.textMuted }}>{selectedClient.phone || '—'}</div>
            </div>
            <button
              onClick={() => setClientId(null)}
              style={{
                fontSize: text.xs,
                color: color.textMuted,
                fontWeight: weight.medium,
                padding: `${space[1]} ${space[2]}`,
                borderRadius: radius.sm,
                transition: 'all 100ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = color.surfaceHover;
                e.currentTarget.style.color = color.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = color.textMuted;
              }}
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <Input
              placeholder="Buscar cliente por nombre o teléfono…"
              iconLeft={<Search size={15} />}
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              autoFocus
            />
            <div
              style={{
                marginTop: space[2],
                background: color.surface2,
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
                overflow: 'hidden',
              }}
            >
              {filteredClients.length === 0 ? (
                <div style={{ padding: space[3], fontSize: text.sm, color: color.textMuted, textAlign: 'center' }}>
                  Sin resultados — <button style={{ color: color.primary, fontWeight: weight.semibold }}>crear cliente</button>
                </div>
              ) : (
                filteredClients.map((c, idx) => (
                  <button
                    key={c.id}
                    onClick={() => setClientId(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: space[3],
                      padding: space[3],
                      width: '100%',
                      textAlign: 'left',
                      borderBottom: idx === filteredClients.length - 1 ? 'none' : `1px solid ${color.border}`,
                      transition: 'background 100ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = color.surfaceHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Avatar name={c.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: text.xs, color: color.textMuted }}>{c.phone || '—'}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </ModalField>

      {/* PRODUCTO + MONTO */}
      {selectedClient && (
        <>
          <ModalField label="Producto" required>
            <Input
              placeholder="ej. iPhone 15 128GB"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            />
          </ModalField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
            <ModalField label="Monto total" required>
              <Input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
              />
            </ModalField>
            <ModalField label="Forma de pago">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </ModalField>
          </div>

          {/* ESTADO DE PAGO */}
          <ModalField label="Estado de pago">
            <div style={{ display: 'flex', gap: space[2] }}>
              <PaymentStatusOption
                active={status === 'paid'}
                onClick={() => handleStatusChange('paid')}
                label="Pagado"
                tone="success"
              />
              <PaymentStatusOption
                active={status === 'partial'}
                onClick={() => handleStatusChange('partial')}
                label="Parcial"
                tone="warning"
              />
              <PaymentStatusOption
                active={status === 'pending'}
                onClick={() => handleStatusChange('pending')}
                label="Pendiente"
                tone="danger"
              />
            </div>
          </ModalField>

          {status === 'partial' && (
            <ModalField label="Monto recibido (seña)" hint={`Falta ${amount ? formatRemaining(amount, paid) : '—'}`}>
              <Input
                type="number"
                placeholder="0"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
              />
            </ModalField>
          )}
        </>
      )}
    </Modal>
  );
}

function formatRemaining(amount: string, paid: string): string {
  const r = Number(amount) - Number(paid || 0);
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Math.max(0, r));
}

function PaymentStatusOption({
  active, onClick, label, tone,
}: { active: boolean; onClick: () => void; label: string; tone: 'success' | 'warning' | 'danger' }) {
  const tones = {
    success: { active: color.success, bg: color.successBg },
    warning: { active: color.warning, bg: color.warningBg },
    danger: { active: color.danger, bg: color.dangerBg },
  };
  const t = tones[tone];

  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        height: 36,
        padding: `0 ${space[3]}`,
        background: active ? t.bg : color.surface2,
        border: `1px solid ${active ? t.active : color.border}`,
        borderRadius: radius.md,
        color: active ? t.active : color.text,
        fontSize: text.sm,
        fontWeight: active ? weight.semibold : weight.medium,
        transition: 'all 100ms',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: t.active,
          opacity: active ? 1 : 0.4,
        }}
      />
      {label}
    </button>
  );
}
