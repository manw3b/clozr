import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Trash2, UserPlus } from "lucide-react";
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
import { customersDb } from "../../../lib/db/customers";
import { settingsDb } from "../../../lib/db/settings";
import { catalogDb } from "../../../lib/db/catalog";
import { pricingDb } from "../../../lib/db/pricing";
import { useWorkspaceStore } from "../../../store/workspaceStore";
import { useExchangeRateStore } from "../../../store/exchangeRateStore";
import { useUIStore } from "../../../store/uiStore";
import { ensurePricingSchema } from "../../../lib/db/ensureSchema";
import type { Client } from "../../../types/domain";
import type { CatalogItem, CustomerTypeRow, PaymentMethodRow } from "../../../lib/db/types";
import { getTemplateImageUrl } from "../../../lib/templates/productImageMap";

export interface NewSaleItem {
  catalogItemId: string | null;
  productDescription: string;
  quantity: number;
  unitPrice: number;
}

export interface NewSalePayload {
  clientId: string | null;
  clientName: string | null;
  customerTypeId: string | null;
  items: NewSaleItem[];
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

interface ItemDraft {
  key: string;
  catalogItem: CatalogItem | null;
  productDescription: string;
  outOfStock: boolean;
  quantity: number;
  unitPriceInput: string; // string para no perder lo que el usuario tipea
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
    unitPriceInput: "",
  };
}

export function NewSaleModal({ open, onClose, onSubmit }: NewSaleModalProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const { usdToArs } = useExchangeRateStore();
  const wid = activeWorkspace?.id ?? "";

  const [clientSearch, setClientSearch] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);

  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [paymentMethodId, setPaymentMethodId] = useState("");

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
    queryKey: ["catalog-items-search", wid],
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

  // Auto-pick first payment method
  useEffect(() => {
    if (open && paymentsQ.data && paymentsQ.data.length > 0 && !paymentMethodId) {
      setPaymentMethodId(paymentsQ.data[0].id);
    }
  }, [open, paymentsQ.data, paymentMethodId]);

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

  // Total = suma de items
  const total = items.reduce((s, it) => {
    const price = parseFloat(it.unitPriceInput) || 0;
    return s + price * (it.quantity || 0);
  }, 0);

  const hasOutOfStock = items.some((it) => it.outOfStock);

  // Validación: cada item necesita catálogo o descripción + monto > 0 + cantidad > 0
  const itemsValid =
    items.length > 0 &&
    items.every(
      (it) =>
        it.quantity > 0 &&
        (parseFloat(it.unitPriceInput) || 0) > 0 &&
        (it.outOfStock ? it.productDescription.trim().length >= 2 : !!it.catalogItem),
    );

  const canSubmit = !!paymentMethod && itemsValid;

  function handleSubmit() {
    if (!canSubmit || !paymentMethod) return;
    onSubmit({
      clientId: client?.id ?? null,
      clientName: client?.name ?? null,
      customerTypeId: customerType?.id ?? null,
      items: items.map((it) => ({
        catalogItemId: it.outOfStock ? null : it.catalogItem?.id ?? null,
        productDescription: it.outOfStock
          ? it.productDescription.trim()
          : it.catalogItem?.name ?? "Producto",
        quantity: it.quantity,
        unitPrice: parseFloat(it.unitPriceInput) || 0,
      })),
      currency: paymentMethod.currency,
      paymentMethodId: paymentMethod.id,
      paymentMethodName: paymentMethod.name,
      paymentMethodKind: paymentMethod.kind,
      outOfStock: hasOutOfStock,
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
      subtitle={
        items.length > 1
          ? `${items.length} productos · ${formatMoney(total, paymentMethod?.currency ?? "ARS")}`
          : "Registrá una venta del catálogo"
      }
      maxWidth={680}
      footer={
        <>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {hasOutOfStock ? "Registrar fuera de stock" : "Registrar venta"} · {formatMoney(total, paymentMethod?.currency ?? "ARS")}
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
            paymentMethod={paymentMethod}
            usdToArs={usdToArs}
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

      {/* TOTAL */}
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
        <span style={{ fontSize: text.sm, color: color.textMuted, fontWeight: weight.medium }}>
          Total a cobrar
        </span>
        <span style={{ fontSize: text.lg, fontWeight: weight.bold, color: color.text }}>
          {formatMoney(total, paymentMethod?.currency ?? "ARS")}
        </span>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Item row editor — un producto + cantidad + precio + markup feedback
 * ───────────────────────────────────────────────────────────────────── */

function ItemRowEditor({
  item,
  customerType,
  paymentMethod,
  usdToArs,
  catalog,
  canRemove,
  onRemove,
  onChange,
}: {
  item: ItemDraft;
  customerType: CustomerTypeRow | null;
  paymentMethod: PaymentMethodRow | null;
  usdToArs: number;
  catalog: CatalogItem[];
  canRemove: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<ItemDraft>) => void;
}) {
  const [search, setSearch] = useState("");

  // Precio sugerido USD para este item
  const priceQ = useQuery({
    queryKey: ["resolve-price", item.catalogItem?.id, customerType?.id],
    queryFn: () => {
      if (!item.catalogItem || !customerType) return Promise.resolve({ priceUsd: null, source: "none" as const });
      return pricingDb.resolvePrice(item.catalogItem.id, customerType.id);
    },
    enabled: !!item.catalogItem && !!customerType,
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

  // Auto-fill precio cuando cambia el catalogItem o el método
  useEffect(() => {
    if (breakdown && !item.unitPriceInput) {
      onChange({ unitPriceInput: String(Math.round(breakdown.suggested * 100) / 100) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown?.suggested]);

  const charged = parseFloat(item.unitPriceInput) || 0;
  const markup = breakdown ? compareToSuggested(charged, breakdown.suggested) : null;

  const filtered = useMemo(() => {
    if (!search.trim()) return catalog.slice(0, 5);
    const q = search.toLowerCase();
    return catalog.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5);
  }, [catalog, search]);

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
          onClear={() => onChange({ catalogItem: null, unitPriceInput: "" })}
        />
      ) : (
        <CatalogPicker
          search={search}
          setSearch={setSearch}
          results={filtered}
          onPick={(p) => {
            onChange({ catalogItem: p, unitPriceInput: "" });
            setSearch("");
          }}
        />
      )}

      <button
        onClick={() =>
          onChange({
            outOfStock: !item.outOfStock,
            catalogItem: null,
            unitPriceInput: "",
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
            gridTemplateColumns: "100px 1fr auto",
            gap: space[2],
            alignItems: "flex-start",
          }}
        >
          <div>
            <label style={{ fontSize: text.xs, color: color.textMuted, fontWeight: weight.semibold }}>
              Cantidad
            </label>
            <Input
              type="number"
              min="1"
              step="1"
              value={String(item.quantity)}
              onChange={(e) => onChange({ quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
          </div>
          <div>
            <label style={{ fontSize: text.xs, color: color.textMuted, fontWeight: weight.semibold }}>
              Precio unitario ({paymentMethod?.currency ?? "ARS"})
            </label>
            <Input
              type="number"
              step="0.01"
              value={item.unitPriceInput}
              onChange={(e) => onChange({ unitPriceInput: e.target.value })}
              placeholder="0"
            />
            {markup && markup.direction !== "match" && (
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
            {!breakdown && item.catalogItem && paymentMethod && (
              <div style={{ marginTop: 4, fontSize: 11, color: color.textMuted, fontStyle: "italic" }}>
                Sin precio sugerido — ingresalo manual
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
      {item.quantity > 1 && (parseFloat(item.unitPriceInput) || 0) > 0 && (
        <div
          style={{
            marginTop: space[2],
            fontSize: text.xs,
            color: color.textMuted,
            textAlign: "right",
          }}
        >
          Subtotal: {formatMoney(item.quantity * (parseFloat(item.unitPriceInput) || 0), paymentMethod?.currency ?? "ARS")}
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
      qc.invalidateQueries({ queryKey: ["clients-list"] });
      qc.invalidateQueries({ queryKey: ["clients", wid] });
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
  search,
  setSearch,
  results,
  onPick,
}: {
  search: string;
  setSearch: (s: string) => void;
  results: CatalogItem[];
  onPick: (p: CatalogItem) => void;
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
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            overflow: "hidden",
          }}
        >
          {results.map((p) => {
            const img = getTemplateImageUrl(p.image_path ?? null);
            return (
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
                {img && (
                  <img src={img} alt={p.name} width={32} height={32} style={{ objectFit: "contain", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: weight.semibold }}>{p.name}</div>
                  {p.category && (
                    <div style={{ fontSize: text.xs, color: color.textMuted }}>{p.category}</div>
                  )}
                </div>
              </button>
            );
          })}
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
