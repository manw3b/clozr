import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Modal, ModalField } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { Input, Select } from "../../../components/Input";
import { Avatar } from "../../../components/Avatar";
import { Badge } from "../../../components/Badge";
import { color, radius, space, text, weight } from "../../../tokens";
import { formatMoney } from "../../../lib/format";
import { computeSuggestedPrice, compareToSuggested } from "../../../lib/pricing";
import { useClientsList } from "../../clientes/useClientsData";
import { paymentMethodsDb } from "../../../lib/db/paymentMethods";
import { ensurePricingSchema } from "../../../lib/db/ensureSchema";
import { settingsDb } from "../../../lib/db/settings";
import { catalogDb } from "../../../lib/db/catalog";
import { pricingDb } from "../../../lib/db/pricing";
import { useWorkspaceStore } from "../../../store/workspaceStore";
import { useExchangeRateStore } from "../../../store/exchangeRateStore";
import type { Client } from "../../../types/domain";
import type { CatalogItem, CustomerTypeRow, PaymentMethodRow } from "../../../lib/db/types";

export interface NewSalePayload {
  clientId: string | null;
  clientName: string | null;
  customerTypeId: string | null;
  catalogItemId: string | null;
  productDescription: string;
  amount: number;
  currency: "ARS" | "USD";
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodKind: string;
  outOfStock: boolean;
}

interface NewSaleModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NewSalePayload) => void;
}

export function NewSaleModal({ open, onClose, onSubmit }: NewSaleModalProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const { usdToArs } = useExchangeRateStore();
  const wid = activeWorkspace?.id ?? "";

  const [clientSearch, setClientSearch] = useState("");
  const [client, setClient] = useState<Client | null>(null);

  const [productSearch, setProductSearch] = useState("");
  const [catalogItem, setCatalogItem] = useState<CatalogItem | null>(null);
  const [productDescription, setProductDescription] = useState("");
  const [outOfStock, setOutOfStock] = useState(false);

  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amountInput, setAmountInput] = useState("");

  const { data: allClients = [] } = useClientsList();

  const customerTypesQ = useQuery({
    queryKey: ["customer-types", wid],
    queryFn: () => settingsDb.getCustomerTypes(wid),
    enabled: open && !!wid,
  });

  const paymentsQ = useQuery({
    queryKey: ["payment-methods-active", wid],
    queryFn: () => paymentMethodsDb.getActive(wid),
    enabled: open && !!wid,
  });

  // Auto-seed métodos por default si el workspace nunca los tuvo
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
    queryKey: ["catalog-items-search", wid],
    queryFn: () => catalogDb.getAll(wid),
    enabled: open && !!wid && !outOfStock,
  });

  function reset() {
    setClientSearch("");
    setClient(null);
    setProductSearch("");
    setCatalogItem(null);
    setProductDescription("");
    setOutOfStock(false);
    setPaymentMethodId("");
    setAmountInput("");
  }

  // Auto-pick first payment method when modal opens
  useEffect(() => {
    if (open && paymentsQ.data && paymentsQ.data.length > 0 && !paymentMethodId) {
      setPaymentMethodId(paymentsQ.data[0].id);
    }
  }, [open, paymentsQ.data, paymentMethodId]);

  const customerTypes = customerTypesQ.data ?? [];
  const customerType: CustomerTypeRow | null = useMemo(() => {
    if (!client) return customerTypes[0] ?? null;
    // client.type es el slug ("final", "revendedor", etc.) — match contra customer_types.name lowercased
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

  // Resolve catalog price
  const priceQ = useQuery({
    queryKey: ["resolve-price", catalogItem?.id, customerType?.id],
    queryFn: () => {
      if (!catalogItem || !customerType) return Promise.resolve({ priceUsd: null, source: "none" as const });
      return pricingDb.resolvePrice(catalogItem.id, customerType.id);
    },
    enabled: !!catalogItem && !!customerType,
  });

  const basePriceUsd = priceQ.data?.priceUsd ?? null;
  const breakdown = useMemo(() => {
    if (basePriceUsd === null || !paymentMethod) return null;
    return computeSuggestedPrice({
      basePriceUsd,
      usdToArs: usdToArs || 1,
      modifierPct: paymentMethod.modifier_pct,
      currency: paymentMethod.currency,
    });
  }, [basePriceUsd, paymentMethod, usdToArs]);

  // Auto-fill amount when breakdown changes
  useEffect(() => {
    if (breakdown && amountInput === "") {
      setAmountInput(String(Math.round(breakdown.suggested * 100) / 100));
    }
  }, [breakdown, amountInput]);

  const charged = parseFloat(amountInput) || 0;
  const markup = breakdown ? compareToSuggested(charged, breakdown.suggested) : null;

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

  const filteredCatalog = useMemo(() => {
    if (!catalogQ.data) return [];
    if (!productSearch.trim()) return catalogQ.data.slice(0, 5);
    const q = productSearch.toLowerCase();
    return catalogQ.data.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5);
  }, [catalogQ.data, productSearch]);

  const canSubmit =
    !!paymentMethod &&
    charged > 0 &&
    (outOfStock ? productDescription.trim().length >= 2 : !!catalogItem);

  function handleSubmit() {
    if (!canSubmit || !paymentMethod) return;
    onSubmit({
      clientId: client?.id ?? null,
      clientName: client?.name ?? null,
      customerTypeId: customerType?.id ?? null,
      catalogItemId: outOfStock ? null : catalogItem?.id ?? null,
      productDescription: outOfStock
        ? productDescription.trim()
        : catalogItem?.name ?? "Producto",
      amount: charged,
      currency: paymentMethod.currency,
      paymentMethodId: paymentMethod.id,
      paymentMethodName: paymentMethod.name,
      paymentMethodKind: paymentMethod.kind,
      outOfStock,
    });
    reset();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Nueva venta"
      subtitle={outOfStock ? "Venta fuera de stock — quedará pendiente de regularizar" : "Registrá una venta del catálogo"}
      maxWidth={600}
      footer={
        <>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {outOfStock ? "Registrar fuera de stock" : "Registrar venta"}
          </Button>
        </>
      }
    >
      {/* CLIENTE */}
      <ModalField label="Cliente" hint="Opcional — para venta de mostrador podés dejarlo vacío">
        {client ? (
          <SelectedClientCard
            client={client}
            customerType={customerType}
            onClear={() => setClient(null)}
          />
        ) : (
          <ClientPicker
            search={clientSearch}
            setSearch={setClientSearch}
            results={filteredClients}
            onPick={setClient}
          />
        )}
      </ModalField>

      {/* PRODUCTO */}
      <ModalField label={outOfStock ? "Descripción del producto" : "Producto"} required>
        {outOfStock ? (
          <Input
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            placeholder='Ej: "iPhone 15 Pro Max 256GB Naranja, IMEI 35XXX"'
          />
        ) : catalogItem ? (
          <SelectedCatalogCard
            item={catalogItem}
            priceSource={priceQ.data?.source ?? "none"}
            onClear={() => { setCatalogItem(null); setAmountInput(""); }}
          />
        ) : (
          <CatalogPicker
            search={productSearch}
            setSearch={setProductSearch}
            results={filteredCatalog}
            onPick={(p) => { setCatalogItem(p); setAmountInput(""); }}
          />
        )}
        <button
          onClick={() => { setOutOfStock(!outOfStock); setCatalogItem(null); setAmountInput(""); }}
          style={{
            marginTop: space[2],
            fontSize: text.xs,
            color: outOfStock ? color.warning : color.textMuted,
            textDecoration: "underline",
          }}
        >
          {outOfStock ? "← Volver al catálogo" : "Producto no está en el catálogo →"}
        </button>
      </ModalField>

      {/* MÉTODO DE PAGO */}
      <ModalField label="Método de pago" required>
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
          <Select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {(paymentsQ.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.currency})
                {p.modifier_pct !== 0 ? ` · ${p.modifier_pct > 0 ? "+" : ""}${p.modifier_pct}%` : ""}
              </option>
            ))}
          </Select>
        )}
      </ModalField>

      {/* PRECIO BREAKDOWN */}
      {breakdown && (
        <div
          style={{
            background: color.surface2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            padding: space[3],
            marginBottom: space[4],
            fontSize: text.sm,
          }}
        >
          <Row label={`Precio sugerido (${customerType?.name ?? "Final"})`} value={`USD ${basePriceUsd}`} />
          {breakdown.modifierLabel !== "—" && (
            <Row
              label={`Modificador ${paymentMethod?.name ?? ""}`}
              value={breakdown.modifierLabel}
              tone={paymentMethod && paymentMethod.modifier_pct > 0 ? "warning" : "success"}
            />
          )}
          <div style={{ height: 1, background: color.border, margin: `${space[2]} 0` }} />
          <Row
            label={<strong style={{ color: color.text }}>Sugerido en {breakdown.currency}</strong>}
            value={
              <strong style={{ color: color.text }}>
                {formatMoney(breakdown.suggested, breakdown.currency)}
              </strong>
            }
          />
        </div>
      )}

      {!breakdown && catalogItem && paymentMethod && (
        <div
          style={{
            marginBottom: space[3],
            fontSize: text.xs,
            color: color.textMuted,
            fontStyle: "italic",
          }}
        >
          Sin precio sugerido cargado para este producto. Ingresá el monto a mano (lo guardamos para la próxima desde Ajustes → Precios).
        </div>
      )}

      {/* MONTO A COBRAR */}
      <ModalField label={`Monto a cobrar (${paymentMethod?.currency ?? "ARS"})`} required>
        <Input
          type="number"
          step="0.01"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          placeholder="0"
        />
        {markup && markup.direction !== "match" && (
          <div
            style={{
              marginTop: 6,
              fontSize: text.xs,
              fontWeight: weight.semibold,
              color: markup.direction === "above" ? color.success : color.warning,
            }}
          >
            {markup.direction === "above" ? "✨ " : "▾ "}
            {markup.label} {markup.direction === "above" ? "sobre sugerido" : "vs sugerido"}
          </div>
        )}
        {markup && markup.direction === "match" && breakdown && (
          <div
            style={{
              marginTop: 6,
              fontSize: text.xs,
              color: color.textMuted,
            }}
          >
            ✓ Precio sugerido
          </div>
        )}
      </ModalField>
    </Modal>
  );
}

function Row({ label, value, tone }: { label: React.ReactNode; value: React.ReactNode; tone?: "success" | "warning" }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "3px 0",
        color: color.textMuted,
      }}
    >
      <span>{label}</span>
      <span style={{ color: tone === "success" ? color.success : tone === "warning" ? color.warning : color.text }}>
        {value}
      </span>
    </div>
  );
}

function ClientPicker({
  search,
  setSearch,
  results,
  onPick,
}: {
  search: string;
  setSearch: (s: string) => void;
  results: Client[];
  onPick: (c: Client) => void;
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
      {search.trim() && results.length === 0 && (
        <div style={{ marginTop: space[2], fontSize: text.xs, color: color.textMuted }}>
          Sin resultados — la venta se puede registrar sin cliente
        </div>
      )}
    </>
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
  search,
  setSearch,
  results,
  onPick,
}: {
  search: string;
  setSearch: (s: string) => void;
  results: CatalogItem[];
  onPick: (item: CatalogItem) => void;
}) {
  return (
    <>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar producto del catálogo…"
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
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: weight.semibold }}>{p.name}</div>
                {p.category && (
                  <div style={{ fontSize: text.xs, color: color.textMuted }}>{p.category}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function SelectedCatalogCard({
  item,
  priceSource,
  onClear,
}: {
  item: CatalogItem;
  priceSource: "stock-override" | "catalog" | "none";
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
          {item.name}
        </div>
        <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
          {item.category ?? "—"}
          {priceSource === "catalog" && " · precio del catálogo"}
          {priceSource === "stock-override" && " · precio override"}
          {priceSource === "none" && " · sin precio cargado"}
        </div>
      </div>
      <button onClick={onClear} style={{ color: color.textMuted, fontSize: text.xs }}>
        Cambiar
      </button>
    </div>
  );
}
