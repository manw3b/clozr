import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, Flame, Package, Sparkles } from "lucide-react";
import { Modal, ModalField } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { Input, Select } from "../../../components/Input";
import { DateTimePicker } from "../../../components/DateTimePicker";
import { Avatar } from "../../../components/Avatar";
import { Badge, type BadgeTone } from "../../../components/Badge";
import { customersDb } from "../../../lib/db/customers";
import { pipelineDb } from "../../../lib/db/pipeline";
import { catalogDb } from "../../../lib/db/catalog";
import { pricingDb } from "../../../lib/db/pricing";
import { useUIStore } from "../../../store/uiStore";
import { useWorkspaceStore } from "../../../store/workspaceStore";
import { useAuthStore } from "../../../store/authStore";
import { useClientsList } from "../../clientes/useClientsData";
import { invalidate, qk } from "../../../lib/queryKeys";
import { color, radius, space, text, weight } from "../../../tokens";
import type {
  Client,
  ClientType,
  LeadStage,
  LeadPriority,
  LeadSource,
} from "../../../types/domain";
import { LEAD_SOURCE_LABELS } from "../../../types/domain";
import { usePipelineStages } from "../usePipelineStages";

/**
 * Tono visual del badge según el tipo de cliente. Se decide acá una vez
 * para que todas las partes del modal lo usen consistentemente.
 *  - final → info (azul, consumidor común)
 *  - revendedor → success (verde, negocio que recompra)
 *  - mayorista → warning (amber, alto valor)
 *  - empresa → primary (rojo Clozr, B2B)
 */
const CLIENT_TYPE_TONE: Record<ClientType, BadgeTone> = {
  final: "info",
  revendedor: "success",
  mayorista: "warning",
  empresa: "primary",
};
const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  final: "Final",
  revendedor: "Revendedor",
  mayorista: "Mayorista",
  empresa: "Empresa",
};

const LEAD_SOURCES: LeadSource[] = ["referido", "walk-in", "web", "redes", "otro"];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Etapa pre-seleccionada (cuando se crea desde el "+" de una columna). */
  initialStage?: LeadStage;
}

export function NewLeadModal({ open, onClose, initialStage = "prospecto" }: Props) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { userId } = useAuthStore();
  const wid = activeWorkspace?.id ?? "";
  const { stages: STAGES } = usePipelineStages();

  const [clientSearch, setClientSearch] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);

  const [stage, setStage] = useState<LeadStage>(initialStage);
  const [product, setProduct] = useState("");
  // Si el producto fue elegido del catálogo, guardamos el id para
  // poder mostrar el "auto-precio" + asociar el lead al catalog item.
  const [catalogItemId, setCatalogItemId] = useState<string | null>(null);
  const [estimatedUsd, setEstimatedUsd] = useState("");
  /** Marca si el "Valor estimado" fue auto-completado a partir del
   *  precio del catálogo (para mostrar un hint sutil al usuario). */
  const [priceAutoFilled, setPriceAutoFilled] = useState(false);
  const [priority, setPriority] = useState<LeadPriority>("medium");
  const [source, setSource] = useState<LeadSource | null>(null);
  const [nextActionLabel, setNextActionLabel] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [shortNote, setShortNote] = useState("");

  const { data: allClients = [] } = useClientsList();

  // Catálogo del workspace para sugerir productos al tipear.
  const { data: catalogItems = [] } = useQuery({
    queryKey: qk.catalog.forLeads(wid),
    queryFn: () => catalogDb.getAll(wid),
    enabled: open && !!wid,
    staleTime: 60_000,
  });

  // reset al abrir + sincronizar etapa inicial
  useEffect(() => {
    if (open) {
      setStage(initialStage);
      setClient(null);
      setClientSearch("");
      setCreatingClient(false);
      setProduct("");
      setCatalogItemId(null);
      setEstimatedUsd("");
      setPriceAutoFilled(false);
      setPriority("medium");
      setSource(null);
      setNextActionLabel("");
      setNextActionAt("");
      setShortNote("");
    }
  }, [open, initialStage]);

  /**
   * Cuando el usuario elige un producto del catálogo Y hay un cliente
   * con tipo, intentamos resolver el precio sugerido para ese tipo.
   * Sólo escribimos en estimatedUsd si el campo está vacío o si lo
   * llenamos nosotros mismos antes — nunca pisamos un valor que el
   * usuario tipeó a mano.
   */
  useEffect(() => {
    if (!catalogItemId || !client?.type) return;
    let cancelled = false;
    pricingDb
      .resolvePrice(catalogItemId, client.type as string)
      .then((res) => {
        if (cancelled) return;
        if (res.priceUsd === null) return;
        // Si el usuario tipeó un valor manual (no auto), respetamos.
        if (estimatedUsd && !priceAutoFilled) return;
        setEstimatedUsd(String(res.priceUsd));
        setPriceAutoFilled(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogItemId, client?.type]);

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

  const stageConfig = STAGES.find((s) => s.id === stage);
  const stageOrder = STAGES.findIndex((s) => s.id === stage);

  const canSubmit = !!client && !!stageConfig && !creatingClient;

  const mut = useMutation({
    mutationFn: async () => {
      if (!client || !stageConfig) throw new Error("Datos incompletos");
      const value = parseFloat(estimatedUsd);
      return pipelineDb.create(wid, {
        customer_id: client.id,
        customer_name: client.name,
        stage_id: stage,
        stage_name: stageConfig.label,
        stage_order: stageOrder,
        estimated_value: Number.isFinite(value) && value > 0 ? value : null,
        currency: "USD",
        priority,
        product: product.trim() || null,
        catalog_item_id: catalogItemId,
        lead_source: source,
        next_action_at: nextActionAt || null,
        next_action_label: nextActionLabel.trim() || null,
        short_note: shortNote.trim() || null,
        created_by: userId ?? null,
      });
    },
    onSuccess: () => {
      invalidate.afterLeadChange(qc);
      showToast(`Lead creado: ${client?.name}`, "success");
      onClose();
    },
  });

  const isDirty = () =>
    !!client ||
    !!clientSearch.trim() ||
    creatingClient ||
    !!product.trim() ||
    !!estimatedUsd.trim() ||
    !!shortNote.trim() ||
    !!nextActionLabel.trim() ||
    !!nextActionAt ||
    !!source;

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar el lead?"
      title="Nuevo lead"
      subtitle="Cargá un prospecto en el pipeline"
      maxWidth={560}
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
            Crear lead
          </Button>
        </>
      }
    >
      {/* CLIENTE */}
      <ModalField label="Cliente" required>
        {client ? (
          <SelectedClientCard client={client} onClear={() => setClient(null)} />
        ) : creatingClient ? (
          <InlineCreateClient
            wid={wid}
            initialName={clientSearch}
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

      {/* ETAPA */}
      <ModalField label="Etapa" required>
        <Select value={stage} onChange={(e) => setStage(e.target.value as LeadStage)}>
          {STAGES.filter((s) => !s.terminal).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </ModalField>

      {/* PRODUCTO + VALOR */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: space[3] }}>
        <ModalField
          label="Producto / interés"
          hint={
            catalogItemId
              ? "Del catálogo — el valor se sugiere automáticamente"
              : product.trim()
              ? "Texto libre (no está en el catálogo)"
              : undefined
          }
        >
          <ProductPicker
            value={product}
            catalogItemId={catalogItemId}
            catalogItems={catalogItems}
            onPick={(p) => {
              setProduct(p.name);
              setCatalogItemId(p.id);
              // Permitir que el efecto auto-llene el precio.
              setPriceAutoFilled(false);
            }}
            onType={(s) => {
              setProduct(s);
              // Si están tipeando libre, despegar del catálogo.
              if (catalogItemId) {
                setCatalogItemId(null);
                if (priceAutoFilled) {
                  setEstimatedUsd("");
                  setPriceAutoFilled(false);
                }
              }
            }}
            onClearCatalog={() => {
              setCatalogItemId(null);
              if (priceAutoFilled) {
                setEstimatedUsd("");
                setPriceAutoFilled(false);
              }
            }}
          />
        </ModalField>
        <ModalField
          label="Valor estimado (USD)"
          hint={
            priceAutoFilled ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: color.success }}>
                <Sparkles size={11} /> Sugerido del catálogo
              </span>
            ) : undefined
          }
        >
          <Input
            type="number"
            step="0.01"
            value={estimatedUsd}
            onChange={(e) => {
              setEstimatedUsd(e.target.value);
              // Si el usuario edita manualmente, dejamos de marcar "auto".
              if (priceAutoFilled) setPriceAutoFilled(false);
            }}
            placeholder="Ej: 1300"
            iconLeft={<span style={{ fontSize: 12, fontWeight: weight.semibold }}>US$</span>}
          />
        </ModalField>
      </div>

      {/* PRIORIDAD — segmented control con peso visual consistente */}
      <ModalField label="Prioridad">
        <div
          style={{
            display: "inline-flex",
            background: color.surface2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            padding: 3,
            gap: 2,
          }}
        >
          {(["low", "medium", "high", "hot"] as LeadPriority[]).map((p) => {
            const active = priority === p;
            const labels: Record<LeadPriority, string> = {
              low: "Baja",
              medium: "Media",
              high: "Alta",
              hot: "Caliente",
            };
            return (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{
                  padding: `6px ${space[3]}`,
                  borderRadius: radius.sm,
                  border: "none",
                  background: active ? color.primary : "transparent",
                  color: active ? "#fff" : color.textMuted,
                  fontSize: text.sm,
                  fontWeight: active ? weight.semibold : weight.medium,
                  cursor: "pointer",
                  transition: "all 120ms",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = color.text;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = color.textMuted;
                }}
              >
                {p === "hot" && (
                  <Flame
                    size={12}
                    color={active ? "#fff" : color.primary}
                    fill={active ? "#fff" : color.primary}
                  />
                )}
                {labels[p]}
              </button>
            );
          })}
        </div>
      </ModalField>

      {/* ORIGEN DEL LEAD */}
      <ModalField
        label="Origen del lead"
        hint="Opcional — de dónde llegó el cliente (útil para reportes)"
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LEAD_SOURCES.map((s) => {
            const active = source === s;
            return (
              <button
                key={s}
                onClick={() => setSource(active ? null : s)}
                style={{
                  padding: "5px 11px",
                  borderRadius: radius.full,
                  border: `1px solid ${active ? color.primary : color.border}`,
                  background: active ? color.primaryBg : "transparent",
                  color: active ? color.primary : color.textMuted,
                  fontSize: text.xs,
                  fontWeight: weight.semibold,
                  cursor: "pointer",
                  transition: "all 120ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {LEAD_SOURCE_LABELS[s]}
              </button>
            );
          })}
        </div>
      </ModalField>

      {/* PRÓXIMA ACCIÓN */}
      <ModalField label="Próxima acción" hint="Opcional — qué tenés que hacer y cuándo">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: space[2] }}>
          <Input
            value={nextActionLabel}
            onChange={(e) => setNextActionLabel(e.target.value)}
            placeholder='Ej: "Llamar para confirmar"'
          />
          <DateTimePicker
            value={nextActionAt}
            onChange={setNextActionAt}
            placeholder="Programar"
          />
        </div>
      </ModalField>

      {/* NOTA */}
      <ModalField label="Nota corta" hint="Opcional">
        <Input
          value={shortNote}
          onChange={(e) => setShortNote(e.target.value)}
          placeholder='Ej: "Lo trajo Juan, conoce el equipo, busca financiación"'
        />
      </ModalField>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Helpers (cliente picker reutilizado, similar al de NewSaleModal)
 * ──────────────────────────────────────────────────────────────────── */

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
                <div
                  style={{
                    fontWeight: weight.semibold,
                    display: "flex",
                    alignItems: "center",
                    gap: space[2],
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.name}
                  </span>
                  {c.type && (
                    <Badge tone={CLIENT_TYPE_TONE[c.type]} size="sm">
                      {CLIENT_TYPE_LABEL[c.type]}
                    </Badge>
                  )}
                </div>
                <div style={{ fontSize: text.xs, color: color.textMuted }}>
                  {c.phone ?? "—"}
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

function SelectedClientCard({
  client,
  onClear,
}: {
  client: Client;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[3],
        padding: `10px ${space[3]}`,
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
      }}
    >
      <Avatar name={client.name} size={36} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space[2],
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: text.sm,
              fontWeight: weight.semibold,
              color: color.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {client.name}
          </span>
          {client.type && (
            <Badge tone={CLIENT_TYPE_TONE[client.type]} size="sm">
              {CLIENT_TYPE_LABEL[client.type]}
            </Badge>
          )}
        </div>
        {client.phone && (
          <span style={{ fontSize: text.xs, color: color.textMuted }}>
            {client.phone}
          </span>
        )}
      </div>
      <button
        onClick={onClear}
        style={{
          color: color.textMuted,
          fontSize: text.xs,
          fontWeight: weight.medium,
          padding: `4px ${space[2]}`,
          borderRadius: radius.sm,
          transition: "color 100ms, background 100ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = color.text;
          e.currentTarget.style.background = color.surfaceHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = color.textMuted;
          e.currentTarget.style.background = "transparent";
        }}
      >
        Cambiar
      </button>
    </div>
  );
}

function InlineCreateClient({
  wid,
  initialName,
  onCancel,
  onCreated,
}: {
  wid: string;
  initialName: string;
  onCancel: () => void;
  onCreated: (c: Client) => void;
}) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      customersDb.create(wid, {
        name: name.trim(),
        phone: phone.trim() || null,
        type: "final",
        status: "potencial",
      }),
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
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Teléfono (opcional)"
      />
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

/* ────────────────────────────────────────────────────────────────────
 * ProductPicker — input con autocompletar contra catalog_items.
 * Si el usuario elige una opción del dropdown, se "engancha" al
 * catálogo y onPick se dispara con id+name. Si tipea libre y no elige
 * nada, sigue siendo texto libre (onType).
 * ──────────────────────────────────────────────────────────────────── */

interface CatalogItemLite {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
}

function ProductPicker({
  value,
  catalogItemId,
  catalogItems,
  onPick,
  onType,
  onClearCatalog,
}: {
  value: string;
  catalogItemId: string | null;
  catalogItems: CatalogItemLite[];
  onPick: (item: CatalogItemLite) => void;
  onType: (text: string) => void;
  onClearCatalog: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer click afuera.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const items = catalogItems.filter((c) => c.name);
    if (!q) return items.slice(0, 6);
    return items
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [catalogItems, value]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <Input
        value={value}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Ej: iPhone 17 Pro Max"
        iconLeft={
          catalogItemId ? (
            <Package size={13} color={color.success} />
          ) : (
            <Search size={13} />
          )
        }
        iconRight={
          catalogItemId ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearCatalog();
              }}
              aria-label="Quitar producto del catálogo"
              title="Volver a texto libre"
              style={{
                background: "transparent",
                color: color.textMuted,
                fontSize: 11,
                padding: 0,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          ) : undefined
        }
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: color.surface2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            overflow: "hidden",
            zIndex: 20,
            boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {matches.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onPick(m);
                setOpen(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: space[2],
                padding: `${space[2]} ${space[3]}`,
                background: "transparent",
                color: color.text,
                fontSize: text.sm,
                textAlign: "left",
                borderBottom: `1px solid ${color.border}`,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = color.surfaceHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Package size={12} color={color.textMuted} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.name}
              </span>
              {m.category && (
                <span style={{ fontSize: text.xs, color: color.textDim }}>{m.category}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
