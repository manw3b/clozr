import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { Modal, ModalField } from "./Modal";
import { Button } from "./Button";
import { Input, Select } from "./Input";
import { salesDb } from "../lib/db/sales";
import { paymentMethodsDb } from "../lib/db/paymentMethods";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useUIStore } from "../store/uiStore";
import { invalidate, qk } from "../lib/queryKeys";
import { color, space, text, weight } from "../tokens";
import { formatMoney } from "../lib/format";

/**
 * CollectPaymentModal — modal de cobro contra una venta pendiente.
 *
 * Reemplaza el `markAsPaid` bruto que se disparaba desde Mi Día "Cobrar"
 * (asumía "el cliente pagó todo, en alguna moneda, sin método") y abre
 * la puerta a pagos parciales en SaleDrawer (que tenía un botón "Agregar
 * pago" mostrando "próximamente").
 *
 * Campos:
 *  - Monto (default = balance pendiente, editable para parciales)
 *  - Método de pago (dropdown de payment_methods del workspace)
 *  - El currency lo hereda del método elegido
 *
 * Submit → llama salesDb.addPayment, que:
 *  - INSERT en sale_payments
 *  - Recalc total_paid + balance + is_paid sobre TODOS los pagos
 *  - Idempotente: si por algún error queda fuera de fase, converge
 *
 * Después invalida ventas + caja + mi-dia para que se refresque todo.
 */

interface SaleForPayment {
  id: string;
  clientName: string;
  /** Total facturado de la venta (no el pendiente). */
  total: number;
  /** Lo que falta cobrar. El monto default del modal. */
  balance: number;
  currency: "ARS" | "USD";
}

interface Props {
  open: boolean;
  onClose: () => void;
  sale: SaleForPayment | null;
}

export function CollectPaymentModal({ open, onClose, sale }: Props) {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  const qc = useQueryClient();
  const { showToast } = useUIStore();

  // Métodos activos del workspace. Mismo queryKey que NewSaleModal así
  // si edita métodos desde Settings, ambas pantallas se enteran.
  const methodsQ = useQuery({
    queryKey: qk.paymentMethods.active(wid),
    queryFn: () => paymentMethodsDb.getActive(wid),
    enabled: open && !!wid,
  });

  const [amountInput, setAmountInput] = useState("");
  const [methodId, setMethodId] = useState("");

  // Reset al abrir con una venta nueva: default monto = balance, default
  // método = el primero activo (o vacío si no hay).
  useEffect(() => {
    if (!open || !sale) return;
    setAmountInput(String(sale.balance));
    const methods = methodsQ.data ?? [];
    // Preferimos un método que matchee la moneda de la venta para no
    // mezclar (típico: cliente debe ARS, mejor cobrar ARS).
    const sameCurrency = methods.find((m) => m.currency === sale.currency);
    setMethodId((sameCurrency ?? methods[0])?.id ?? "");
  }, [open, sale?.id, methodsQ.data]);

  const selectedMethod = methodsQ.data?.find((m) => m.id === methodId) ?? null;

  // Parse + validación
  const amount = Number(amountInput.replace(",", "."));
  const amountValid = !isNaN(amount) && amount > 0;
  const exceedsBalance = sale ? amount > sale.balance + 0.001 : false;
  const currenciesMatch =
    !selectedMethod || !sale || selectedMethod.currency === sale.currency;

  const mut = useMutation({
    mutationFn: async () => {
      if (!sale || !selectedMethod) return;
      await salesDb.addPayment(sale.id, {
        method: selectedMethod.name,
        currency: selectedMethod.currency,
        amount,
      });
    },
    onSuccess: () => {
      // afterSaleChange invalida ventas + caja + mi-dia + inventario
      invalidate.afterSaleChange(qc);
      const isFull = sale && amount >= sale.balance - 0.001;
      showToast(
        isFull ? "Venta cobrada en total" : "Pago parcial registrado",
        "success",
      );
      onClose();
    },
  });

  const canSubmit = !!sale && !!selectedMethod && amountValid && currenciesMatch;

  const isDirty = () => {
    if (!sale) return false;
    return amount !== sale.balance || methodId !== "";
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar sin cobrar?"
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: space[2] }}>
          <DollarSign size={18} color={color.success} strokeWidth={2.4} />
          Cobrar {sale?.clientName ?? ""}
        </span>
      }
      maxWidth={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => mut.mutate()}
            disabled={!canSubmit || mut.isPending}
            loading={mut.isPending}
          >
            Registrar cobro
          </Button>
        </>
      }
    >
      {!sale ? null : (
        <>
          {/* Resumen de la deuda */}
          <div
            style={{
              padding: space[3],
              background: color.surface2,
              border: `1px solid ${color.border}`,
              borderRadius: 8,
              marginBottom: space[4],
              fontSize: text.sm,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", color: color.textMuted, marginBottom: 4 }}>
              <span>Total de la venta</span>
              <span style={{ color: color.text, fontWeight: weight.medium, fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(sale.total, sale.currency)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: color.danger, fontWeight: weight.semibold }}>Pendiente</span>
              <span style={{ color: color.danger, fontWeight: weight.bold, fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(sale.balance, sale.currency)}
              </span>
            </div>
          </div>

          <ModalField label="Monto a cobrar" required hint={amount < sale.balance ? "Pago parcial — la deuda queda actualizada" : undefined}>
            <Input
              type="number"
              step="any"
              min="0"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              autoFocus
            />
          </ModalField>

          <ModalField
            label="Método de pago"
            required
            hint={
              !currenciesMatch && selectedMethod
                ? `⚠ El método es ${selectedMethod.currency} pero la deuda está en ${sale.currency}. Cambiá el método o registralo en otra moneda con conversión manual.`
                : undefined
            }
          >
            <Select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              {(methodsQ.data ?? []).length === 0 ? (
                <option value="">— No hay métodos activos —</option>
              ) : (
                (methodsQ.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.currency})
                  </option>
                ))
              )}
            </Select>
          </ModalField>

          {exceedsBalance && (
            <div
              style={{
                marginTop: space[2],
                fontSize: text.xs,
                color: color.warning,
              }}
            >
              ⚠ El monto supera lo pendiente — se va a registrar como {formatMoney(sale.balance, sale.currency)} (el balance). Si querés acreditar más, abrí la venta y registrá un pago extra.
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
