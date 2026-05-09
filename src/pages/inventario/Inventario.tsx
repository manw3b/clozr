import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Package, Plus, Zap } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Card, MetricCard } from "../../components/Card";
import { Tabs } from "../../components/Tabs";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { catalogDb } from "../../lib/db/catalog";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { color, space, text, weight } from "../../tokens";
import { formatMoney } from "../../lib/format";
import { resolveImageUrl } from "../../lib/images";
import { getTemplateImageUrl } from "../../lib/templates/productImageMap";
import { useEffect } from "react";
import type { CatalogItemWithImeis } from "../../lib/db/types";
import { ProductDetailDrawer } from "./components/ProductDetailDrawer";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuLabel,
  useContextMenu,
} from "../../components/ContextMenu";
import { Eye, Copy } from "lucide-react";
import { AddProductSimpleModal } from "./components/AddProductSimpleModal";
import { VisualProductPicker } from "./components/VisualProductPicker";
import { NewSaleModal, type NewSalePreset } from "../ventas/components/NewSaleModal";
import { useCreateSale } from "../ventas/useSalesData";

type StockFilter = "todos" | "disponibles" | "agotados";

export function Inventario() {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast } = useUIStore();
  const wid = activeWorkspace?.id ?? "";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("todos");
  const [selected, setSelected] = useState<CatalogItemWithImeis | null>(null);
  const ctxMenu = useContextMenu();
  const [ctxItem, setCtxItem] = useState<CatalogItemWithImeis | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [salePreset, setSalePreset] = useState<NewSalePreset | null>(null);
  const createSaleMut = useCreateSale();

  const productsQ = useQuery({
    queryKey: ["inventario", "catalog", wid],
    queryFn: () => catalogDb.getAll(wid),
    enabled: !!wid,
  });

  const summaryQ = useQuery({
    queryKey: ["inventario", "summary", wid],
    queryFn: () => catalogDb.getInventorySummary(wid),
    enabled: !!wid,
  });

  const products = productsQ.data ?? [];
  const summary = summaryQ.data ?? { total_items: 0, in_stock: 0, out_of_stock: 0, total_value: 0 };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const units = p.track_stock ? (p.available_imeis ?? 0) : (p.stock ?? 0);
      if (filter === "disponibles" && units === 0) return false;
      if (filter === "agotados" && units > 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.category ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [products, search, filter]);

  // (vista legacy retirada — todo se maneja con drawer + modales)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[5], height: "100%" }}>
      <PageHeader
        title="Inventario"
        subtitle={`${summary.total_items} productos · ${summary.in_stock} con stock`}
        actions={
          <>
            <Button
              variant="secondary"
              iconLeft={<Plus size={14} />}
              onClick={() => setPickerOpen(true)}
            >
              Agregar producto
            </Button>
            <Button
              variant="primary"
              iconLeft={<Zap size={14} />}
              onClick={() => setSaleOpen(true)}
            >
              Venta rápida
            </Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: space[3] }}>
        <MetricCard label="Productos en catálogo" value={String(summary.total_items)} icon={<Package size={16} />} />
        <MetricCard label="Con stock" value={String(summary.in_stock)} tone="success" />
        <MetricCard label="Agotados" value={String(summary.out_of_stock)} tone={summary.out_of_stock > 0 ? "warning" : "neutral"} />
      </div>

      <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 400 }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            iconLeft={<Search size={14} />}
          />
        </div>
        <Tabs
          variant="pills"
          size="sm"
          value={filter}
          onChange={(v) => setFilter(v as StockFilter)}
          items={[
            { value: "todos", label: "Todos" },
            { value: "disponibles", label: "Disponibles" },
            { value: "agotados", label: "Agotados" },
          ]}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <EmptyState
            title={search.trim() ? "Sin resultados" : "Catálogo vacío"}
            description={search.trim() ? "Probá otro término" : "Cargá productos para empezar."}
            action={
              !search.trim()
                ? { label: "Agregar producto", onClick: () => setPickerOpen(true), iconLeft: <Plus size={14} /> }
                : undefined
            }
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: space[3],
            }}
          >
            {filtered.map((p) => (
              <ProductCard
                key={p.id}
                item={p}
                onClick={() => setSelected(p)}
                onContextMenu={(e) => {
                  setCtxItem(p);
                  ctxMenu.openAt(e);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <ProductDetailDrawer
        item={selected}
        onClose={() => setSelected(null)}
      />

      {ctxMenu.open && ctxItem && (
        <ContextMenu position={ctxMenu.position} onClose={ctxMenu.close}>
          <ContextMenuLabel>{ctxItem.name}</ContextMenuLabel>
          <ContextMenuItem
            icon={<Eye size={14} />}
            onClick={() => {
              setSelected(ctxItem);
              ctxMenu.close();
            }}
          >
            Ver detalle
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Zap size={14} />}
            onClick={() => {
              setSalePreset({ catalogItem: ctxItem });
              setSaleOpen(true);
              ctxMenu.close();
            }}
          >
            Vender ahora
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Copy size={14} />}
            onClick={() => {
              navigator.clipboard.writeText(ctxItem.name).then(
                () => showToast("Nombre copiado", "success"),
                () => showToast("No se pudo copiar", "error"),
              );
              ctxMenu.close();
            }}
          >
            Copiar nombre
          </ContextMenuItem>
        </ContextMenu>
      )}

      <VisualProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        wid={wid}
        onCreated={(item) => {
          setPickerOpen(false);
          setSelected(item);
        }}
        onSwitchToManual={() => {
          setPickerOpen(false);
          setManualOpen(true);
        }}
      />

      <AddProductSimpleModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        wid={wid}
        onCreated={(item) => {
          setManualOpen(false);
          setSelected(item);
        }}
      />

      <NewSaleModal
        open={saleOpen}
        onClose={() => {
          setSaleOpen(false);
          setSalePreset(null);
        }}
        preset={salePreset}
        onSubmit={async (data) => {
          await createSaleMut.mutateAsync(data);
          showToast(data.outOfStock ? "Venta fuera de stock registrada" : "Venta registrada", "success");
          setSalePreset(null);
        }}
      />
    </div>
  );
}

function ProductCard({
  item,
  onClick,
  onContextMenu,
}: {
  item: CatalogItemWithImeis;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  // track_stock=1 → IMEIs son la fuente de verdad; el campo stock es solo cache.
  // track_stock=0 → no hay IMEIs, usar stock genérico.
  const units = item.track_stock ? (item.available_imeis ?? 0) : (item.stock ?? 0);
  const total = item.track_stock ? (item.total_imeis ?? 0) : (item.stock ?? 0);
  const sold = total - units;
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!item.image_path) {
      setImgUrl(null);
      return;
    }
    // 1) Catálogo built-in (Apple): paths empiezan con /src/assets/products/
    const templateUrl = getTemplateImageUrl(item.image_path);
    if (templateUrl) {
      setImgUrl(templateUrl);
      return;
    }
    // 2) Imágenes subidas por el usuario (appData)
    resolveImageUrl(item.image_path).then(setImgUrl).catch(() => setImgUrl(null));
  }, [item.image_path]);

  return (
    <Card
      padding={0}
      interactive
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <div
        style={{
          aspectRatio: "1",
          background: color.surface2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {imgUrl ? (
          <img src={imgUrl} alt={item.name} style={{ width: "70%", height: "70%", objectFit: "contain" }} />
        ) : (
          <Package size={36} color={color.textDim} />
        )}
      </div>
      <div style={{ padding: space[3], display: "flex", flexDirection: "column", gap: space[1] }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.semibold,
            color: color.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </div>
        {item.category && (
          <div style={{ fontSize: text.xs, color: color.textMuted }}>{item.category}</div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: space[2] }}>
          {units > 0 ? (
            <Badge tone="success">
              {units} {units === 1 ? "unidad" : "unidades"}
            </Badge>
          ) : (
            <Badge tone="neutral">Sin stock</Badge>
          )}
          {item.price && item.price > 0 && (
            <span style={{ fontSize: text.xs, color: color.textMuted }}>
              {formatMoney(item.price, item.currency as "ARS" | "USD")}
            </span>
          )}
        </div>
        {sold > 0 && (
          <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2 }}>
            {sold} vendida{sold === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </Card>
  );
}
