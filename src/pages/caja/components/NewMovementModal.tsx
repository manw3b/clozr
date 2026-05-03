import { useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Modal, ModalField } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import { Input, Select } from '../../../components/Input';
import { color, radius, space, text, weight } from '../../../tokens';
import {
  CASH_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../../../types/domain';
import type { CashCategory, CashMovementKind, PaymentMethod } from '../../../types/domain';

interface NewMovementModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    kind: CashMovementKind;
    amount: number;
    currency: 'ARS' | 'USD';
    description: string;
    category: CashCategory;
    paymentMethod?: PaymentMethod;
  }) => void;
}

const incomeCategories: CashCategory[] = ['cash-in', 'transfer-in', 'sale-payment', 'other'];
const expenseCategories: CashCategory[] = [
  'supplier', 'salary', 'rent', 'utilities', 'transport', 'fees', 'cash-out', 'other',
];

export function NewMovementModal({ open, onClose, onSubmit }: NewMovementModalProps) {
  const [kind, setKind] = useState<CashMovementKind>('income');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CashCategory>('cash-in');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');

  function reset() {
    setKind('income');
    setAmount('');
    setCurrency('ARS');
    setDescription('');
    setCategory('cash-in');
    setPaymentMethod('efectivo');
  }

  function handleKindChange(k: CashMovementKind) {
    setKind(k);
    setCategory(k === 'income' ? 'cash-in' : 'supplier');
  }

  function handleSubmit() {
    if (!amount || !description) return;
    onSubmit({
      kind,
      amount: Number(amount),
      currency,
      description,
      category,
      paymentMethod,
    });
    reset();
  }

  const canSubmit = Number(amount) > 0 && description.trim().length > 0;
  const categories = kind === 'income' ? incomeCategories : expenseCategories;

  const isDirty = () =>
    amount.trim().length > 0 || description.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar el movimiento?"
      title="Registrar movimiento"
      subtitle="Ingreso o egreso de caja"
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={() => { reset(); onClose(); }}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={!canSubmit}>
            Registrar
          </Button>
        </>
      }
    >
      {/* Tipo */}
      <ModalField label="Tipo de movimiento" required>
        <div style={{ display: 'flex', gap: space[2] }}>
          <KindButton
            active={kind === 'income'}
            onClick={() => handleKindChange('income')}
            icon={<ArrowUp size={15} strokeWidth={2.4} />}
            label="Ingreso"
            tone="success"
          />
          <KindButton
            active={kind === 'expense'}
            onClick={() => handleKindChange('expense')}
            icon={<ArrowDown size={15} strokeWidth={2.4} />}
            label="Egreso"
            tone="danger"
          />
        </div>
      </ModalField>

      {/* Monto + moneda */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: space[3] }}>
        <ModalField label="Monto" required>
          <Input
            type="number"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </ModalField>
        <ModalField label="Moneda">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as 'ARS' | 'USD')}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </Select>
        </ModalField>
      </div>

      {/* Descripción */}
      <ModalField label="Descripción" required>
        <Input
          placeholder="ej. Pago a proveedor — Lote x5 iPhone"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </ModalField>

      {/* Categoría + Forma de pago */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
        <ModalField label="Categoría">
          <Select value={category} onChange={(e) => setCategory(e.target.value as CashCategory)}>
            {categories.map((c) => (
              <option key={c} value={c}>{CASH_CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
        </ModalField>
        <ModalField label="Forma de pago">
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </ModalField>
      </div>
    </Modal>
  );
}

function KindButton({
  active, onClick, icon, label, tone,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; tone: 'success' | 'danger' }) {
  const t = tone === 'success'
    ? { fg: color.success, bg: color.successBg }
    : { fg: color.danger, bg: color.dangerBg };

  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        height: 44,
        padding: `0 ${space[3]}`,
        background: active ? t.bg : color.surface2,
        border: `1px solid ${active ? t.fg : color.border}`,
        borderRadius: radius.md,
        color: active ? t.fg : color.text,
        fontSize: text.sm,
        fontWeight: active ? weight.semibold : weight.medium,
        transition: 'all 100ms',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
      }}
    >
      {icon}
      {label}
    </button>
  );
}
