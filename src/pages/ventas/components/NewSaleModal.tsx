import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmAsync } from "../../../lib/confirmAsync";
import { Search, Plus, Trash2, UserPlus, Check } from "lucide-react";
import { Modal, ModalField } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { Input, Select } from "../../../components/Input";
import { Avatar } from "../../../components/Avatar";
import { Badge } from "../../../components/Badge";
import { Stepper } from "../../../components/Stepper";
import { color, radius, space, text, weight } from "../../../tokens";
import { formatMoney } from "../../../lib/format";
import { invalidate, qk } from "../../../lib/queryKeys";
import { useClientsList } from "../../clientes/useClientsData";
import { paymentMethodsDb } from "../../../lib/db/paymentMethods";
import { customersDb } from "../../../lib/db/customers";
import { settingsDb } from "../../../lib/db/settings";
import { catalogDb } from "../../../lib/db/catalog";
import { pricingDb } from "../../../lib/db/pricing";
import { useWorkspaceStore } from "../../../store/workspaceStore";
import { useExchangeRateStore } from "../../../store/exchangeRateStore";
import { useUIStore } from "../../../store/uiStore";
import { ensurePricingSchema } from "../../../lib/db/ensureSchema";
import type { Client } from "../../../types/domain";
import type { CatalogItem, CatalogItemWithImeis, CustomerTypeRow, PaymentMethodRow } from "../../../lib/db/types";
import { getTemplateImageUrl } from "../../../lib/templates/productImageMap";

export interface NewSaleItem {
  catalogItemId: string | null;
  productDescription: string;
  quantity: number;
  /** Precio unitario en USD (siempre). El método de pago decide la moneda final. */
  unitPriceUsd: number;
  imei?: string | null;
}

export interface NewSalePayload {
  clientId: string | null;
  clientName: string | null;
  customerTypeId: string | null;
  items: NewSaleItem[];
  paymentCurrency: "ARS" | "USD";
  usdToArs: number;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodKind: string;
  paymentModifierPct: number;
  outOfStock: boolean;
}

/** Pre-carga el modal con datos conocidos.
 * - Desde inventario: catalogItem + imei
 * - Desde pipeline: client + unitPriceUsd estimado
 * Cualquier campo es opcional y combinable. */
export interface NewSalePreset {
  client?: Client;
  catalogItem?: CatalogItem;
  imei?: string | null;
  unitPriceUsd?: number;
}

interface NewSaleModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Devuelve Promise<void>: resolve = éxito (modal muestra confirmación + cierra),
   * reject = error (modal queda abierto con los datos cargados).
   */
  onSubmit: (data: NewSalePayload) => Promise<void> | void;
  preset?: NewSalePreset | null;
}

interface ItemDraft {
  key: string;
  catalogItem: CatalogItem | null;
  productDescription: string;
  outOfStock: boolean;
  quantity: number;
  /** Precio en USD como string (permite vacío mid-typing) */
  unitPriceUsdInput: string;
  imei?: string | null;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyItem(): ItemDraft {
  return {
    key: uid(),
    catalogItem: null,
    productDescription: "",
    outOfStock: false,
    quantity: 1,
    unitPriceUsdInput: "",
    imei: null,
  };
}

function presetToItem(p: NewSalePreset): ItemDraft {
  return {
    key: uid(),
    catalogItem: p.catalogItem ?? null,
    productDescription: "",
    outOfStock: false,
    quantity: 1,
    unitPriceUsdInput: p.unitPriceUsd ? String(p.unitPriceUsd) : "",
    imei: p.imei ?? null,
  };
}

export function NewSaleModal({ open, onClose, onSubmit, preset }: NewSaleModalProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const { usdToArs } = useExchangeRateStore();
  const wid = activeWorkspace?.id ?? "";

  const [clientSearch, setClientSearch] = useState("");
  const [client, setClient] = useState<Client | null>(preset?.client ?? null);
  const [creatingClient, setCreatingClient] = useState(false);

  const [items, setItems] = useState<ItemDraft[]>(() =>
    preset ? [presetToItem(preset)] : [emptyItem()],
  );
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<null | {
    totalUsd: number;
    totalInPaymentCurrency: number;
    currency: "ARS" | "USD";
    itemsCount: number;
    clientName: string | null;
    methodName: string;
  }>(null);

  // Ref a la sección "¿Cómo paga el cliente?". Cuando llega un preset con
  // cliente + producto + precio (típico desde Pipeline "Cerrar venta"),
  // hacemos auto-scroll para que el vendedor vea directo lo que tiene que
  // decidir. Sin saltar pasos ni esconder secciones — el modal sigue siendo
  // una pantalla única; solo movemos el viewport.
  const paymentSectionRef = useRef<HTMLDivElement>(null);

  // Si llega un preset nuevo mientras el modal está cerrado, lo aplicamos al abrir
  useEffect(() => {
    if (open && preset) {
      setItems([presetToItem(preset)]);
      if (preset.client) setClient(preset.client);

      // Preset completo (cliente + producto + precio) ⇒ todos los campos
      // obligatorios de la parte superior ya están resueltos. Scroll suave
      // a la sección de pago para que se vea directo.
      const presetComplete =
        !!preset.client &&
        !!preset.catalogItem &&
        typeof preset.unitPriceUsd === 'number' &&
        preset.unitPriceUsd > 0;
      if (presetComplete) {
        // Esperamos a que el modal pinte + cargue queries antes de scrollear.
        // 200ms cubre el render del PaymentMethodCard grid (depende de paymentsQ).
        const t = setTimeout(() => {
          paymentSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 200);
        return () => clearTimeout(t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset?.catalogItem?.id, preset?.imei, preset?.client?.id, preset?.unitPriceUsd]);

  const { data: allClients = [] } = useClientsList();

  const customerTypesQ = useQuery({
    queryKey: qk.customerTypes.list(wid),
    queryFn: () => settingsDb.getCustomerTypes(wid),
    enabled: open && !!wid,
  });

  const paymentsQ = useQuery({
    queryKey: qk.paymentMethods.active(wid),
    queryFn: () => paymentMethodsDb.getActive(wid),
    enabled: open && !!wid,
  });

  // Auto-seed defensivo (igual que antes)
  useEffect(() => {
    if (!open || !wid) return;
    if (paymentsQ.data && paymentsQ.data.length === 0) {
      ensurePricingSchema()
        .then(() => paymentMethodsDb.seedDefaults(wid))
        .then(() => paymentsQ.refetch())
        .catch(() => {});
    }
  }, [open, wid, paymentsQ.data, paymentsQ]);

  const catalogQ = useQuery({
    queryKey: qk.catalog.itemsSearch(wid),
    queryFn: () => catalogDb.getAll(wid),
    enabled: open && !!wid,
  });

  function reset() {
    setClientSearch("");
    setClient(null);
    setCreatingClient(false);
    setItems([emptyItem()]);
    setPaymentMethodId("");
  }

  // Auto-pick payment method: usa el último usado (persisted en localStorage)
  // como fallback al primero disponible.
  useEffect(() => {
    if (!open || !paymentsQ.data || paymentsQ.data.length === 0 || paymentMethodId) return;
    const lastUsedKey = `clozr.lastPaymentMethod.${wid}`;
    const lastUsedId = localStorage.getItem(lastUsedKey);
    const lastUsed = lastUsedId
      ? paymentsQ.data.find((p) => p.id === lastUsedId)
      : null;
    setPaymentMethodId(lastUsed?.id ?? paymentsQ.data[0]?.id ?? "");
  }, [open, paymentsQ.data, paymentMethodId, wid]);

  const customerTypes = customerTypesQ.data ?? [];
  const customerType: CustomerTypeRow | null = useMemo(() => {
    if (!client) return customerTypes[0] ?? null;
    return (
      customerTypes.find((t) => t.name.toLowerCase() === client.type) ??
      customerTypes[0] ??
      null
    );
  }, [client, customerTypes]);

  const paymentMethod: PaymentMethodRow | null = useMemo(
    () => paymentsQ.data?.find((p) => p.id === paymentMethodId) ?? null,
    [paymentsQ.data, paymentMethodId],
  );

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return allClients.slice(0, 5);
    const q = clientSearch.toLowerCase();
    return allClients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q),
      )
      .slice(0, 5);
  }, [allClients, clientSearch]);

  // Total siempre en USD (fuente de verdad)
  const totalUsd = items.reduce((s, it) => {
    const price = parseFloat(it.unitPriceUsdInput) || 0;
    return s + price * (it.quantity || 0);
  }, 0);

  // Calcular total en moneda del payment method seleccionado (display)
  function applyMethod(usdAmount: number, m: PaymentMethodRow | null): number {
    if (!m) return usdAmount;
    const factor = 1 + (m.modifier_pct || 0) / 100;
    if (m.currency === "USD") return usdAmount * factor;
    if (!usdToArs || usdToArs <= 0) return 0;
    return usdAmount * usdToArs * factor;
  }
  const totalInPaymentCurrency = applyMethod(totalUsd, paymentMethod);

  const hasOutOfStock = items.some((it) => it.outOfStock);

  const itemsValid =
    items.length > 0 &&
    items.every(
      (it) =>
        it.quantity > 0 &&
        (parseFloat(it.unitPriceUsdInput) || 0) > 0 &&
        (it.outOfStock ? it.productDescription.trim().length >= 2 : !!it.catalogItem),
    );

  const canSubmit = !!paymentMethod && itemsValid && !submitting && !success;

  async function handleSubmit() {
    if (!canSubmit || !paymentMethod) return;
    setSubmitting(true);
    const payload: NewSalePayload = {
      clientId: client?.id ?? null,
      clientName: client?.name ?? null,
      customerTypeId: customerType?.id ?? null,
      items: items.map((it) => ({
        catalogItemId: it.outOfStock ? null : it.catalogItem?.id ?? null,
        productDescription: it.outOfStock
          ? it.productDescription.trim()
          : it.catalogItem?.name ?? "Producto",
        quantity: it.quantity,
        unitPriceUsd: parseFloat(it.unitPriceUsdInput) || 0,
        imei: it.outOfStock ? null : it.imei ?? null,
      })),
      paymentCurrency: paymentMethod.currency,
      usdToArs,
      paymentMethodId: paymentMethod.id,
      paymentMethodName: paymentMethod.name,
      paymentMethodKind: paymentMethod.kind,
      paymentModifierPct: paymentMethod.modifier_pct,
      outOfStock: hasOutOfStock,
    };
    try {
      await onSubmit(payload);
      // Persistir último método de pago para la próxima venta
      try {
        localStorage.setItem(`clozr.lastPaymentMethod.${wid}`, paymentMethod.id);
      } catch { /* no localStorage en algunos entornos */ }
      setSuccess({
        totalUsd,
        totalInPaymentCurrency,
        currency: paymentMethod.currency,
        itemsCount: items.length,
        clientName: client?.name ?? null,
        methodName: paymentMethod.name,
      });
      setTimeout(() => {
        setSuccess(null);
        reset();
        onClose();
      }, 1600);
    } catch {
      /* error: keep open */
    } finally {
      setSubmitting(false);
    }
  }

  // El modal está sucio si hay datos cargados que se perderían al cerrar
  function isDirty(): boolean {
    if (success || submitting) return false;
    if (client) return true;
    if (creatingClient) return true;
    if (clientSearch.trim()) return true;
    return items.some(
      (it) =>
        !!it.catalogItem ||
        it.productDescription.trim() ||
        it.unitPriceUsdInput.trim() ||
        it.outOfStock,
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar la venta?"
      title={success ? "" : "Nueva venta"}
      subtitle={
        success
          ? undefined
          : items.length > 1
          ? `${items.length} productos · ${formatMoney(totalUsd, "USD")}`
          : "Registrá una venta del catálogo"
      }
      maxWidth={680}
      footer={
        success ? null : (
          <>
            <Button
              variant="ghost"
              onClick={async () => {
                if (isDirty()) {
                  if (await confirmAsync({
                    title: "Descartar venta",
                    message: "¿Cerrar y descartar la venta? Vas a perder los cambios.",
                    confirmText: "Descartar",
                    tone: "danger",
                  })) {
                    reset();
                    onClose();
                  }
                } else {
                  reset();
                  onClose();
                }
              }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={submitting}
            >
              {submitting
                ? "Registrando…"
                : `${hasOutOfStock ? "Registrar fuera de stock" : "Registrar venta"} · ${formatMoney(totalUsd, "USD")}`}
            </Button>
          </>
        )
      }
    >
      {success && <SuccessView {...success} />}
      {!success && (
      <>
      {/* CLIENTE */}
      <ModalField label="Cliente" hint="Opcional — para venta de mostrador podés dejarlo vacío">
        {client ? (
          <SelectedClientCard
            client={client}
            customerType={customerType}
            onClear={() => setClient(null)}
          />
        ) : creatingClient ? (
          <InlineCreateClient
            wid={wid}
            initialName={clientSearch}
            customerTypes={customerTypes}
            onCancel={() => setCreatingClient(false)}
            onCreated={(c) => {
              setClient(c);
              setCreatingClient(false);
              setClientSearch("");
            }}
          />
        ) : (
          <ClientPicker
            search={clientSearch}
            setSearch={setClientSearch}
            results={filteredClients}
            onPick={setClient}
            onCreateNew={() => setCreatingClient(true)}
          />
        )}
      </ModalField>

      {/* ITEMS */}
      <div
        style={{
          marginTop: space[5],
          marginBottom: space[2],
          fontSize: text.xs,
          fontWeight: weight.semibold,
          color: color.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Productos *</span>
        <span style={{ color: color.textMuted, fontWeight: weight.medium, textTransform: "none", letterSpacing: 0 }}>
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
        {items.map((it, idx) => (
          <ItemRowEditor
            key={it.key}
            item={it}
            customerType={customerType}
            catalog={catalogQ.data ?? []}
            canRemove={items.length > 1}
            onRemove={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
            onChange={(patch) =>
              setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
            }
          />
        ))}
      </div>

      <button
        onClick={() => setItems((arr) => [...arr, emptyItem()])}
        style={{
          marginTop: space[3],
          display: "flex",
          alignItems: "center",
          gap: space[2],
          padding: `${space[2]} ${space[3]}`,
          background: "transparent",
          border: `1px dashed ${color.border}`,
          borderRadius: radius.md,
          color: color.textMuted,
          fontSize: text.sm,
          width: "100%",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 120ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = color.primary;
          e.currentTarget.style.color = color.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = color.border;
          e.currentTarget.style.color = color.textMuted;
        }}
      >
        <Plus size={14} />
        Agregar otro producto
      </button>

      {/* ¿CÓMO PAGA EL CLIENTE? — cards visuales.
          El wrapper con ref permite el auto-scroll cuando viene preset completo. */}
      <div ref={paymentSectionRef} style={{ scrollMarginTop: 12 }}>
      <ModalField label="¿Cómo paga el cliente?" required>
        {paymentsQ.data && paymentsQ.data.length === 0 ? (
          <div
            style={{
              background: color.surface2,
              border: `1px dashed ${color.border}`,
              borderRadius: radius.md,
              padding: space[3],
              fontSize: text.sm,
              color: color.textMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: space[3],
            }}
          >
            <span>No hay métodos de pago configurados.</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!wid) return;
                ensurePricingSchema()
                  .then(() => paymentMethodsDb.seedDefaults(wid))
                  .then(() => paymentsQ.refetch())
                  .catch(() => {});
              }}
            >
              Cargar default
            </Button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: space[2],
            }}
          >
            {(paymentsQ.data ?? []).map((p) => (
              <PaymentMethodCard
                key={p.id}
                method={p}
                amountUsd={totalUsd}
                usdToArs={usdToArs}
                selected={paymentMethodId === p.id}
                onSelect={() => setPaymentMethodId(p.id)}
              />
            ))}
          </div>
        )}
      </ModalField>
      </div>

      {/* TOTAL DUAL */}
      <div
        style={{
          marginTop: space[4],
          padding: space[3],
          background: color.surface2,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: text.sm, color: color.textMuted, fontWeight: weight.medium }}>
            Total a cobrar
          </div>
          {paymentMethod && (
            <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2 }}>
              vía {paymentMethod.name}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: text.lg, fontWeight: weight.bold, color: color.text, fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(totalUsd, "USD")}
          </div>
          {paymentMethod && totalUsd > 0 && (
            paymentMethod.currency === "ARS" ? (
              !usdToArs || usdToArs <= 0 ? (
                <div style={{ fontSize: text.xs, color: color.warning, marginTop: 2, fontStyle: "italic" }}>
                  Cargá la cotización (chip arriba)
                </div>
              ) : (
                <div style={{ fontSize: text.sm, color: color.textMuted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                  el cliente paga {formatMoney(totalInPaymentCurrency, "ARS")}
                </div>
              )
            ) : (
              <div style={{ fontSize: text.sm, color: color.textMuted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                el cliente paga {formatMoney(totalInPaymentCurrency, "USD")}
              </div>
            )
          )}
        </div>
      </div>
      </>
      )}
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * SuccessView — pantalla de éxito post-registro
 * ───────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────
 * PaymentMethodCard — card visual de método de pago, muestra total convertido
 * ───────────────────────────────────────────────────────────────────── */
function PaymentMethodCard({
  method,
  amountUsd,
  usdToArs,
  selected,
  onSelect,
}: {
  method: PaymentMethodRow;
  amountUsd: number;
  usdToArs: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const factor = 1 + (method.modifier_pct || 0) / 100;
  let displayAmount: number | null;
  const displayCurrency: "ARS" | "USD" = method.currency;
  if (method.currency === "USD") {
    displayAmount = amountUsd * factor;
  } else {
    displayAmount = usdToArs > 0 ? amountUsd * usdToArs * factor : null;
  }

  const modBadgeColor =
    method.modifier_pct > 0 ? color.warning : method.modifier_pct < 0 ? color.success : color.textMuted;

  return (
    <button
      onClick={onSelect}
      style={{
        position: "relative",
        background: selected ? color.surfaceHover : color.surface,
        border: `1px solid ${selected ? color.primary : color.border}`,
        borderRadius: radius.md,
        padding: space[3],
        cursor: "pointer",
        textAlign: "left",
        transition: "all 100ms",
        boxShadow: selected ? "0 0 0 3px rgba(225, 29, 72, 0.15)" : "none",
        display: "flex",
        flexDirection: "column",
        gap: space[1],
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space[2] }}>
        <span
          style={{
            fontSize: text.xs,
            fontWeight: weight.semibold,
            color: color.text,
            lineHeight: 1.25,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {method.name}
        </span>
        {method.modifier_pct !== 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: weight.bold,
              padding: "1px 5px",
              borderRadius: radius.sm,
              border: `1px solid ${modBadgeColor}`,
              color: modBadgeColor,
              flexShrink: 0,
            }}
          >
            {method.modifier_pct > 0 ? "+" : ""}{method.modifier_pct}%
          </span>
        )}
      </div>
      <div style={{ fontSize: text.sm, fontWeight: weight.bold, color: color.text, fontVariantNumeric: "tabular-nums", marginTop: space[1] }}>
        {displayAmount === null ? (
          <span style={{ color: color.warning, fontSize: 11, fontWeight: weight.medium, fontStyle: "italic" }}>
            Cargá cotización
          </span>
        ) : (
          formatMoney(displayAmount, displayCurrency)
        )}
      </div>
    </button>
  );
}

function SuccessView({
  totalUsd,
  totalInPaymentCurrency,
  currency,
  itemsCount,
  clientName,
  methodName,
}: {
  totalUsd: number;
  totalInPaymentCurrency: number;
  currency: "ARS" | "USD";
  itemsCount: number;
  clientName: string | null;
  methodName: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: `${space[8]} ${space[5]}`,
        textAlign: "center",
        gap: space[3],
        animation: "clozr-success-pop 280ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: color.success,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          marginBottom: space[2],
        }}
      >
        <Check size={32} strokeWidth={3} />
      </div>
      <div style={{ fontSize: text.lg, fontWeight: weight.bold, color: color.text }}>
        Venta registrada
      </div>
      <div style={{ fontSize: text["2xl"] ?? text.xl, fontWeight: weight.bold, color: color.text, fontVariantNumeric: "tabular-nums" }}>
        {formatMoney(totalUsd, "USD")}
      </div>
      {currency === "ARS" && totalInPaymentCurrency > 0 && (
        <div style={{ fontSize: text.sm, color: color.textMuted, fontVariantNumeric: "tabular-nums" }}>
          el cliente pagó {formatMoney(totalInPaymentCurrency, "ARS")}
        </div>
      )}
      <div style={{ fontSize: text.sm, color: color.textMuted }}>
        {itemsCount} {itemsCount === 1 ? "producto" : "productos"}
        {clientName ? ` · ${clientName}` : ""} · {methodName}
      </div>
      <style>{`
        @keyframes clozr-success-pop {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Item row editor — un producto + cantidad + precio + markup feedback
 * ───────────────────────────────────────────────────────────────────── */

function ItemRowEditor({
  item,
  customerType,
  catalog,
  canRemove,
  onRemove,
  onChange,
}: {
  item: ItemDraft;
  customerType: CustomerTypeRow | null;
  catalog: CatalogItemWithImeis[];
  canRemove: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<ItemDraft>) => void;
}) {
  const wasAutoFilled = useRef(true);

  // Precio sugerido USD del catálogo (sin modificador, sin conversión)
  const priceQ = useQuery({
    queryKey: qk.pricing.resolve(item.catalogItem?.id, customerType?.id),
    queryFn: () => {
      if (!item.catalogItem || !customerType) return Promise.resolve({ priceUsd: null, source: "none" as const });
      return pricingDb.resolvePrice(item.catalogItem.id, customerType.id);
    },
    enabled: !!item.catalogItem && !!customerType,
  });

  const suggestedUsd = priceQ.data?.priceUsd ?? null;

  // Auto-fill: cuando aparece sugerido y el usuario no editó, lo seteamos
  useEffect(() => {
    if (suggestedUsd === null) return;
    if (wasAutoFilled.current) {
      onChange({ unitPriceUsdInput: String(Math.round(suggestedUsd * 100) / 100) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedUsd]);

  function handleManualPriceChange(v: string) {
    wasAutoFilled.current = false;
    onChange({ unitPriceUsdInput: v });
  }

  const chargedUsd = parseFloat(item.unitPriceUsdInput) || 0;
  // Markup vs sugerido (en USD, comparación directa)
  let markup: { direction: "above" | "below" | "match"; pct: number; label: string } | null = null;
  if (suggestedUsd !== null && suggestedUsd > 0) {
    const delta = chargedUsd - suggestedUsd;
    const pct = (delta / suggestedUsd) * 100;
    if (Math.abs(pct) < 0.5) {
      markup = { direction: "match", pct: 0, label: "✓ Precio sugerido" };
    } else if (delta > 0) {
      markup = { direction: "above", pct, label: `+${pct.toFixed(1)}%` };
    } else {
      markup = { direction: "below", pct, label: `${pct.toFixed(1)}%` };
    }
  }
  const markupOutOfRange =
    suggestedUsd !== null && suggestedUsd > 0 && Math.abs(chargedUsd - suggestedUsd) / suggestedUsd > 2;

  return (
    <div
      style={{
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: space[3],
      }}
    >
      {/* Producto */}
      {item.outOfStock ? (
        <Input
          value={item.productDescription}
          onChange={(e) => onChange({ productDescription: e.target.value })}
          placeholder='Ej: "iPhone 15 Pro Max 256GB Naranja, IMEI 35XXX"'
        />
      ) : item.catalogItem ? (
        <SelectedCatalogCard
          item={item.catalogItem}
          priceSource={priceQ.data?.source ?? "none"}
          imei={item.imei ?? null}
          onClear={() => onChange({ catalogItem: null, unitPriceUsdInput: "", imei: null })}
        />
      ) : (
        <CatalogPicker
          catalog={catalog}
          onPick={(p) => {
            onChange({ catalogItem: p, unitPriceUsdInput: "" });
          }}
        />
      )}

      <button
        onClick={() =>
          onChange({
            outOfStock: !item.outOfStock,
            catalogItem: null,
            unitPriceUsdInput: "",
            productDescription: "",
          })
        }
        style={{
          marginTop: space[2],
          fontSize: text.xs,
          color: item.outOfStock ? color.warning : color.textMuted,
          textDecoration: "underline",
          background: "transparent",
        }}
      >
        {item.outOfStock ? "← Volver al catálogo" : "Producto no está en el catálogo →"}
      </button>

      {/* Cantidad + precio */}
      {(item.catalogItem || item.outOfStock) && (
        <div
          style={{
            marginTop: space[3],
            display: "grid",
            gridTemplateColumns: "140px 1fr auto",
            gap: space[2],
            alignItems: "flex-start",
          }}
        >
          <div>
            <label style={{ fontSize: text.xs, color: color.textMuted, fontWeight: weight.semibold }}>
              Cantidad
            </label>
            <div style={{ marginTop: 4 }}>
              <Stepper
                value={item.quantity}
                onChange={(n) => onChange({ quantity: n })}
                min={1}
                max={500}
                width={140}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: text.xs, color: color.textMuted, fontWeight: weight.semibold }}>
              Precio unitario
            </label>
            <Input
              type="number"
              step="0.01"
              value={item.unitPriceUsdInput}
              onChange={(e) => handleManualPriceChange(e.target.value)}
              placeholder={suggestedUsd ? `Sugerido: ${suggestedUsd}` : "Ingresá el precio en USD"}
              iconLeft={<span style={{ fontSize: 12, fontWeight: weight.semibold }}>US$</span>}
            />
            {markupOutOfRange && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  fontWeight: weight.semibold,
                  color: color.warning,
                }}
              >
                ⚠ Markup muy alto vs sugerido USD {suggestedUsd}
              </div>
            )}
            {!markupOutOfRange && markup && markup.direction !== "match" && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  fontWeight: weight.semibold,
                  color: markup.direction === "above" ? color.success : color.warning,
                }}
              >
                {markup.direction === "above" ? "✨ " : "▾ "}
                {markup.label} {markup.direction === "above" ? "sobre sugerido" : "vs sugerido"}
              </div>
            )}
            {markup && markup.direction === "match" && (
              <div style={{ marginTop: 4, fontSize: 11, color: color.textMuted }}>
                ✓ Precio sugerido
              </div>
            )}
            {suggestedUsd === null && item.catalogItem && (
              <div style={{ marginTop: 4, fontSize: 11, color: color.textMuted, fontStyle: "italic" }}>
                Sin precio sugerido — ingresalo manual (USD)
              </div>
            )}
          </div>
          {canRemove && (
            <button
              onClick={onRemove}
              aria-label="Eliminar item"
              title="Eliminar item"
              style={{
                marginTop: 18,
                width: 32,
                height: 32,
                borderRadius: radius.sm,
                color: color.textMuted,
                background: "transparent",
                border: `1px solid ${color.border}`,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      {/* Subtotal del item si > 1 cantidad */}
      {item.quantity > 1 && (parseFloat(item.unitPriceUsdInput) || 0) > 0 && (
        <div
          style={{
            marginTop: space[2],
            fontSize: text.xs,
            color: color.textMuted,
            textAlign: "right",
          }}
        >
          Subtotal: {formatMoney(item.quantity * (parseFloat(item.unitPriceUsdInput) || 0), "USD")}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Client picker + inline create
 * ───────────────────────────────────────────────────────────────────── */

function ClientPicker({
  search,
  setSearch,
  results,
  onPick,
  onCreateNew,
}: {
  search: string;
  setSearch: (s: string) => void;
  results: Client[];
  onPick: (c: Client) => void;
  onCreateNew: () => void;
}) {
  return (
    <>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar cliente por nombre o teléfono…"
        iconLeft={<Search size={14} />}
      />
      {results.length > 0 && (
        <div
          style={{
            marginTop: space[2],
            background: color.surface2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            overflow: "hidden",
          }}
        >
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: space[3],
                padding: `${space[2]} ${space[3]}`,
                textAlign: "left",
                color: color.text,
                fontSize: text.sm,
                borderBottom: `1px solid ${color.border}`,
              }}
            >
              <Avatar name={c.name} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: weight.semibold }}>{c.name}</div>
                <div style={{ fontSize: text.xs, color: color.textMuted }}>
                  {c.phone ?? "—"} · {c.type}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={onCreateNew}
        style={{
          marginTop: space[2],
          display: "inline-flex",
          alignItems: "center",
          gap: space[1],
          fontSize: text.xs,
          color: color.primary,
          background: "transparent",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        <UserPlus size={12} />
        {search.trim() ? `Crear "${search}" como cliente nuevo` : "Crear cliente nuevo"}
      </button>
    </>
  );
}

function InlineCreateClient({
  wid,
  initialName,
  customerTypes,
  onCancel,
  onCreated,
}: {
  wid: string;
  initialName: string;
  customerTypes: CustomerTypeRow[];
  onCancel: () => void;
  onCreated: (c: Client) => void;
}) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [type, setType] = useState(customerTypes[0]?.name.toLowerCase() ?? "final");

  const mut = useMutation({
    mutationFn: async () => {
      return customersDb.create(wid, {
        name: name.trim(),
        phone: phone.trim() || null,
        type,
        status: "potencial",
      });
    },
    onSuccess: (row) => {
      invalidate.afterClientChange(qc);
      showToast(`Cliente "${row.name}" creado`, "success");
      onCreated({
        id: row.id,
        name: row.name,
        phone: row.phone ?? undefined,
        email: row.email ?? undefined,
        type: row.type as Client["type"],
        status: "new",
        notes: row.notes ?? undefined,
        createdAt: row.created_at,
      });
    },
  });

  return (
    <div
      style={{
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: space[3],
        display: "flex",
        flexDirection: "column",
        gap: space[2],
      }}
    >
      <div style={{ fontSize: text.xs, fontWeight: weight.semibold, color: color.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>
        Nuevo cliente
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre"
        autoFocus
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space[2] }}>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Teléfono (opcional)"
        />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          {customerTypes.length === 0 ? (
            <option value="final">Final</option>
          ) : (
            customerTypes.map((t) => (
              <option key={t.id} value={t.name.toLowerCase()}>
                {t.name}
              </option>
            ))
          )}
        </Select>
      </div>
      <div style={{ display: "flex", gap: space[2], justifyContent: "flex-end" }}>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => mut.mutate()}
          loading={mut.isPending}
          disabled={name.trim().length < 2}
        >
          Crear y usar
        </Button>
      </div>
    </div>
  );
}

function SelectedClientCard({
  client,
  customerType,
  onClear,
}: {
  client: Client;
  customerType: CustomerTypeRow | null;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[3],
        padding: space[3],
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
      }}
    >
      <Avatar name={client.name} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
          {client.name}
        </div>
        <div style={{ fontSize: text.xs, color: color.textMuted }}>
          {client.phone ?? "—"}
          {customerType && (
            <>
              {" · "}
              <Badge tone="info">{customerType.name}</Badge>
            </>
          )}
        </div>
      </div>
      <button onClick={onClear} style={{ color: color.textMuted, fontSize: text.xs }}>
        Cambiar
      </button>
    </div>
  );
}

function CatalogPicker({
  catalog,
  onPick,
}: {
  catalog: CatalogItemWithImeis[];
  onPick: (p: CatalogItem) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string>("__all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalog) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [catalog]);

  const filtered = useMemo(() => {
    if (activeCategory === "__all") return catalog;
    return catalog.filter((p) => (p.category ?? "") === activeCategory);
  }, [catalog, activeCategory]);

  if (catalog.length === 0) {
    return (
      <div
        style={{
          padding: space[5],
          textAlign: "center",
          background: color.surface2,
          border: `1px dashed ${color.border}`,
          borderRadius: radius.md,
          color: color.textMuted,
          fontSize: text.sm,
        }}
      >
        Catálogo vacío. Cargá productos desde Inventario.
      </div>
    );
  }

  return (
    <div>
      {/* Chips de categoría */}
      {categories.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: space[1],
            marginBottom: space[3],
          }}
        >
          <CategoryChip
            label="Todos"
            active={activeCategory === "__all"}
            onClick={() => setActiveCategory("__all")}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c}
              label={c}
              active={activeCategory === c}
              onClick={() => setActiveCategory(c)}
            />
          ))}
        </div>
      )}

      {/* Grilla de productos */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: space[2],
          maxHeight: 320,
          overflowY: "auto",
          padding: 2,
        }}
      >
        {filtered.map((p) => {
          const img = getTemplateImageUrl(p.image_path ?? null);
          const units = p.track_stock ? (p.available_imeis ?? 0) : (p.stock ?? 0);
          const outOfStock = units <= 0;
          return (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              style={{
                position: "relative",
                background: color.surface,
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
                padding: space[2],
                cursor: "pointer",
                textAlign: "center",
                transition: "all 100ms",
                opacity: outOfStock ? 0.55 : 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = color.primary;
                e.currentTarget.style.background = color.surfaceHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = color.border;
                e.currentTarget.style.background = color.surface;
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: 70,
                  background: color.surface2,
                  borderRadius: radius.sm,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {img ? (
                  <img src={img} alt={p.name} style={{ maxWidth: "85%", maxHeight: 60, objectFit: "contain" }} />
                ) : (
                  <span style={{ fontSize: 24, color: color.textDim }}>📦</span>
                )}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: weight.semibold,
                  color: color.text,
                  marginTop: 4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  lineHeight: 1.25,
                  minHeight: 30,
                }}
              >
                {p.name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: outOfStock ? color.warning : color.success,
                  fontWeight: weight.semibold,
                }}
              >
                {outOfStock ? "Sin stock" : `${units} ${units === 1 ? "unidad" : "unidades"}`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: `4px ${space[3]}`,
        borderRadius: radius.full,
        border: `1px solid ${active ? color.primary : color.border}`,
        background: active ? color.primary : "transparent",
        color: active ? "#fff" : color.text,
        fontSize: 11,
        fontWeight: weight.semibold,
        cursor: "pointer",
        transition: "all 100ms",
      }}
    >
      {label}
    </button>
  );
}

function SelectedCatalogCard({
  item,
  priceSource,
  imei,
  onClear,
}: {
  item: CatalogItem;
  priceSource: "stock-override" | "catalog" | "none";
  imei: string | null;
  onClear: () => void;
}) {
  const img = getTemplateImageUrl(item.image_path ?? null);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[3],
        padding: space[2],
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
      }}
    >
      {img ? (
        <img src={img} alt={item.name} width={40} height={40} style={{ objectFit: "contain", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 40, height: 40, background: color.surface2, borderRadius: radius.sm, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text, display: "flex", alignItems: "center", gap: space[2] }}>
          {item.name}
          {imei && <Badge tone="success">unidad #{imei.slice(-6)}</Badge>}
        </div>
        <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
          {item.category ?? "—"}
          {priceSource === "catalog" && " · precio del catálogo"}
          {priceSource === "stock-override" && " · precio override"}
          {priceSource === "none" && " · sin precio cargado"}
          {imei && ` · IMEI ${imei}`}
        </div>
      </div>
      <button onClick={onClear} style={{ color: color.textMuted, fontSize: text.xs }}>
        Cambiar
      </button>
    </div>
  );
}
