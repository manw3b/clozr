import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { paymentMethodsDb } from "../../lib/db/paymentMethods";
import { useAuthStore, assertCan, can } from "../../store/authStore";
import { ensurePricingSchema } from "../../lib/db/ensureSchema";
import { Button } from "../../components/Button";
import { Modal, ModalField } from "../../components/Modal";
import { Input, Select } from "../../components/Input";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { useUIStore } from "../../store/uiStore";
import { useUndoableActions } from "../../store/useUndoableActions";
import { color, radius, space, text, weight } from "../../tokens";
import type { PaymentMethodKind, PaymentMethodRow } from "../../lib/db/types";

const KIND_LABELS: Record<PaymentMethodKind, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  tarjeta_credito: "Tarjeta crédito",
  tarjeta_debito: "Tarjeta débito",
  cuenta_corriente: "Cuenta corriente",
  usdt: "Crypto / USDT",
  otro: "Otro",
};

const KIND_OPTIONS: PaymentMethodKind[] = [
  "efectivo",
  "transferencia",
  "mercadopago",
  "tarjeta_credito",
  "tarjeta_debito",
  "cuenta_corriente",
  "usdt",
  "otro",
];

interface FormState {
  name: string;
  modifier_pct: string;
  currency: "ARS" | "USD";
  kind: PaymentMethodKind;
}

const EMPTY_FORM: FormState = {
  name: "",
  modifier_pct: "0",
  currency: "ARS",
  kind: "otro",
};

export function PaymentMethodsSection({ wid }: { wid: string }) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const registerUndo = useUndoableActions((s) => s.register);
  const [editing, setEditing] = useState<PaymentMethodRow | null>(null);
  const [creating, setCreating] = useState(false);

  const methodsQ = useQuery({
    queryKey: ["payment-methods", wid],
    queryFn: () => paymentMethodsDb.getAll(wid),
    enabled: !!wid,
  });

  const role = useAuthStore((s) => s.userRole);
  const allowed = can(role, "managePaymentMethods");

  const removeMut = useMutation({
    mutationFn: (id: string) => {
      assertCan(role, "managePaymentMethods");
      return paymentMethodsDb.remove(id);
    },
    // No invalidamos acá ni toast: el undoable se encarga del optimistic
    // y el toast con "Deshacer". Sólo invalidamos al final por si hay
    // queries derivadas que dependen.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-methods"] });
    },
  });

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => {
      assertCan(role, "managePaymentMethods");
      return paymentMethodsDb.update(id, { active });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-methods"] }),
  });

  const reorderMut = useMutation({
    mutationFn: ({ id, sort_order }: { id: string; sort_order: number }) => {
      assertCan(role, "managePaymentMethods");
      return paymentMethodsDb.update(id, { sort_order });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-methods"] }),
  });

  const methods = methodsQ.data ?? [];

  function move(idx: number, dir: -1 | 1) {
    const target = methods[idx + dir];
    const current = methods[idx];
    if (!target || !current) return;
    reorderMut.mutate({ id: current.id, sort_order: target.sort_order });
    reorderMut.mutate({ id: target.id, sort_order: current.sort_order });
  }

  return (
    <div>
      <header style={{ marginBottom: space[5], display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: space[3] }}>
        <div>
          <h2 style={{ margin: 0, fontSize: text.lg, fontWeight: weight.bold, color: color.text, letterSpacing: "-0.2px" }}>
            Métodos de pago
          </h2>
          <p style={{ margin: 0, marginTop: 4, fontSize: text.sm, color: color.textMuted }}>
            Cada método tiene un modificador % que se aplica sobre el precio sugerido al vender.
            <br />
            Positivo = el cliente paga más (cubre comisiones). Negativo = descuento.
          </p>
        </div>
        {allowed && (
          <Button variant="primary" iconLeft={<Plus size={14} />} onClick={() => setCreating(true)}>
            Nuevo método
          </Button>
        )}
      </header>

      {!allowed && (
        <div
          style={{
            padding: space[3],
            background: color.surface2,
            border: `1px dashed ${color.border}`,
            borderRadius: radius.md,
            marginBottom: space[4],
            fontSize: text.sm,
            color: color.textMuted,
          }}
        >
          Solo el owner o admin pueden modificar los métodos de pago. Estás en modo lectura.
        </div>
      )}

      {methods.length === 0 ? (
        <EmptyState
          title="Sin métodos de pago configurados"
          description="Agregá los métodos con los que cobrás (efectivo, transferencia, tarjeta, etc.)."
          action={{ label: "Agregar método", onClick: () => setCreating(true), iconLeft: <Plus size={14} /> }}
        />
      ) : (
        <div
          style={{
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            overflow: "hidden",
          }}
        >
          {methods.map((m, idx) => (
            <PaymentMethodRowItem
              key={m.id}
              method={m}
              isFirst={idx === 0}
              isLast={idx === methods.length - 1}
              onEdit={() => setEditing(m)}
              onDelete={() => {
                // Optimistic remove: sacamos el método del cache para
                // que desaparezca del UI inmediatamente. Si el usuario
                // apreta Deshacer, restauramos. Si no, al expirar el
                // toast hacemos el delete real en DB.
                if (!allowed) return;
                const queryKey = ["payment-methods", wid] as const;
                const snapshot = qc.getQueryData<PaymentMethodRow[]>(queryKey);
                qc.setQueryData<PaymentMethodRow[]>(queryKey, (prev) =>
                  prev ? prev.filter((x) => x.id !== m.id) : prev,
                );
                registerUndo({
                  label: `Método eliminado: ${m.name}`,
                  sublabel: `${KIND_LABELS[m.kind]} · ${m.currency}`,
                  onUndo: () => {
                    if (snapshot) qc.setQueryData(queryKey, snapshot);
                  },
                  commit: async () => {
                    try {
                      await removeMut.mutateAsync(m.id);
                    } catch (e) {
                      if (snapshot) qc.setQueryData(queryKey, snapshot);
                      showToast(
                        e instanceof Error ? e.message : "No se pudo eliminar",
                        "error",
                      );
                    }
                  },
                });
              }}
              onToggleActive={(active) => toggleActiveMut.mutate({ id: m.id, active })}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
            />
          ))}
        </div>
      )}

      <PaymentMethodFormModal
        open={creating}
        onClose={() => setCreating(false)}
        wid={wid}
      />
      <PaymentMethodFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        wid={wid}
        method={editing}
      />
    </div>
  );
}

function PaymentMethodRowItem({
  method,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onToggleActive,
  onMoveUp,
  onMoveDown,
}: {
  method: PaymentMethodRow;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isActive = method.active === 1;
  const modPct = method.modifier_pct;
  const modTone = modPct > 0 ? "warning" : modPct < 0 ? "success" : "neutral";
  const modLabel =
    modPct === 0 ? "Sin modificador" : `${modPct > 0 ? "+" : ""}${modPct}%`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[3],
        padding: `${space[3]} ${space[4]}`,
        borderBottom: `1px solid ${color.border}`,
        opacity: isActive ? 1 : 0.5,
      }}
    >
      {/* Reorder buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          style={{
            width: 22,
            height: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isFirst ? color.textDim : color.textMuted,
            cursor: isFirst ? "not-allowed" : "pointer",
            opacity: isFirst ? 0.3 : 1,
          }}
        >
          <ChevronUp size={12} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          style={{
            width: 22,
            height: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isLast ? color.textDim : color.textMuted,
            cursor: isLast ? "not-allowed" : "pointer",
            opacity: isLast ? 0.3 : 1,
          }}
        >
          <ChevronDown size={12} />
        </button>
      </div>

      {/* Name + kind */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          onClick={onEdit}
          style={{
            background: "transparent",
            color: color.text,
            fontSize: text.sm,
            fontWeight: weight.semibold,
            textAlign: "left",
            display: "block",
          }}
        >
          {method.name}
        </button>
        <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
          {KIND_LABELS[method.kind]} · {method.currency}
        </div>
      </div>

      {/* Modifier badge */}
      <Badge tone={modTone}>{modLabel}</Badge>

      {/* Active toggle */}
      <button
        onClick={() => onToggleActive(!isActive)}
        style={{
          padding: "4px 10px",
          fontSize: text.xs,
          fontWeight: weight.medium,
          background: isActive ? color.successBg : color.surface2,
          color: isActive ? color.success : color.textMuted,
          borderRadius: radius.sm,
          minWidth: 72,
        }}
      >
        {isActive ? "Activo" : "Inactivo"}
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        title="Eliminar"
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.sm,
          color: color.textMuted,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function PaymentMethodFormModal({
  open,
  onClose,
  wid,
  method,
}: {
  open: boolean;
  onClose: () => void;
  wid: string;
  method?: PaymentMethodRow | null;
}) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const editing = !!method;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const role = useAuthStore((s) => s.userRole);

  useEffect(() => {
    if (open) {
      setForm(
        method
          ? {
              name: method.name,
              modifier_pct: String(method.modifier_pct),
              currency: method.currency,
              kind: method.kind,
            }
          : EMPTY_FORM,
      );
    }
  }, [open, method]);

  const mut = useMutation({
    mutationFn: async () => {
      assertCan(role, "managePaymentMethods");
      // Defensa por si la migración 023 no corrió en esta DB
      await ensurePricingSchema();
      const payload = {
        name: form.name.trim(),
        modifier_pct: parseFloat(form.modifier_pct) || 0,
        currency: form.currency,
        kind: form.kind,
      };
      if (editing && method) {
        await paymentMethodsDb.update(method.id, payload);
      } else {
        await paymentMethodsDb.create(wid, payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-methods"] });
      showToast(editing ? "Método actualizado" : "Método creado", "success");
      onClose();
    },
  });

  const canSubmit = form.name.trim().length >= 2;

  const isDirty = () => {
    if (!method) {
      // Crear: cualquier dato distinto al default
      return form.name.trim().length > 0 || form.modifier_pct.trim() !== "0";
    }
    // Editar: comparar contra original
    return (
      form.name !== method.name ||
      parseFloat(form.modifier_pct || "0") !== method.modifier_pct ||
      form.currency !== method.currency ||
      form.kind !== method.kind
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar los cambios?"
      title={editing ? "Editar método de pago" : "Nuevo método de pago"}
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
            {editing ? "Guardar" : "Crear"}
          </Button>
        </>
      }
    >
      <ModalField label="Nombre" required hint="Como aparecerá en el modal de venta">
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Ej: Efectivo USD cara chica"
          autoFocus
        />
      </ModalField>

      <ModalField label="Tipo" required hint="Para clasificarlo en reportes y movimientos de caja">
        <Select
          value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as PaymentMethodKind }))}
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </ModalField>

      <ModalField label="Moneda" required>
        <Select
          value={form.currency}
          onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as "ARS" | "USD" }))}
        >
          <option value="ARS">ARS — Peso argentino</option>
          <option value="USD">USD — Dólar</option>
        </Select>
      </ModalField>

      <ModalField
        label="Modificador (%)"
        hint="Positivo = el cliente paga más (ej: tarjeta crédito +12%). Negativo = descuento (ej: efectivo −3%). 0 = sin modificación."
      >
        <Input
          type="number"
          step="0.1"
          value={form.modifier_pct}
          onChange={(e) => setForm((f) => ({ ...f, modifier_pct: e.target.value }))}
          placeholder="0"
          iconRight={<span style={{ color: color.textMuted, fontSize: text.sm }}>%</span>}
        />
      </ModalField>
    </Modal>
  );
}
