import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, Flame } from "lucide-react";
import { Modal, ModalField } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { Input, Select } from "../../../components/Input";
import { DateTimePicker } from "../../../components/DateTimePicker";
import { Avatar } from "../../../components/Avatar";
import { Badge } from "../../../components/Badge";
import { customersDb } from "../../../lib/db/customers";
import { pipelineDb } from "../../../lib/db/pipeline";
import { useUIStore } from "../../../store/uiStore";
import { useWorkspaceStore } from "../../../store/workspaceStore";
import { useAuthStore } from "../../../store/authStore";
import { useClientsList } from "../../clientes/useClientsData";
import { invalidate } from "../../../lib/queryKeys";
import { color, radius, space, text, weight } from "../../../tokens";
import { STAGES } from "../../../types/domain";
import type { Client, LeadStage, LeadPriority } from "../../../types/domain";

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

  const [clientSearch, setClientSearch] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);

  const [stage, setStage] = useState<LeadStage>(initialStage);
  const [product, setProduct] = useState("");
  const [estimatedUsd, setEstimatedUsd] = useState("");
  const [priority, setPriority] = useState<LeadPriority>("medium");
  const [nextActionLabel, setNextActionLabel] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [shortNote, setShortNote] = useState("");

  const { data: allClients = [] } = useClientsList();

  // reset al abrir + sincronizar etapa inicial
  useEffect(() => {
    if (open) {
      setStage(initialStage);
      setClient(null);
      setClientSearch("");
      setCreatingClient(false);
      setProduct("");
      setEstimatedUsd("");
      setPriority("medium");
      setNextActionLabel("");
      setNextActionAt("");
      setShortNote("");
    }
  }, [open, initialStage]);

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
    !!nextActionAt;

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
        <ModalField label="Producto / interés">
          <Input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="Ej: iPhone 17 Pro Max"
          />
        </ModalField>
        <ModalField label="Valor estimado (USD)">
          <Input
            type="number"
            step="0.01"
            value={estimatedUsd}
            onChange={(e) => setEstimatedUsd(e.target.value)}
            placeholder="Ej: 1300"
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
            <Badge tone="info" size="sm">
              {client.type}
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
