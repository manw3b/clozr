import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Trash2, Pencil, MoreHorizontal, Layers, X, Check } from "lucide-react";
import { Drawer } from "../../../components/Drawer";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Badge } from "../../../components/Badge";
import { catalogDb } from "../../../lib/db/catalog";
import { useUIStore } from "../../../store/uiStore";
import { useWorkspaceStore } from "../../../store/workspaceStore";
import { useAuthStore, assertCan, can } from "../../../store/authStore";
import { color, radius, space, text, weight } from "../../../tokens";
import { formatMoney } from "../../../lib/format";
import { resolveImageUrl } from "../../../lib/images";
import { getTemplateImageUrl } from "../../../lib/templates/productImageMap";
import type { CatalogItemWithImeis } from "../../../lib/db/types";

interface Props {
  item: CatalogItemWithImeis | null;
  onClose: () => void;
  onEdit?: (item: CatalogItemWithImeis) => void;
  /** Cargar otra variante (mismo modelo, otro color/storage). Abre el picker pre-cargado. */
  onLoadAnotherVariant?: (item: CatalogItemWithImeis) => void;
  /** Editar precios (abre modal de Ajustes → Precios pre-cargado o navega) */
  onEditPrices?: (item: CatalogItemWithImeis) => void;
}

export function ProductDetailDrawer({ item, onClose, onEdit, onLoadAnotherVariant, onEditPrices }: Props) {
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
    if (!item?.image_path) return;
    const templateUrl = getTemplateImageUrl(item.image_path);
    if (templateUrl) {
      setImgUrl(templateUrl);
      return;
    }
    resolveImageUrl(item.image_path).then(setImgUrl).catch(() => setImgUrl(null));
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

  const updateImeiMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      catalogDb.updateImei(id, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog-item-imeis", item?.id] });
      showToast("IMEI actualizado", "success");
    },
  });

  const role = useAuthStore((s) => s.userRole);

  const deleteProductMut = useMutation({
    mutationFn: () => {
      assertCan(role, "deleteCatalogItem");
      return item ? catalogDb.softDelete(wid, item.id) : Promise.resolve();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventario"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
      showToast("Producto eliminado", "success");
      onClose();
    },
  });

  const [menuOpen, setMenuOpen] = useState(false);

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
        <div style={{ display: "flex", gap: space[1], position: "relative" }}>
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              aria-label="Editar"
              title="Editar producto"
              style={iconBtnStyle}
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Más opciones"
            style={iconBtnStyle}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div
              style={{
                position: "absolute",
                top: 32,
                right: 0,
                minWidth: 200,
                background: color.surface,
                border: `1px solid ${color.borderStrong}`,
                borderRadius: radius.md,
                boxShadow: "var(--shadow-lg)",
                padding: 4,
                zIndex: 60,
              }}
              onMouseLeave={() => setMenuOpen(false)}
            >
              {onEditPrices && can(role, "editPricing") && (
                <MenuItem
                  label="Editar precios"
                  onClick={() => {
                    setMenuOpen(false);
                    onEditPrices(item);
                  }}
                />
              )}
              {can(role, "deleteCatalogItem") && (
              <MenuItem
                label="Eliminar producto"
                danger
                onClick={() => {
                  setMenuOpen(false);
                  if (window.confirm(`¿Eliminar "${item.name}"? Las ventas pasadas no se ven afectadas.`)) {
                    deleteProductMut.mutate();
                  }
                }}
              />
              )}
            </div>
          )}
        </div>
      }
      footer={
        <div style={{ display: "flex", gap: space[2], justifyContent: "space-between", width: "100%" }}>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <div style={{ display: "flex", gap: space[2] }}>
            {onLoadAnotherVariant && (
              <Button
                variant="secondary"
                iconLeft={<Layers size={14} />}
                onClick={() => onLoadAnotherVariant(item)}
              >
                Otra variante
              </Button>
            )}
            <Button
              variant="primary"
              iconLeft={<Plus size={14} />}
              onClick={() => setAdding(true)}
            >
              Cargar más unidades
            </Button>
          </div>
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
                <ImeiRow
                  key={u.id}
                  imeiId={u.id}
                  imei={u.imei}
                  sold={!!u.sold_at}
                  onDelete={() => {
                    if (confirm(`¿Eliminar la unidad ${u.imei}?`)) deleteImeiMut.mutate(u.id);
                  }}
                  onSaveEdit={(value) => updateImeiMut.mutate({ id: u.id, value })}
                />
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

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: radius.sm,
  color: color.textMuted,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};

function MenuItem({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: `${space[2]} ${space[3]}`,
        borderRadius: radius.sm,
        background: hover ? (danger ? color.dangerBg : color.surfaceHover) : "transparent",
        color: danger ? color.danger : color.text,
        fontSize: text.sm,
        border: "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ImeiRow({
  imeiId,
  imei,
  sold,
  onDelete,
  onSaveEdit,
}: {
  imeiId: string;
  imei: string;
  sold: boolean;
  onDelete: () => void;
  onSaveEdit: (newValue: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(imei);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== imei) onSaveEdit(v);
    setEditing(false);
  };

  void imeiId;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[3],
        padding: `${space[2]} ${space[3]}`,
        borderBottom: `1px solid ${color.border}`,
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(imei);
              setEditing(false);
            }
          }}
          style={{
            flex: 1,
            background: color.surface,
            border: `1px solid ${color.primary}`,
            borderRadius: radius.sm,
            padding: "4px 8px",
            fontSize: text.sm,
            fontFamily: "monospace",
            color: color.text,
          }}
        />
      ) : (
        <button
          onClick={() => !sold && setEditing(true)}
          disabled={sold}
          style={{
            flex: 1,
            fontSize: text.sm,
            fontFamily: "monospace",
            color: color.text,
            background: "transparent",
            border: "none",
            textAlign: "left",
            cursor: sold ? "default" : "text",
            padding: 0,
          }}
        >
          {imei}
        </button>
      )}
      {sold ? (
        <Badge tone="neutral">vendida</Badge>
      ) : (
        <Badge tone="success">disponible</Badge>
      )}
      {!sold && !editing && (
        <button
          onClick={() => setEditing(true)}
          aria-label="Editar IMEI"
          title="Editar IMEI"
          style={iconBtnStyle}
        >
          <Pencil size={12} />
        </button>
      )}
      {editing && (
        <>
          <button onClick={commit} aria-label="Guardar" style={iconBtnStyle}>
            <Check size={12} color={color.success} />
          </button>
          <button
            onClick={() => {
              setDraft(imei);
              setEditing(false);
            }}
            aria-label="Cancelar"
            style={iconBtnStyle}
          >
            <X size={12} />
          </button>
        </>
      )}
      {!sold && !editing && (
        <button
          onClick={onDelete}
          aria-label="Eliminar"
          title="Eliminar unidad"
          style={iconBtnStyle}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
