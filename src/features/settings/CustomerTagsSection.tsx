import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Tag as TagIcon } from "lucide-react";
import { customerTagsDb } from "../../lib/db/customerTags";
import { useUIStore } from "../../store/uiStore";
import { useAuthStore, assertCan, can } from "../../store/authStore";
import { color, radius, space, text, weight } from "../../tokens";
import { PALETTE_LIST, colorCss } from "../../lib/colorPalette";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { EmptyState } from "../../components/EmptyState";

/**
 * CRUD de etiquetas de clientes. Mismo patrón que pipeline stages —
 * el user puede crear, editar (nombre + color) y borrar etiquetas.
 *
 * Permisos: gated por managePaymentMethods (= owner|admin) — alias
 * razonable hasta que tengamos un permiso específico para tags.
 */

export function CustomerTagsSection({ wid }: { wid: string }) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const role = useAuthStore((s) => s.userRole);
  const allowed = can(role, "manageCustomerTypes");

  const tagsQ = useQuery({
    queryKey: ["customer-tags-with-count", wid],
    queryFn: () => customerTagsDb.getAllWithCount(wid),
    enabled: !!wid,
  });

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<string>(PALETTE_LIST[0]?.id ?? "gray");

  const createMut = useMutation({
    mutationFn: () => {
      assertCan(role, "manageCustomerTypes");
      return customerTagsDb.create(wid, { name: draftName.trim(), color: draftColor });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-tags-with-count"] });
      qc.invalidateQueries({ queryKey: ["customer-tags"] });
      setDraftName("");
      setCreating(false);
      showToast("Etiqueta creada", "success");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; color?: string }) => {
      assertCan(role, "manageCustomerTypes");
      return customerTagsDb.update(id, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-tags-with-count"] });
      qc.invalidateQueries({ queryKey: ["customer-tags"] });
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => {
      assertCan(role, "manageCustomerTypes");
      return customerTagsDb.remove(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-tags-with-count"] });
      qc.invalidateQueries({ queryKey: ["customer-tags"] });
      showToast("Etiqueta eliminada", "success");
    },
  });

  const tags = tagsQ.data ?? [];

  return (
    <div>
      <header style={{ marginBottom: space[5], display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: space[3] }}>
        <div>
          <h2 style={{ margin: 0, fontSize: text.lg, fontWeight: weight.bold, color: color.text, letterSpacing: "-0.2px" }}>
            Etiquetas de clientes
          </h2>
          <p style={{ margin: 0, marginTop: 4, fontSize: text.sm, color: color.textMuted }}>
            Etiquetas libres para clasificar clientes — VIP, Conoce de antes,
            Estudiante, Empresa grande… podés tener cuantas quieras.
          </p>
        </div>
        {allowed && !creating && (
          <Button variant="primary" iconLeft={<Plus size={14} />} onClick={() => setCreating(true)}>
            Nueva etiqueta
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
          Solo el owner o admin pueden modificar las etiquetas. Estás en modo lectura.
        </div>
      )}

      {/* Form de creación inline */}
      {creating && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: space[3],
            padding: space[4],
            background: color.surface,
            border: `1px solid ${color.borderStrong}`,
            borderRadius: radius.md,
            marginBottom: space[4],
          }}
        >
          <Input
            label="Nombre"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder='Ej: VIP, Compra recurrente, Empresa grande'
            autoFocus
          />
          <ColorPicker value={draftColor} onChange={setDraftColor} />
          <div style={{ display: "flex", gap: space[2], justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => { setCreating(false); setDraftName(""); }}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => createMut.mutate()}
              disabled={draftName.trim().length < 2}
              loading={createMut.isPending}
            >
              Crear etiqueta
            </Button>
          </div>
        </div>
      )}

      {tags.length === 0 ? (
        <EmptyState
          icon={<TagIcon size={20} />}
          title="Sin etiquetas todavía"
          description="Las etiquetas te permiten clasificar clientes con tus propios criterios."
          action={
            allowed && !creating
              ? { label: "Crear primera etiqueta", onClick: () => setCreating(true), iconLeft: <Plus size={14} /> }
              : undefined
          }
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
          {tags.map((t, idx) => (
            <TagRow
              key={t.id}
              tag={t}
              isLast={idx === tags.length - 1}
              editable={allowed}
              onUpdate={(patch) => updateMut.mutate({ id: t.id, ...patch })}
              onRemove={() => {
                if (
                  window.confirm(
                    t.customer_count > 0
                      ? `Eliminar la etiqueta "${t.name}"? Está asignada a ${t.customer_count} ${t.customer_count === 1 ? "cliente" : "clientes"} y se les va a quitar.`
                      : `Eliminar la etiqueta "${t.name}"?`,
                  )
                ) {
                  removeMut.mutate(t.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TagRow({
  tag,
  isLast,
  editable,
  onUpdate,
  onRemove,
}: {
  tag: { id: string; name: string; color: string; customer_count: number };
  isLast: boolean;
  editable: boolean;
  onUpdate: (patch: { name?: string; color?: string }) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [colorId, setColorId] = useState(tag.color);

  function commitName() {
    const trimmed = name.trim();
    if (trimmed.length >= 2 && trimmed !== tag.name) {
      onUpdate({ name: trimmed });
    } else if (trimmed.length < 2) {
      setName(tag.name);
    }
  }
  function commitColor(c: string) {
    setColorId(c);
    if (c !== tag.color) onUpdate({ color: c });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[3],
        padding: `${space[3]} ${space[4]}`,
        borderBottom: isLast ? "none" : `1px solid ${color.border}`,
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: colorCss(colorId),
          flexShrink: 0,
        }}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setName(tag.name);
        }}
        disabled={!editable}
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: text.sm,
          fontWeight: weight.semibold,
          color: color.text,
          padding: 0,
        }}
      />
      <span style={{ fontSize: text.xs, color: color.textMuted, flexShrink: 0 }}>
        {tag.customer_count} {tag.customer_count === 1 ? "cliente" : "clientes"}
      </span>
      {editable && (
        <>
          <ColorPicker value={colorId} onChange={commitColor} compact />
          <button
            onClick={onRemove}
            title="Eliminar etiqueta"
            style={{
              width: 28,
              height: 28,
              borderRadius: radius.sm,
              color: color.textMuted,
              background: "transparent",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 100ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = color.danger;
              e.currentTarget.style.background = color.dangerBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = color.textMuted;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {!compact && (
        <span style={{ fontSize: text.xs, fontWeight: weight.medium, color: color.textMuted, marginRight: space[2] }}>
          Color
        </span>
      )}
      {PALETTE_LIST.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            title={c.label}
            aria-label={c.label}
            style={{
              width: compact ? 18 : 22,
              height: compact ? 18 : 22,
              borderRadius: "50%",
              background: c.css,
              border: `2px solid ${active ? color.text : "transparent"}`,
              boxShadow: active ? `0 0 0 2px ${color.surface}, 0 0 0 4px ${c.css}` : "none",
              cursor: "pointer",
              padding: 0,
              transition: "all 100ms",
            }}
          />
        );
      })}
    </div>
  );
}
