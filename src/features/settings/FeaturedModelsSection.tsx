import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Star } from "lucide-react";
import { Input } from "../../components/Input";
import { EmptyState } from "../../components/EmptyState";
import { featuredModelsDb } from "../../lib/db/featuredModels";
import { getCategoryFamilyTree, getModels, getColorsForModel, type ProductModel } from "../../lib/db/quickStock";
import { useAuthStore, canEditPricing } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { getTemplateImageUrl, resolveColorImage } from "../../lib/templates/productImageMap";
import { color, radius, space, text, weight } from "../../tokens";

export function FeaturedModelsSection({ wid }: { wid: string }) {
  const role = useAuthStore((s) => s.userRole);
  const allowed = canEditPricing(role);
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const [search, setSearch] = useState("");

  // Tree para tener categorías + familias para mostrar todos los modelos
  const treeQ = useQuery({
    queryKey: ["picker-tree", wid],
    queryFn: () => getCategoryFamilyTree(wid),
    enabled: allowed && !!wid,
  });

  // Set actual de destacados
  const featuredQ = useQuery({
    queryKey: ["featured-models", wid],
    queryFn: () => featuredModelsDb.getAll(wid),
    enabled: allowed && !!wid,
  });

  // Cargar todos los modelos: por cada familia un getModels
  const familyIds = useMemo(() => {
    const ids: string[] = [];
    for (const cat of treeQ.data ?? []) {
      for (const f of cat.families) ids.push(f.family.id);
    }
    return ids;
  }, [treeQ.data]);

  const modelsQ = useQuery({
    queryKey: ["all-models", familyIds.join(",")],
    queryFn: async () => {
      const out: Array<{
        category: string;
        family: string;
        models: ProductModel[];
      }> = [];
      for (const cat of treeQ.data ?? []) {
        for (const fe of cat.families) {
          const ms = await getModels(fe.family.id);
          out.push({ category: cat.category.name, family: fe.family.name, models: ms });
        }
      }
      return out;
    },
    enabled: allowed && familyIds.length > 0,
  });

  const toggleMut = useMutation({
    mutationFn: (modelId: string) => featuredModelsDb.toggle(wid, modelId),
    onSuccess: (isNowFeatured) => {
      qc.invalidateQueries({ queryKey: ["featured-models", wid] });
      qc.invalidateQueries({ queryKey: ["picker-tree", wid] });
      showToast(isNowFeatured ? "Marcado como destacado" : "Quitado de destacados", "success");
    },
  });

  const setColorMut = useMutation({
    mutationFn: ({ modelId, color: c }: { modelId: string; color: string | null }) =>
      featuredModelsDb.setFeatured(wid, modelId, c),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["featured-models", wid] });
      qc.invalidateQueries({ queryKey: ["picker-tree", wid] });
    },
  });

  const featuredSet = featuredQ.data ?? new Map<string, string | null>();
  const groups = useMemo(() => modelsQ.data ?? [], [modelsQ.data]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        models: g.models.filter((m) => m.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.models.length > 0);
  }, [groups, search]);

  if (!allowed) {
    return (
      <EmptyState
        title="Sin permisos"
        description="Solo el owner o admin pueden marcar productos destacados."
      />
    );
  }

  return (
    <div>
      <header style={{ marginBottom: space[5] }}>
        <h2 style={{ margin: 0, fontSize: text.lg, fontWeight: weight.bold, color: color.text, letterSpacing: "-0.2px" }}>
          Productos destacados
        </h2>
        <p style={{ margin: 0, marginTop: 4, fontSize: text.sm, color: color.textMuted }}>
          Marcá ⭐ los modelos que querés destacar en el selector al cargar productos.
          Aparecen primero, con borde rojo y badge "Destacado".
        </p>
      </header>

      <div style={{ marginBottom: space[3] }}>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar modelo…"
          iconLeft={<Search size={14} />}
        />
      </div>

      {filteredGroups.length === 0 ? (
        <EmptyState title="Sin modelos" description="Probá otra búsqueda" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: space[5] }}>
          {filteredGroups.map((g) => (
            <section key={`${g.category}-${g.family}`}>
              <h3
                style={{
                  margin: 0,
                  marginBottom: space[2],
                  fontSize: text.xs,
                  fontWeight: weight.semibold,
                  color: color.textDim,
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                }}
              >
                {g.category} · {g.family}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: space[2],
                }}
              >
                {g.models.map((m) => (
                  <FeaturedModelCard
                    key={m.id}
                    model={m}
                    category={g.category}
                    featured={featuredSet.has(m.id)}
                    featuredColor={featuredSet.get(m.id) ?? null}
                    onToggle={() => toggleMut.mutate(m.id)}
                    onSetColor={(c) => setColorMut.mutate({ modelId: m.id, color: c })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * FeaturedModelCard — card individual con star toggle + color swatches
 * ───────────────────────────────────────────────────────────────────── */

function FeaturedModelCard({
  model,
  category,
  featured,
  featuredColor,
  onToggle,
  onSetColor,
}: {
  model: ProductModel;
  category: string;
  featured: boolean;
  featuredColor: string | null;
  onToggle: () => void;
  onSetColor: (color: string | null) => void;
}) {
  // Cargar colores del modelo solo si el card está destacado (lazy)
  const colorsQ = useQuery({
    queryKey: ["model-colors", model.id],
    queryFn: () => getColorsForModel(model.id),
    enabled: featured,
    staleTime: 5 * 60 * 1000,
  });

  // Imagen color-aware si hay color elegido
  const img = featured && featuredColor
    ? resolveColorImage(category, model.name, featuredColor, model.image_path)
    : getTemplateImageUrl(model.image_path);

  return (
    <div
      style={{
        position: "relative",
        background: color.surface,
        border: `1px solid ${featured ? color.primary : color.border}`,
        borderRadius: radius.md,
        padding: space[3],
        boxShadow: featured ? "0 0 0 3px rgba(225, 29, 72, 0.15)" : "none",
        transition: "all 120ms",
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={featured ? "Quitar de destacados" : "Marcar como destacado"}
        title={featured ? "Quitar de destacados" : "Marcar como destacado"}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 28,
          height: 28,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: featured ? color.primary : color.surface2,
          border: `1px solid ${featured ? color.primary : color.border}`,
          borderRadius: "50%",
          color: featured ? "#fff" : color.textMuted,
          cursor: "pointer",
          zIndex: 2,
        }}
      >
        <Star size={14} fill={featured ? "#fff" : "transparent"} />
      </button>
      <div
        style={{
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: space[2],
        }}
      >
        {img ? (
          <img src={img} alt={model.name} style={{ maxWidth: "85%", maxHeight: 70, objectFit: "contain" }} />
        ) : (
          <span style={{ fontSize: 28, color: color.textDim }}>📦</span>
        )}
      </div>
      <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text, textAlign: "center" }}>
        {model.name}
      </div>

      {featured && (colorsQ.data?.length ?? 0) > 0 && (
        <div
          style={{
            marginTop: space[2],
            paddingTop: space[2],
            borderTop: `1px solid ${color.border}`,
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            justifyContent: "center",
          }}
        >
          {/* "Cualquier color" / default */}
          <button
            onClick={() => onSetColor(null)}
            title="Usar imagen default del modelo"
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: radius.sm,
              border: `1px solid ${featuredColor === null ? color.primary : color.border}`,
              background: featuredColor === null ? color.primary : "transparent",
              color: featuredColor === null ? "#fff" : color.textMuted,
              cursor: "pointer",
              fontWeight: weight.semibold,
            }}
          >
            default
          </button>
          {(colorsQ.data ?? []).map((c) => {
            const selected = featuredColor === c.color;
            return (
              <button
                key={c.color}
                onClick={() => onSetColor(c.color)}
                title={c.color}
                aria-label={c.color}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: c.color_hex ?? color.surface2,
                  border: `2px solid ${selected ? color.primary : color.border}`,
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 100ms",
                  boxShadow: selected ? `0 0 0 2px ${color.surface}, 0 0 0 4px ${color.primary}` : "none",
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
