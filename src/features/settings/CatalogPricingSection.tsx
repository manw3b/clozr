import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, DollarSign } from "lucide-react";
import { Modal, ModalField } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { EmptyState } from "../../components/EmptyState";
import { catalogDb } from "../../lib/db/catalog";
import { settingsDb } from "../../lib/db/settings";
import { pricingDb } from "../../lib/db/pricing";
import { useUIStore } from "../../store/uiStore";
import { useExchangeRateStore } from "../../store/exchangeRateStore";
import { useAuthStore, canEditPricing, assertCan } from "../../store/authStore";
import { color, radius, space, text, weight } from "../../tokens";
import { formatMoney } from "../../lib/format";
import { qk } from "../../lib/queryKeys";
import type { CatalogItemWithImeis, CustomerTypeRow } from "../../lib/db/types";

export function CatalogPricingSection({ wid }: { wid: string }) {
  const role = useAuthStore((s) => s.userRole);
  const allowed = canEditPricing(role);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CatalogItemWithImeis | null>(null);

  const itemsQ = useQuery({
    queryKey: qk.pricing.catalogList(wid),
    queryFn: () => catalogDb.getAll(wid),
    enabled: !!wid && allowed,
  });

  const filtered = useMemo(() => {
    const all = itemsQ.data ?? [];
    if (!search.trim()) return all.slice(0, 50);
    const q = search.toLowerCase();
    return all.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 50);
  }, [itemsQ.data, search]);

  if (!allowed) {
    return (
      <EmptyState
        title="Sin permisos"
        description="Solo el owner o admin pueden editar precios del catálogo."
      />
    );
  }

  return (
    <div>
      <header style={{ marginBottom: space[5] }}>
        <h2 style={{ margin: 0, fontSize: text.lg, fontWeight: weight.bold, color: color.text, letterSpacing: "-0.2px" }}>
          Precios del catálogo
        </h2>
        <p style={{ margin: 0, marginTop: 4, fontSize: text.sm, color: color.textMuted }}>
          Costo (USD) + precio sugerido por tipo de cliente. Estos valores son la base que después
          se ajusta con el modificador del método de pago al vender.
        </p>
      </header>

      <div style={{ marginBottom: space[3] }}>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto…"
          iconLeft={<Search size={14} />}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search.trim() ? "Sin resultados" : "Sin productos en el catálogo"}
          description={search.trim() ? "Probá otro término" : "Agregá productos desde Inventario."}
        />
      ) : (
        <div style={{ background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.lg, overflow: "hidden" }}>
          {filtered.map((p) => (
            <CatalogPriceRow key={p.id} item={p} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}

      <PricingModal
        open={!!editing}
        onClose={() => setEditing(null)}
        item={editing}
        wid={wid}
      />
    </div>
  );
}

function CatalogPriceRow({
  item,
  onEdit,
}: {
  item: CatalogItemWithImeis;
  onEdit: () => void;
}) {
  return (
    <button
      onClick={onEdit}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: space[3],
        padding: `${space[3]} ${space[4]}`,
        borderBottom: `1px solid ${color.border}`,
        textAlign: "left",
        background: "transparent",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
          {item.name}
        </div>
        <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
          {item.category ?? "—"}
          {item.cost_usd && item.cost_usd > 0 ? ` · costo USD ${item.cost_usd}` : " · sin costo cargado"}
        </div>
      </div>
      <DollarSign size={14} color={color.textMuted} />
    </button>
  );
}

function PricingModal({
  open,
  onClose,
  item,
  wid,
}: {
  open: boolean;
  onClose: () => void;
  item: CatalogItemWithImeis | null;
  wid: string;
}) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const { usdToArs } = useExchangeRateStore();
  const role = useAuthStore((s) => s.userRole);

  const [cost, setCost] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});

  const typesQ = useQuery({
    queryKey: qk.customerTypes.list(wid),
    queryFn: () => settingsDb.getCustomerTypes(wid),
    enabled: open && !!wid,
  });

  const existingQ = useQuery({
    queryKey: qk.pricing.forItem(item?.id),
    queryFn: () => (item ? pricingDb.getCatalogPrices(item.id) : Promise.resolve([])),
    enabled: open && !!item,
  });

  useEffect(() => {
    if (!open || !item) return;
    setCost(item.cost_usd ? String(item.cost_usd) : "");
    const map: Record<string, string> = {};
    (existingQ.data ?? []).forEach((p) => {
      map[p.customer_type_id] = String(p.price_usd);
    });
    setPrices(map);
  }, [open, item, existingQ.data]);

  const types = typesQ.data ?? [];

  const mut = useMutation({
    mutationFn: async () => {
      if (!item) return;
      assertCan(role, "editPricing");
      const costNum = parseFloat(cost) || 0;
      await pricingDb.setCatalogCost(item.id, costNum);
      for (const t of types) {
        const v = prices[t.id];
        if (v === undefined || v === "") continue;
        const num = parseFloat(v);
        if (Number.isFinite(num) && num > 0) {
          await pricingDb.setCatalogPrice(item.id, t.id, num);
        } else {
          await pricingDb.removeCatalogPrice(item.id, t.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pricing.catalogListAll() });
      qc.invalidateQueries({ queryKey: qk.pricing.forItemAll() });
      qc.invalidateQueries({ queryKey: qk.pricing.resolveAll() });
      showToast("Precios guardados", "success");
      onClose();
    },
  });

  // Sucio si cost o prices difieren de los originales
  const isDirty = () => {
    if (!item) return false;
    const originalCost = item.cost_usd ? String(item.cost_usd) : "";
    if (cost !== originalCost) return true;
    const originalMap: Record<string, string> = {};
    for (const p of existingQ.data ?? []) {
      originalMap[p.customer_type_id] = String(p.price_usd);
    }
    for (const t of types) {
      const draft = prices[t.id] ?? "";
      const orig = originalMap[t.id] ?? "";
      if (draft !== orig) return true;
    }
    return false;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar los cambios de precio?"
      title={item?.name ?? ""}
      subtitle="Precios en USD. Se convierten a ARS con la cotización vigente."
      maxWidth={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => mut.mutate()} loading={mut.isPending}>
            Guardar precios
          </Button>
        </>
      }
    >
      <ModalField label="Costo (USD)" hint="Lo que pagaste por el producto. Sirve para calcular ganancia.">
        <Input
          type="number"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="0"
        />
      </ModalField>

      <div style={{ marginTop: space[5], marginBottom: space[2], fontSize: text.xs, fontWeight: weight.semibold, color: color.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>
        Precios sugeridos por tipo de cliente
      </div>

      {types.length === 0 ? (
        <p style={{ fontSize: text.sm, color: color.textMuted }}>
          Definí tipos de cliente primero en Ajustes → Tipos de cliente.
        </p>
      ) : (
        types.map((t) => (
          <PriceRow
            key={t.id}
            type={t}
            value={prices[t.id] ?? ""}
            costUsd={parseFloat(cost) || 0}
            usdToArs={usdToArs}
            onChange={(v) => setPrices((p) => ({ ...p, [t.id]: v }))}
          />
        ))
      )}
    </Modal>
  );
}

function PriceRow({
  type,
  value,
  costUsd,
  usdToArs,
  onChange,
}: {
  type: CustomerTypeRow;
  value: string;
  costUsd: number;
  usdToArs: number;
  onChange: (v: string) => void;
}) {
  const priceUsd = parseFloat(value) || 0;
  const margin = priceUsd > 0 && costUsd > 0 ? ((priceUsd - costUsd) / costUsd) * 100 : null;
  const ars = priceUsd > 0 && usdToArs > 0 ? priceUsd * usdToArs : null;

  return (
    <div style={{ marginBottom: space[3] }}>
      <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
        <span style={{ flex: "0 0 130px", fontSize: text.sm, fontWeight: weight.medium, color: color.text }}>
          {type.name}
        </span>
        <Input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="USD"
        />
      </div>
      {(ars !== null || margin !== null) && (
        <div style={{ marginTop: 4, marginLeft: 142, fontSize: text.xs, color: color.textMuted, display: "flex", gap: space[3] }}>
          {ars !== null && <span>≈ {formatMoney(ars)}</span>}
          {margin !== null && (
            <span style={{ color: margin > 0 ? color.success : color.danger, fontWeight: weight.semibold }}>
              {margin > 0 ? "+" : ""}{margin.toFixed(1)}% margen
            </span>
          )}
        </div>
      )}
    </div>
  );
}
