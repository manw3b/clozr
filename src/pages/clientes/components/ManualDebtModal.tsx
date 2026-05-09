import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, ModalField } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import { Input, Select } from '../../../components/Input';
import { DateTimePicker } from '../../../components/DateTimePicker';
import { salesDb } from '../../../lib/db/sales';
import { invalidate } from '../../../lib/queryKeys';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { useBusinessStore } from '../../../store/businessStore';
import { useAuthStore } from '../../../store/authStore';
import { useUIStore } from '../../../store/uiStore';
import { space } from '../../../tokens';

/**
 * ManualDebtModal — registra una deuda informal de un cliente sin
 * pasar por el flujo completo de "Nueva venta".
 *
 * Casos de uso:
 *   - "Juan me debe $500 que le presté"
 *   - "Saldo del celular anterior"
 *   - "Garantía atrasada"
 *
 * Internamente crea una `sale` con out_of_stock_sale=1 y total_paid=0.
 * Aparece en la lista de Deudas del cliente igual que cualquier venta
 * no pagada.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}

export function ManualDebtModal({ open, onClose, clientId, clientName }: Props) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { userId, userName } = useAuthStore();
  const wid = activeWorkspace?.id ?? '';

  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('USD');
  const [dueDate, setDueDate] = useState('');

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setConcept('');
      setAmount('');
      setCurrency('USD');
      setDueDate('');
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: () => {
      const n = parseFloat(amount);
      return salesDb.createManualDebt(wid, {
        customer_id: clientId,
        customer_name: clientName,
        business_id: activeBusiness?.id ?? null,
        concept: concept.trim(),
        amount: n,
        currency,
        due_date: dueDate ? dueDate.split('T')[0] : null,
        seller_id: userId ?? null,
        seller_name: userName ?? null,
      });
    },
    onSuccess: () => {
      invalidate.afterSaleChange(qc);
      invalidate.afterClientChange(qc);
      showToast('Deuda registrada', 'success');
      onClose();
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Error al cargar la deuda', 'error');
    },
  });

  const conceptValid = concept.trim().length >= 2;
  const amountValid = !!amount && parseFloat(amount) > 0;
  const canSubmit = conceptValid && amountValid;

  const isDirty = () => concept.trim().length > 0 || amount.trim().length > 0 || !!dueDate;

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar la deuda?"
      title="Cargar deuda"
      subtitle={`Registrar dinero que ${clientName} debe sin que haya una venta concreta detrás`}
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => mut.mutate()}
            disabled={!canSubmit}
            loading={mut.isPending}
          >
            Cargar deuda
          </Button>
        </>
      }
    >
      <ModalField
        label="Concepto"
        required
        hint="¿Qué representa esta deuda? Ej: Saldo iPhone 13, Préstamo, Garantía atrasada"
      >
        <Input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder='Ej: "Saldo del iPhone 13"'
          autoFocus
        />
      </ModalField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: space[3] }}>
        <ModalField label="Monto" required>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </ModalField>
        <ModalField label="Moneda">
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as 'ARS' | 'USD')}
          >
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </Select>
        </ModalField>
      </div>

      <ModalField label="Vencimiento" hint="Opcional — para recordar cuándo cobrarla">
        <DateTimePicker
          value={dueDate}
          onChange={setDueDate}
          placeholder="Sin vencimiento"
        />
      </ModalField>
    </Modal>
  );
}
