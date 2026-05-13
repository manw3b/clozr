import { useEffect, useState } from 'react';
import { Calendar, Eraser } from 'lucide-react';
import { Modal, ModalField } from '../../../components/Modal';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { color, radius, space, text, weight } from '../../../tokens';
import type { StageConfig, ClientType } from '../../../types/domain';

/**
 * Estado serializable de los filtros avanzados del Pipeline. Lo dejamos
 * como interface separada para poder persistir en localStorage (todo
 * son primitivos / arrays).
 */
export interface AdvancedFilters {
  /** Tipos de cliente seleccionados. Vacío = todos. */
  clientTypes: ClientType[];
  /** Monto mínimo en USD. null = sin mínimo. */
  amountMin: number | null;
  /** Monto máximo en USD. null = sin máximo. */
  amountMax: number | null;
  /** IDs de etapas a mostrar. Vacío = todas. */
  stageIds: string[];
  /** Filtra leads cuyo product contiene este texto (case-insensitive). */
  productContains: string;
  /** Sólo leads con visita agendada (visitAt != null). */
  onlyWithVisit: boolean;
  /** Sólo leads con próxima acción dentro de los próximos 7 días. */
  onlyDueThisWeek: boolean;
}

export const EMPTY_FILTERS: AdvancedFilters = {
  clientTypes: [],
  amountMin: null,
  amountMax: null,
  stageIds: [],
  productContains: '',
  onlyWithVisit: false,
  onlyDueThisWeek: false,
};

/** Cuenta cuántos filtros están activos (≠ valor default). Sirve para el
 *  badge "Filtros (3)" en el botón del header. */
export function countActiveFilters(f: AdvancedFilters): number {
  let n = 0;
  if (f.clientTypes.length > 0) n++;
  if (f.amountMin !== null) n++;
  if (f.amountMax !== null) n++;
  if (f.stageIds.length > 0) n++;
  if (f.productContains.trim().length > 0) n++;
  if (f.onlyWithVisit) n++;
  if (f.onlyDueThisWeek) n++;
  return n;
}

const CLIENT_TYPE_OPTIONS: Array<{ value: ClientType; label: string }> = [
  { value: 'final', label: 'Final' },
  { value: 'revendedor', label: 'Revendedor' },
  { value: 'mayorista', label: 'Mayorista' },
  { value: 'empresa', label: 'Empresa' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  filters: AdvancedFilters;
  onApply: (next: AdvancedFilters) => void;
  /** Lista de etapas del workspace para el multi-select. */
  stages: StageConfig[];
}

/**
 * Modal para configurar filtros avanzados del kanban de Pipeline.
 *
 * Se complementa con la búsqueda de texto y los quickFilters (pills) que
 * ya hay arriba del kanban — los avanzados se aplican en cascada con esos.
 *
 * Persistencia: el caller maneja localStorage. Este modal sólo edita
 * un draft local hasta que el usuario aprieta "Aplicar".
 */
export function AdvancedFiltersModal({ open, onClose, filters, onApply, stages }: Props) {
  const [draft, setDraft] = useState<AdvancedFilters>(filters);

  // Sync cuando se abre el modal — capturamos el snapshot actual.
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  function toggleClientType(t: ClientType) {
    setDraft((d) => ({
      ...d,
      clientTypes: d.clientTypes.includes(t)
        ? d.clientTypes.filter((x) => x !== t)
        : [...d.clientTypes, t],
    }));
  }

  function toggleStage(id: string) {
    setDraft((d) => ({
      ...d,
      stageIds: d.stageIds.includes(id)
        ? d.stageIds.filter((x) => x !== id)
        : [...d.stageIds, id],
    }));
  }

  function clearAll() {
    setDraft(EMPTY_FILTERS);
  }

  function apply() {
    onApply(draft);
    onClose();
  }

  const activeCount = countActiveFilters(draft);
  const isDirty = () => activeCount !== countActiveFilters(filters);

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Descartar cambios en los filtros?"
      title="Filtros avanzados"
      maxWidth={560}
      footer={
        <>
          <Button variant="ghost" iconLeft={<Eraser size={14} />} onClick={clearAll}>
            Limpiar todo
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={apply}>
            Aplicar {activeCount > 0 && `(${activeCount})`}
          </Button>
        </>
      }
    >
      {/* Tipo de cliente */}
      <ModalField label="Tipo de cliente">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CLIENT_TYPE_OPTIONS.map((opt) => (
            <ChipToggle
              key={opt.value}
              active={draft.clientTypes.includes(opt.value)}
              onClick={() => toggleClientType(opt.value)}
            >
              {opt.label}
            </ChipToggle>
          ))}
        </div>
      </ModalField>

      {/* Monto */}
      <ModalField label="Monto (USD)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
          <Input
            type="number"
            placeholder="Mínimo"
            value={draft.amountMin ?? ''}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                amountMin: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
            iconLeft={<span style={{ fontSize: 12, fontWeight: weight.semibold }}>US$</span>}
          />
          <Input
            type="number"
            placeholder="Máximo"
            value={draft.amountMax ?? ''}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                amountMax: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
            iconLeft={<span style={{ fontSize: 12, fontWeight: weight.semibold }}>US$</span>}
          />
        </div>
      </ModalField>

      {/* Etapas */}
      <ModalField
        label="Etapas a mostrar"
        hint={
          draft.stageIds.length === 0
            ? 'Sin seleccionar = se muestran todas'
            : `${draft.stageIds.length} de ${stages.length} etapas`
        }
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {stages.map((s) => (
            <ChipToggle
              key={s.id}
              active={draft.stageIds.includes(s.id)}
              onClick={() => toggleStage(s.id)}
            >
              {s.label}
            </ChipToggle>
          ))}
        </div>
      </ModalField>

      {/* Producto */}
      <ModalField label="Producto contiene">
        <Input
          value={draft.productContains}
          onChange={(e) => setDraft((d) => ({ ...d, productContains: e.target.value }))}
          placeholder="iPhone 17 Pro Max, AirPods, etc."
        />
      </ModalField>

      {/* Toggles rápidos */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: space[2],
          marginTop: space[3],
          paddingTop: space[3],
          borderTop: `1px solid ${color.border}`,
        }}
      >
        <ToggleRow
          icon={<Calendar size={14} color={color.success} strokeWidth={2.4} />}
          label="Sólo leads con visita agendada"
          active={draft.onlyWithVisit}
          onClick={() => setDraft((d) => ({ ...d, onlyWithVisit: !d.onlyWithVisit }))}
        />
        <ToggleRow
          icon={<Calendar size={14} color={color.warning} strokeWidth={2.4} />}
          label="Sólo con próxima acción en los próximos 7 días"
          active={draft.onlyDueThisWeek}
          onClick={() => setDraft((d) => ({ ...d, onlyDueThisWeek: !d.onlyDueThisWeek }))}
        />
      </div>
    </Modal>
  );
}

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 11px',
        borderRadius: radius.full,
        border: `1px solid ${active ? color.primary : color.border}`,
        background: active ? color.primaryBg : 'transparent',
        color: active ? color.primary : color.textMuted,
        fontSize: text.xs,
        fontWeight: weight.semibold,
        cursor: 'pointer',
        transition: 'all 120ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        padding: `${space[2]} ${space[3]}`,
        background: active ? color.primaryBg : color.surface2,
        border: `1px solid ${active ? color.primary : color.border}`,
        borderRadius: radius.md,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'all 120ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {icon}
      <span style={{ flex: 1, fontSize: text.sm, color: color.text, fontWeight: weight.medium }}>
        {label}
      </span>
      <span
        style={{
          width: 32,
          height: 18,
          borderRadius: 9,
          background: active ? color.primary : color.surface,
          position: 'relative',
          transition: 'background 140ms',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: active ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 140ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </span>
    </button>
  );
}
