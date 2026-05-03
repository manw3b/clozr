import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Trash2, ShoppingCart, Pencil } from "lucide-react";
import { Drawer } from "../../../components/Drawer";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Badge } from "../../../components/Badge";
import { catalogDb } from "../../../lib/db/catalog";
import { useUIStore } from "../../../store/uiStore";
import { useWorkspaceStore } from "../../../store/workspaceStore";
import { color, radius, space, text, weight } from "../../../tokens";
import { formatMoney } from "../../../lib/format";
import { resolveImageUrl } from "../../../lib/images";
import type { CatalogItemWithImeis } from "../../../lib/db/types";

interface Props {
  item: CatalogItemWithImeis | null;
  onClose: () => void;
  onEdit?: (item: CatalogItemWithImeis) => void;
  onSellUnit?: (item: CatalogItemWithImeis) => void;
}

export function ProductDetailDrawer({ item, onClose, onEdit, onSellUnit }: Props) {
  const open = !!item;
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [imeisText, setImeisText] = useState("");

  useEffect(() => {
    setImgUrl(null);
    if (item?.image_path) {
      resolveImageUrl(item.image_path).then(setImgUrl).catch(() => setImgUrl(null));
    }
  }, [item?.image_path]);

  const imeisQ = useQuery({
    queryKey: ["catalog-item-imeis", item?.id],
    queryFn: () => (item ? catalogDb.getImeisForItem(item.id) : Promise.resolve([])),
    enabled: open && !!item,
  });

  const recentQ = useQuery({
    queryKey: ["catalog-item-recent-sales", item?.id, wid],
    queryFn: () =>
      item
        ? catalogDb.getRecentSalesForProduct(wid, item.id, 5)
        : Promise.resolve([]),
    enabled: open && !!item && !!wid,
  });

  const addImeisMut = useMutation({
    mutationFn: async () => {
      if (!item) return { added: 0 };
      const list = imeisText
        .split(/[\s,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return catalogDb.addImeis(item.id, list);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["catalog-item-imeis", item?.id] });
      qc.invalidateQueries({ queryKey: ["inventario"] });
      showToast(`${res.added} ${res.added === 1 ? "unidad agregada" : "unidades agregadas"}`, "success");
      setImeisText("");
      setAdding(false);
    },
  });

  const deleteImeiMut = useMutation({
    mutationFn: (imeiId: string) => catalogDb.deleteImei(imeiId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog-item-imeis", item?.id] });
      qc.invalidateQueries({ queryKey: ["inventario"] });
      showToast("Unidad eliminada", "success");
    },
  });

  if (!item) return null;

  const imeis = imeisQ.data ?? [];
  const available = imeis.filter((i) => !i.sold_at);
  const sold = imeis.filter((i) => i.sold_at);
  const recent = recentQ.data ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={item.name}
      subtitle={item.category ?? undefined}
      width="520px"
      headerActions={
        onEdit && (
          <button
            onClick={() => onEdit(item)}
            aria-label="Editar"
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
            <Pencil size={14} />
          </button>
        )
      }
      footer={
        <div style={{ display: "flex", gap: space[2], justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          {onSellUnit && available.length > 0 && (
            <Button variant="primary" iconLeft={<ShoppingCart size={14} />} onClick={() => onSellUnit(item)}>
              Vender unidad
            </Button>
          )}
        </div>
      }
    >
      <div style={{ padding: space[5], display: "flex", flexDirection: "column", gap: space[5] }}>
        {/* Hero */}
        <div style={{ display: "flex", gap: space[4], alignItems: "center" }}>
          <div
            style={{
              width: 96,
              height: 96,
              background: color.surface2,
              borderRadius: radius.md,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {imgUrl ? (
              <img src={imgUrl} alt={item.name} style={{ width: "75%", height: "75%", objectFit: "contain" }} />
            ) : (
              <Package size={32} color={color.textDim} />
            )}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: space[2] }}>
            <div style={{ display: "flex", gap: space[2] }}>
              {available.length > 0 ? (
                <Badge tone="success">{available.length} disponibles</Badge>
              ) : (
                <Badge tone="neutral">Sin stock</Badge>
              )}
              {sold.length > 0 && <Badge tone="neutral">{sold.length} vendidas</Badge>}
            </div>
            <div style={{ fontSize: text.xs, color: color.textMuted, display: "flex", gap: space[3] }}>
              {item.cost_usd && item.cost_usd > 0 ? (
                <span>Costo USD {item.cost_usd}</span>
              ) : (
                <span>Sin costo cargado</span>
              )}
              {item.price && item.price > 0 && (
                <span>Precio {formatMoney(item.price, item.currency as "ARS" | "USD")}</span>
              )}
            </div>
          </div>
        </div>

        {/* Unidades */}
        <section>
          <SectionHeader
            title="Unidades"
            count={imeis.length}
            action={
              !adding && (
                <Button size="sm" variant="ghost" iconLeft={<Plus size={12} />} onClick={() => setAdding(true)}>
                  Cargar
                </Button>
              )
            }
          />

          {adding && (
            <div
              style={{
                background: color.surface2,
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
                padding: space[3],
                marginBottom: space[3],
                display: "flex",
                flexDirection: "column",
                gap: space[2],
              }}
            >
              <div style={{ fontSize: text.xs, color: color.textMuted }}>
                Pegá uno o varios IMEIs (separados por coma, espacio o salto de línea).
              </div>
              <Input
                value={imeisText}
                onChange={(e) => setImeisText(e.target.value)}
                placeholder="351234567890123, 351234567890124"
                autoFocus
              />
              <div style={{ display: "flex", gap: space[2], justifyContent: "flex-end" }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false);
                    setImeisText("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => addImeisMut.mutate()}
                  loading={addImeisMut.isPending}
                  disabled={!imeisText.trim()}
                >
                  Agregar
                </Button>
              </div>
            </div>
          )}

          {imeis.length === 0 ? (
            <div
              style={{
                padding: space[4],
                textAlign: "center",
                fontSize: text.sm,
                color: color.textMuted,
                background: color.surface2,
                borderRadius: radius.md,
              }}
            >
              No hay unidades cargadas todavía.
            </div>
          ) : (
            <div style={{ background: color.surface2, border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: "hidden" }}>
              {imeis.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: space[3],
                    padding: `${space[2]} ${space[3]}`,
                    borderBottom: `1px solid ${color.border}`,
                  }}
                >
                  <div style={{ flex: 1, fontSize: text.sm, fontFamily: "monospace", color: color.text }}>
                    {u.imei}
                  </div>
                  {u.sold_at ? (
                    <Badge tone="neutral">vendida</Badge>
                  ) : (
                    <Badge tone="success">disponible</Badge>
                  )}
                  {!u.sold_at && (
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar la unidad ${u.imei}?`)) deleteImeiMut.mutate(u.id);
                      }}
                      aria-label="Eliminar"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: radius.sm,
                        color: color.textMuted,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ventas recientes */}
        {recent.length > 0 && (
          <section>
            <SectionHeader title="Ventas recientes" count={recent.length} />
            <div style={{ background: color.surface2, border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: "hidden" }}>
              {recent.map((s) => (
                <div
                  key={s.sale_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: space[3],
                    padding: `${space[2]} ${space[3]}`,
                    borderBottom: `1px solid ${color.border}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: text.sm, color: color.text, fontWeight: weight.medium }}>
                      {s.customer_name ?? "Sin cliente"}
                    </div>
                    <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
                      {new Date(s.sale_date).toLocaleDateString("es-AR")}
                    </div>
                  </div>
                  <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
                    {formatMoney(s.unit_price * s.quantity)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Drawer>
  );
}

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: space[2],
      }}
    >
      <div
        style={{
          fontSize: text.xs,
          fontWeight: weight.semibold,
          color: color.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.6px",
        }}
      >
        {title}
        {count !== undefined && (
          <span style={{ marginLeft: space[2], color: color.textMuted, fontWeight: weight.medium }}>
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}
