import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { settingsDb } from '../../lib/db/settings';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  closestCenter,
  type CollisionDetection,
} from '@dnd-kit/core';
// Nota: antes usábamos DragOverlay (fantasma flotante que sigue al cursor)
// y DragStartEvent para trackear activeId. Migramos al modelo "inline sort"
// estilo Trello: la card real se mueve dentro del kanban via CSS transform
// del SortableContext, y las otras se corren para mostrar el destino. Sin
// overlay, sin estado activeId. Más sólido visualmente y menos código.
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Search, Plus, Filter } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Tabs } from '../../components/Tabs';
import { ClientDrawer } from '../clientes/components/ClientDrawer';
import { SortableLeadCard } from './components/SortableLeadCard';
import { PipelineColumn, ColumnEmpty, COLUMN_DEFAULT_WIDTH } from './components/PipelineColumn';
import { PipelineMetrics } from './components/PipelineMetrics';
import { groupLeadsByStage } from '../../lib/groupings';
import { usePipelineLeads, useMoveLead, useSnoozeLead, useAddLeadNote, useScheduleVisit } from './usePipelineData';
import { ScheduleVisitModal, type ScheduleVisitFormData } from './components/ScheduleVisitModal';
import { workspaceSettings } from '../../lib/db/workspaceSettings';
import { qk } from '../../lib/queryKeys';
import {
  VISIT_TEMPLATE_KEYS,
  DEFAULT_VISIT_TEMPLATES,
  applyVisitTemplate,
  formatVisitDay,
  formatVisitTime,
} from '../../lib/visitTemplates';
import { useClientDetail, useRecordContact, useClientsList } from '../clientes/useClientsData';
import { useUIStore } from '../../store/uiStore';
import { useBusinessStore } from '../../store/businessStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAuthStore } from '../../store/authStore';
import { useExchangeRateStore } from '../../store/exchangeRateStore';
import { openWhatsApp, openTel, openMail } from '../../lib/openExternal';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuLabel,
  useContextMenu,
} from '../../components/ContextMenu';
import { ArrowRight, Trophy, XCircle, Clock3, ShoppingCart, Phone, CalendarPlus } from 'lucide-react';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { space } from '../../tokens';
import type { Lead, LeadStage, StageConfig } from '../../types/domain';
import { usePipelineStages } from './usePipelineStages';
import { resolveLeadStage, isOrphanStage } from './resolveLeadStage';
import { NewSaleModal, type NewSalePreset } from '../ventas/components/NewSaleModal';
import { useCreateSale } from '../ventas/useSalesData';
import { NewLeadModal } from './components/NewLeadModal';
import { BulkActionBar } from './components/BulkActionBar';
import {
  AdvancedFiltersModal,
  countActiveFilters,
  EMPTY_FILTERS,
  type AdvancedFilters,
} from './components/AdvancedFiltersModal';

/** IDs únicos de los filtros rápidos. Persistimos el activo en
 *  localStorage para que sobreviva un reload del usuario. */
type QuickFilter =
  | 'todos'
  | 'mis'
  | 'hot'
  | 'high'
  | 'stuck'
  | 'esta-semana'
  | 'sin-accion';

const quickFilters: { value: QuickFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'mis', label: 'Mis leads' },
  { value: 'hot', label: '🔥 Calientes' },
  { value: 'high', label: 'Alta prioridad' },
  { value: 'stuck', label: '⚠ Estancados' },
  { value: 'esta-semana', label: 'Esta semana' },
  { value: 'sin-accion', label: 'Sin próxima acción' },
];

export function Pipeline() {
  const { data: dbLeads = [] } = usePipelineLeads();
  const moveLeadMut = useMoveLead();
  const snoozeLeadMut = useSnoozeLead();
  const scheduleVisitMut = useScheduleVisit();
  // Etapas dinámicas del workspace (configurables desde Ajustes).
  const { stages: STAGES } = usePipelineStages();
  const qcGlobal = useQueryClient();

  // Ancho de columna persistido en localStorage (un valor global, aplica
  // a todas las columnas — el usuario lo arrastra desde cualquiera).
  const [columnWidth, setColumnWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return COLUMN_DEFAULT_WIDTH;
    const saved = window.localStorage.getItem('clozr:pipeline:columnWidth');
    const n = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(n) ? n : COLUMN_DEFAULT_WIDTH;
  });
  function persistColumnWidth(w: number) {
    setColumnWidth(w);
    try {
      window.localStorage.setItem('clozr:pipeline:columnWidth', String(w));
    } catch {
      /* localStorage puede fallar en modo privado — best-effort */
    }
  }
  // Helpers para acciones que necesitan saber qué etapa cuenta como
  // "ganado" o "perdido" — útil porque el usuario pudo renombrar/agregar.
  const wonStage: StageConfig | undefined = STAGES.find((s) => s.isWon);
  const lostStage: StageConfig | undefined = STAGES.find((s) => s.isLost);
  const addNoteMut = useAddLeadNote();
  const { setActiveScreen, showToast } = useUIStore();
  const { activeBusiness } = useBusinessStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { userId } = useAuthStore();
  const businessName = activeBusiness?.name ?? activeWorkspace?.name ?? null;
  const recordContactMut = useRecordContact();
  const { data: allClients = [] } = useClientsList();
  const { usdToArs } = useExchangeRateStore();
  const createSaleMut = useCreateSale();

  // Estado para "Convertir a venta"
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [salePreset, setSalePreset] = useState<NewSalePreset | null>(null);

  // Estado para "Nuevo lead"
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [newLeadStage, setNewLeadStage] = useState<LeadStage>('prospecto');

  // Listener para abrir el modal "Nuevo lead" desde topbar (Nuevo > Lead)
  // y otros disparadores globales. Sin esto el menú navegaba acá pero no
  // abría nada y parecía que no funcionaba.
  useEffect(() => {
    const handler = () => {
      setNewLeadStage('prospecto');
      setNewLeadOpen(true);
    };
    window.addEventListener('clozr:open-new-lead', handler);
    return () => window.removeEventListener('clozr:open-new-lead', handler);
  }, []);

  // Estado para "Agendar visita"
  const [scheduleLead, setScheduleLead] = useState<Lead | null>(null);

  function startConvertToSale(lead: Lead) {
    const fullClient = allClients.find((c) => c.id === lead.clientId);
    // Convertir lead.amount a USD si está en ARS
    let unitPriceUsd: number | undefined;
    if (typeof lead.amount === "number" && lead.amount > 0) {
      if (lead.currency === "USD") {
        unitPriceUsd = lead.amount;
      } else if (lead.currency === "ARS" && usdToArs > 0) {
        unitPriceUsd = Math.round((lead.amount / usdToArs) * 100) / 100;
      } else {
        unitPriceUsd = undefined;
      }
    }
    setConvertingLead(lead);
    setSalePreset({
      client: fullClient,
      unitPriceUsd,
    });
  }

  function whatsappCustomer(
    phone: string | null | undefined,
    customerId: string,
    body?: string,
  ) {
    if (!phone) {
      showToast('Este cliente no tiene teléfono registrado');
      return;
    }
    openWhatsApp(phone, body);
    recordContactMut.mutate({ customerId, kind: 'whatsapp' });
  }

  /**
   * Persiste la visita y arma el body de WhatsApp con la plantilla del
   * workspace (final o mayorista según el tipo de cliente). Devuelve
   * mensaje + código para que el modal lo muestre en la pantalla de
   * confirmación.
   */
  async function handleScheduleSubmit(
    lead: Lead,
    isMayorista: boolean,
    data: ScheduleVisitFormData,
  ): Promise<{ waMessage: string; wholesaleCode: string | null }> {
    const wid = activeWorkspace?.id ?? '';
    const { wholesaleCode } = await scheduleVisitMut.mutateAsync({
      leadId: lead.id,
      visitAt: data.visitAt,
      product: data.product || null,
      isMayorista,
    });

    // Cargar plantilla + dirección del workspace; fallback a defaults.
    const settings = await workspaceSettings.getMany(wid, [
      VISIT_TEMPLATE_KEYS.final,
      VISIT_TEMPLATE_KEYS.mayorista,
      VISIT_TEMPLATE_KEYS.address,
    ]);
    const body = isMayorista
      ? settings[VISIT_TEMPLATE_KEYS.mayorista] ?? DEFAULT_VISIT_TEMPLATES.mayorista
      : settings[VISIT_TEMPLATE_KEYS.final] ?? DEFAULT_VISIT_TEMPLATES.final;

    const waMessage = applyVisitTemplate(body, {
      nombre: lead.clientName,
      equipo: data.product || lead.product,
      dia: formatVisitDay(data.visitAt),
      hora: formatVisitTime(data.visitAt),
      direccion: settings[VISIT_TEMPLATE_KEYS.address] ?? DEFAULT_VISIT_TEMPLATES.address,
      codigo: wholesaleCode,
      negocio: businessName,
    });

    showToast(
      isMayorista && wholesaleCode
        ? `Visita agendada · código ${wholesaleCode}`
        : 'Visita agendada',
      'success',
    );

    return { waMessage, wholesaleCode };
  }

  function callCustomer(phone: string | null | undefined, customerId: string) {
    if (!phone) {
      showToast('Este cliente no tiene teléfono registrado');
      return;
    }
    openTel(phone);
    recordContactMut.mutate({ customerId, kind: 'call' });
  }
  const [search, setSearch] = useState('');
  // Filtro persistido por workspace (cada workspace puede tener su default).
  const filterKey = `clozr.pipeline.filter.${activeWorkspace?.id ?? 'default'}`;
  const [priorityFilter, setPriorityFilterRaw] = useState<QuickFilter>(() => {
    if (typeof window === 'undefined') return 'todos';
    const saved = localStorage.getItem(filterKey);
    return (saved as QuickFilter) ?? 'todos';
  });
  const setPriorityFilter = (f: QuickFilter) => {
    setPriorityFilterRaw(f);
    try {
      localStorage.setItem(filterKey, f);
    } catch { /* ignore */ }
  };

  // Filtros avanzados — persistidos por workspace en localStorage.
  const advFilterKey = `clozr.pipeline.advFilters.${activeWorkspace?.id ?? 'default'}`;
  const [advFilters, setAdvFiltersRaw] = useState<AdvancedFilters>(() => {
    if (typeof window === 'undefined') return EMPTY_FILTERS;
    try {
      const raw = localStorage.getItem(advFilterKey);
      if (!raw) return EMPTY_FILTERS;
      const parsed = JSON.parse(raw) as Partial<AdvancedFilters>;
      // Merge defensivo: si en el futuro agregamos campos nuevos, no
      // rompe a quienes tienen filtros viejos en localStorage.
      return { ...EMPTY_FILTERS, ...parsed };
    } catch {
      return EMPTY_FILTERS;
    }
  });
  const setAdvFilters = (next: AdvancedFilters) => {
    setAdvFiltersRaw(next);
    try {
      localStorage.setItem(advFilterKey, JSON.stringify(next));
    } catch { /* ignore */ }
  };
  const [advFiltersOpen, setAdvFiltersOpen] = useState(false);
  const activeFilterCount = countActiveFilters(advFilters);

  const [openClientId, setOpenClientId] = useState<string | null>(null);

  // Selección múltiple para bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const ctxMenu = useContextMenu();
  const [ctxLead, setCtxLead] = useState<Lead | null>(null);
  const selectionActive = selectedIds.size > 0;
  function toggleSelect(leadId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }
  // Esc limpia la selección
  useEffect(() => {
    if (selectedIds.size === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') clearSelection();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedIds.size]);
  const { data: openClientDetail } = useClientDetail(openClientId);

  // Local optimistic state for drag&drop reorder. Mutation handles persistence.
  const [localLeads, setLocalLeads] = useState<Lead[] | null>(null);
  const rawLeads = localLeads ?? dbLeads;

  // Resolución de etapas huérfanas: si un lead tiene un stage_id que no
  // matchea ninguna columna del workspace (ej: leads creados con la versión
  // anterior que tenían `cerrado` cuando hoy la columna se llama `cobrado`),
  // los rerouteamos a una columna válida — visualmente quedan accesibles
  // y al moverlos se actualiza el id real en DB.
  const leads = useMemo(() => {
    if (STAGES.length === 0) return rawLeads;
    return rawLeads.map((l) => {
      if (!isOrphanStage(l.stage, STAGES)) return l;
      const resolved = resolveLeadStage(l.stage, STAGES);
      return resolved === l.stage ? l : { ...l, stage: resolved };
    });
  }, [rawLeads, STAGES]);

  // Migración silenciosa en DB: para cada lead huérfano, persistimos el
  // stage resuelto. Idempotente (sólo dispara mutate si stage cambia
  // efectivamente), y evita refetch en loop con un ref que recuerda lo
  // que ya migramos en esta sesión.
  const migratedRef = useState<Set<string>>(() => new Set())[0];
  useEffect(() => {
    if (STAGES.length === 0) return;
    for (const l of rawLeads) {
      if (!isOrphanStage(l.stage, STAGES)) continue;
      if (migratedRef.has(l.id)) continue;
      const target = resolveLeadStage(l.stage, STAGES);
      if (target === l.stage) continue;
      migratedRef.add(l.id);
      moveLeadMut.mutate({ leadId: l.id, newStage: target });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawLeads, STAGES]);

  const setLeads = (updater: (prev: Lead[]) => Lead[]) => setLocalLeads(updater(leads));

  // Reset local state when server data changes (and no drag in flight).
  // Effect, NOT memo — setting state inside useMemo causes infinite re-renders.
  useEffect(() => {
    if (!moveLeadMut.isPending) setLocalLeads(null);
  }, [dbLeads, moveLeadMut.isPending]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Pequeña distancia para que el click puro no dispare drag
      activationConstraint: { distance: 6 },
    })
  );

  /**
   * Estrategia de detección de colisión específica para kanban.
   *
   * Para drag de CARDS hay 2 pasos:
   *
   *   PASO 1 — Encontrar la columna destino mirando SOLO columnas.
   *     Antes mirábamos todos los droppables (columnas + cards) y eso
   *     causaba el bug "drop al top de columna no persiste":
   *
   *       Al arrastrar al top de la columna B, el rect de la card se
   *       superpone con (a) un sliver superior chico de la columna B y
   *       (b) las cards adyacentes de la columna A fuente. rectIntersection
   *       devolvía la card de A como winner por mayor área de overlap.
   *       handleDragOver veía overStage === activeStage y hacía return
   *       sin updatear el optimistic. handleDragEnd mutaba con la stage
   *       fuente. El usuario veía "soltó en B, volvió a A".
   *
   *     Filtrando a sólo columnas, gana la que más overlap visual tiene
   *     con la card, sin interferencia de cards adyacentes.
   *
   *   PASO 2 — Dentro de la columna destino, encontrar la card hover
   *     (para preservar reorder vertical dentro de una columna). Si no
   *     hay match, devolvemos la columna sola — el drop persiste igual.
   *
   * Para drag de COLUMNAS (reorder horizontal) usamos cascada estándar
   * sin tocar nada.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const activeId = String(args.active.id);
    const isColumnReorder = activeId.startsWith('col:');

    if (isColumnReorder) {
      const rect = rectIntersection(args);
      if (rect.length > 0) return rect;
      const pointer = pointerWithin(args);
      if (pointer.length > 0) return pointer;
      return closestCenter(args);
    }

    // PASO 1 — resolver columna destino
    const columnContainers = args.droppableContainers.filter(
      (c) => typeof c.id === 'string' && c.id.startsWith('col:'),
    );
    if (columnContainers.length === 0) return [];

    let columnHits = rectIntersection({
      ...args,
      droppableContainers: columnContainers,
    });
    if (columnHits.length === 0) {
      // Fallback si la card todavía no intersecta visualmente ninguna
      // (ej: arranque del drag, transición entre columnas).
      columnHits = closestCenter({
        ...args,
        droppableContainers: columnContainers,
      });
    }
    if (columnHits.length === 0) return [];

    const targetColumnId = String(columnHits[0]?.id ?? '');
    const targetStageId = targetColumnId.slice(4); // quita "col:"

    // PASO 2 — buscar card hover dentro de esa columna (para reorder interno)
    const cardsInTarget = args.droppableContainers.filter((c) => {
      if (typeof c.id !== 'string' || c.id.startsWith('col:')) return false;
      const data = c.data.current as
        | { type?: string; lead?: { stage?: string } }
        | undefined;
      return data?.type === 'lead' && data.lead?.stage === targetStageId;
    });

    if (cardsInTarget.length > 0) {
      const cardHits = rectIntersection({
        ...args,
        droppableContainers: cardsInTarget,
      });
      if (cardHits.length > 0) return cardHits;
    }

    return columnHits;
  };

  /* ---------- Filtrado ---------- */
  // Lookup map cliente.id → cliente para resolver client.type en el filtro
  // avanzado sin pagar O(n²) en arrays grandes.
  const clientById = useMemo(() => {
    const m = new Map(allClients.map((c) => [c.id, c]));
    return m;
  }, [allClients]);

  const filteredLeads = useMemo(() => {
    const now = Date.now();
    const productQ = advFilters.productContains.trim().toLowerCase();
    return leads.filter((l) => {
      // ── Búsqueda de texto (input arriba del kanban) ───────────────
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.clientName.toLowerCase().includes(q) &&
          !l.product?.toLowerCase().includes(q)
        )
          return false;
      }

      // ── Quick filter (pills) ───────────────────────────────────────
      switch (priorityFilter) {
        case 'mis':
          if (l.ownerId !== userId) return false;
          break;
        case 'hot':
          if (l.priority !== 'hot') return false;
          break;
        case 'high':
          if (l.priority !== 'high' && l.priority !== 'hot') return false;
          break;
        case 'stuck': {
          if (!l.stageChangedAt) return false;
          const days = (now - new Date(l.stageChangedAt).getTime()) / 86_400_000;
          if (days < 7) return false;
          break;
        }
        case 'esta-semana': {
          const ref = l.stageChangedAt || l.createdAt;
          const days = (now - new Date(ref).getTime()) / 86_400_000;
          if (days > 7) return false;
          break;
        }
        case 'sin-accion':
          if (l.nextActionAt) return false;
          break;
        case 'todos':
        default:
          break;
      }

      // ── Filtros avanzados (cascada sobre lo anterior) ─────────────
      if (advFilters.clientTypes.length > 0) {
        const t = l.clientType ?? clientById.get(l.clientId)?.type;
        if (!t || !advFilters.clientTypes.includes(t)) return false;
      }
      if (advFilters.amountMin !== null && (l.amount ?? 0) < advFilters.amountMin) return false;
      if (advFilters.amountMax !== null && (l.amount ?? 0) > advFilters.amountMax) return false;
      if (advFilters.stageIds.length > 0 && !advFilters.stageIds.includes(l.stage)) return false;
      if (productQ && !(l.product ?? '').toLowerCase().includes(productQ)) return false;
      if (advFilters.onlyWithVisit && !l.visitAt) return false;
      if (advFilters.onlyDueThisWeek) {
        if (!l.nextActionAt) return false;
        const due = new Date(l.nextActionAt).getTime();
        const days = (due - now) / 86_400_000;
        if (days < 0 || days > 7) return false;
      }

      return true;
    });
  }, [leads, search, priorityFilter, userId, advFilters, clientById]);

  const grouped = useMemo(() => groupLeadsByStage(filteredLeads), [filteredLeads]);
  /* ---------- Drag handlers ---------- */
  function isColumnDrag(id: string) {
    return id.startsWith('col:');
  }
  function stageIdFromDragId(id: string) {
    return id.startsWith('col:') ? id.slice(4) : id;
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Drag de columna → no muta leads, deja que DragEnd reordene.
    if (isColumnDrag(activeId)) return;

    // Encontramos el lead que estamos arrastrando
    const activeLead = leads.find((l) => l.id === activeId);
    if (!activeLead) return;

    // El "over" puede ser otra card, una columna vacía (col:<id>) o el id
    // de stage directo (compat). Resolvemos a un stageId limpio.
    const overLead = leads.find((l) => l.id === overId);
    const overStage = (overLead?.stage || stageIdFromDragId(overId)) as LeadStage;

    // Si está sobre la misma stage, no hacemos nada acá (lo maneja DragEnd para reordenar)
    if (activeLead.stage === overStage) return;

    // Mover entre columnas: actualizamos el stage y le ponemos position al final
    setLeads((prev) => {
      const next = prev.map((l) => (l.id === activeId ? { ...l, stage: overStage } : l));
      return next;
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    // ── Reorder de columnas ─────────────────────────────────────
    if (isColumnDrag(activeId)) {
      const fromStageId = stageIdFromDragId(activeId);
      const toStageId = stageIdFromDragId(overId);
      const fromIdx = STAGES.findIndex((s) => s.id === fromStageId);
      const toIdx = STAGES.findIndex((s) => s.id === toStageId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      const reordered = arrayMove(STAGES, fromIdx, toIdx);
      // Optimistic: actualizamos la query cache para que el render
      // muestre el orden nuevo de inmediato; persistimos en background.
      const wid = activeWorkspace?.id ?? '';
      qcGlobal.setQueryData(qk.pipeline.stages(wid), (old: import('../../lib/db/types').PipelineStage[] | undefined) => {
        if (!old) return old;
        const byId = new Map(old.map((r) => [r.id, r]));
        return reordered
          .map((s, i) => {
            const row = byId.get(s.id);
            return row ? { ...row, stage_order: i } : null;
          })
          .filter((r): r is import('../../lib/db/types').PipelineStage => r !== null);
      });
      // Persistir
      const cached = qcGlobal.getQueryData<import('../../lib/db/types').PipelineStage[]>(qk.pipeline.stages(wid));
      if (cached) {
        settingsDb
          .savePipelineStages(wid, cached)
          .then(() => {
            qcGlobal.invalidateQueries({ queryKey: qk.pipeline.stages(wid) });
            showToast('Orden de etapas guardado', 'success');
          })
          .catch((err) => {
            showToast(err instanceof Error ? err.message : 'No se pudo guardar', 'error');
            qcGlobal.invalidateQueries({ queryKey: qk.pipeline.stages(wid) });
          });
      }
      return;
    }

    // ── Reorder/move de leads ───────────────────────────────────
    // Derivamos el targetStage del `over` actual, NO desde leads[].stage
    // (las setLeads previas pueden no haber flusheado todavía y el closure
    // de leads acá vendría stale, haciendo que moveLeadMut se dispare con
    // la etapa vieja — bug observado al soltar en zona vacía de columna).
    const overData = over.data?.current as
      | { type?: 'lead' | 'column'; lead?: Lead; stageId?: string }
      | undefined;
    let targetStage: LeadStage | null = null;
    if (overData?.type === 'lead' && overData.lead) {
      targetStage = overData.lead.stage;
    } else if (overData?.type === 'column' && overData.stageId) {
      targetStage = overData.stageId;
    } else {
      // Fallback por id: con prefijo "col:" es columna; sin prefijo, es
      // un lead id y buscamos en el state.
      if (overId.startsWith('col:')) {
        targetStage = stageIdFromDragId(overId);
      } else {
        targetStage = leads.find((l) => l.id === overId)?.stage ?? null;
      }
    }
    if (!targetStage) return;

    setLeads((prev) => {
      const activeIdx = prev.findIndex((l) => l.id === activeId);
      if (activeIdx === -1) return prev;
      const activeLead = prev[activeIdx];
      if (!activeLead) return prev;

      const overIdx = prev.findIndex((l) => l.id === overId);
      const overLead = overIdx >= 0 ? prev[overIdx] : null;

      // Si soltamos sobre otra card de la MISMA stage → reorder local.
      if (overLead && activeLead.stage === overLead.stage) {
        return arrayMove(prev, activeIdx, overIdx);
      }
      // Si no, asegurar que el lead quede asignado a targetStage (handleDragOver
      // ya lo hace cuando hay cambio entre columnas, pero al soltar sobre el
      // área vacía de la misma columna o sobre la columna misma sin overLead,
      // nos defendemos también acá).
      if (activeLead.stage !== targetStage) {
        return prev.map((l) => (l.id === activeId ? { ...l, stage: targetStage as LeadStage } : l));
      }
      return prev;
    });

    // Persist stage change a SQLite. Antes había un window.confirm si iba
    // a "perdido", pero window.confirm está bloqueado en Tauri 2 ("dialog.
    // confirm not allowed. Command not found") y tiraba un Uncaught (in
    // promise) cada vez que el usuario arrastraba a Perdido. El drag igual
    // persistía (rowsAffected: 1) pero el error de consola hacía dudar.
    // Solución pragmática: sin confirm — si el user se equivoca, arrastra
    // de vuelta. Toast deja claro que se marcó como perdido.
    moveLeadMut.mutate({ leadId: activeId, newStage: targetStage });
    if (lostStage && targetStage === lostStage.id) {
      const movedLead = leads.find((l) => l.id === activeId);
      showToast(`${movedLead?.clientName ?? 'Lead'} marcado como perdido`);
    }
  }

  /* ---------- Drawer del cliente (real DB) ---------- */
  const openClient = openClientDetail ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], height: '100%' }}>
      <PageHeader
        title="Pipeline"
        subtitle={`${filteredLeads.filter((l) => {
          const cfg = STAGES.find((s) => s.id === l.stage);
          return !cfg?.terminal;
        }).length} leads activos`}
        actions={
          <>
            <Button
              variant={activeFilterCount > 0 ? 'primary' : 'secondary'}
              size="md"
              iconLeft={<Filter size={14} />}
              onClick={() => setAdvFiltersOpen(true)}
              title="Filtros avanzados"
            >
              Filtros
              {activeFilterCount > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    padding: '0 6px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.25)',
                    fontSize: 11,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 18,
                    textAlign: 'center',
                    display: 'inline-block',
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="primary"
              size="md"
              iconLeft={<Plus size={16} />}
              onClick={() => {
                setNewLeadStage('prospecto');
                setNewLeadOpen(true);
              }}
            >
              Nuevo lead
            </Button>
          </>
        }
      />

      <PipelineMetrics leads={filteredLeads} />

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space[3],
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 260, maxWidth: 400 }}>
          <Input
            placeholder="Buscar por cliente o producto…"
            iconLeft={<Search size={15} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs
          variant="pills"
          size="sm"
          value={priorityFilter}
          onChange={(v) => setPriorityFilter(v as QuickFilter)}
          items={quickFilters}
        />
      </div>

      {/* Kanban */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={STAGES.map((s) => `col:${s.id}`)}
          strategy={horizontalListSortingStrategy}
          id="columns"
        >
        <div
          style={{
            display: 'flex',
            gap: space[3],
            overflowX: 'auto',
            flex: 1,
            minHeight: 0,
            paddingBottom: space[2],
          }}
        >
          {STAGES.map((stage) => {
            const stageLeads = grouped[stage.id] || [];
            const totalAmount = stageLeads.reduce((sum, l) => sum + (l.amount || 0), 0);

            return (
              <PipelineColumn
                key={stage.id}
                stage={stage}
                count={stageLeads.length}
                totalAmount={totalAmount}
                isTerminal={stage.terminal}
                width={columnWidth}
                onResize={persistColumnWidth}
                onAddLead={() => {
                  setNewLeadStage(stage.id);
                  setNewLeadOpen(true);
                }}
              >
                <SortableContext
                  items={stageLeads.map((l) => l.id)}
                  strategy={verticalListSortingStrategy}
                  id={stage.id}
                >
                  {stageLeads.length === 0 ? (
                    <ColumnEmpty
                      isTerminal={stage.terminal}
                      onAddLead={
                        stage.terminal
                          ? undefined
                          : () => {
                              setNewLeadStage(stage.id);
                              setNewLeadOpen(true);
                            }
                      }
                    />
                  ) : (
                    stageLeads.map((lead) => (
                      <SortableLeadCard
                        key={lead.id}
                        lead={lead}
                        onClick={(l) => setOpenClientId(l.clientId)}
                        onContextMenu={(l, e) => {
                          setCtxLead(l);
                          ctxMenu.openAt(e);
                        }}
                        onWhatsApp={(l, body) => {
                          const c = allClients.find((x) => x.id === l.clientId);
                          whatsappCustomer(c?.phone ?? null, l.clientId, body);
                        }}
                        businessName={businessName}
                        onCall={(l) => {
                          const c = allClients.find((x) => x.id === l.clientId);
                          callCustomer(c?.phone ?? null, l.clientId);
                        }}
                        onConvertToSale={startConvertToSale}
                        onChangeStage={(l, newStage) => {
                          moveLeadMut.mutate({ leadId: l.id, newStage });
                          const cfg = STAGES.find((s) => s.id === newStage);
                          if (cfg?.isWon) {
                            showToast(`${l.clientName} marcado como ganado 🎯`, 'success');
                          } else if (cfg?.isLost) {
                            showToast(`${l.clientName} marcado como perdido`);
                          }
                        }}
                        onSnooze={(l, days) => {
                          snoozeLeadMut.mutate({ leadId: l.id, days });
                          const labels: Record<number, string> = { 1: 'mañana', 3: 'en 3 días', 7: 'en 1 semana' };
                          showToast(`Pospuesto ${labels[days] ?? `+${days} días`}`, 'success');
                        }}
                        onAddNote={(l, text) => {
                          addNoteMut.mutate({ leadId: l.id, text });
                          showToast('Nota agregada', 'success');
                        }}
                        selected={selectedIds.has(lead.id)}
                        selectionActive={selectionActive}
                        onToggleSelect={(l) => toggleSelect(l.id)}
                      />
                    ))
                  )}
                </SortableContext>
              </PipelineColumn>
            );
          })}
        </div>
        </SortableContext>
      </DndContext>

      {/* Right Drawer */}
      {openClient && (
        <ClientDrawer
          client={openClient}
          onClose={() => setOpenClientId(null)}
          onWhatsApp={() => whatsappCustomer(openClient.phone, openClient.id)}
          onCall={() => callCustomer(openClient.phone, openClient.id)}
          onEmail={() => {
            if (openClient.email) {
              openMail(openClient.email);
              recordContactMut.mutate({ customerId: openClient.id, kind: 'email' });
            } else showToast('Este cliente no tiene email registrado');
          }}
          onNewSale={() => {
            setOpenClientId(null);
            setActiveScreen('sales');
            window.dispatchEvent(new CustomEvent('clozr:open-new-sale'));
          }}
          onEdit={() => showToast('Editar desde Clientes')}
          onMarkPaid={() => showToast('Cobrar desde Deudas')}
        />
      )}

      {/* Crear lead manual */}
      <NewLeadModal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        initialStage={newLeadStage}
      />

      {/* Filtros avanzados (combo con búsqueda + quick filters) */}
      <AdvancedFiltersModal
        open={advFiltersOpen}
        onClose={() => setAdvFiltersOpen(false)}
        filters={advFilters}
        onApply={setAdvFilters}
        stages={STAGES}
      />

      {/* Convertir lead → venta */}
      <NewSaleModal
        open={!!convertingLead}
        onClose={() => {
          setConvertingLead(null);
          setSalePreset(null);
        }}
        preset={salePreset}
        onSubmit={async (data) => {
          await createSaleMut.mutateAsync(data);
          // Mover el lead a la etapa de "ganado" del workspace.
          if (convertingLead && wonStage) {
            try {
              await moveLeadMut.mutateAsync({ leadId: convertingLead.id, newStage: wonStage.id });
            } catch {
              /* si falla el move, la venta igual quedó registrada */
            }
          }
          showToast('Lead convertido a venta', 'success');
          setConvertingLead(null);
          setSalePreset(null);
        }}
      />

      {/* Bulk action bar — flota cuando hay leads seleccionados */}
      {selectionActive && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={clearSelection}
          onChangeStage={(stage) => {
            const ids = Array.from(selectedIds);
            ids.forEach((id) => moveLeadMut.mutate({ leadId: id, newStage: stage }));
            const stageLabel = STAGES.find((s) => s.id === stage)?.label ?? stage;
            showToast(
              `${ids.length} ${ids.length === 1 ? 'lead movido' : 'leads movidos'} a ${stageLabel}`,
              'success',
            );
            clearSelection();
          }}
        />
      )}

      {/* Context menu — click derecho sobre una card */}
      {ctxMenu.open && ctxLead && (() => {
        const lead = ctxLead;
        const phone = allClients.find((c) => c.id === lead.clientId)?.phone ?? null;
        const close = () => ctxMenu.close();
        const moveTo = (stage: typeof lead.stage) => {
          const target = STAGES.find((s) => s.id === stage);
          // Antes había window.confirm para target.isLost — bloqueado en
          // Tauri 2 (mismo issue que handleDragEnd). Sacamos el confirm.
          moveLeadMut.mutate({ leadId: lead.id, newStage: stage });
          if (target?.isWon) showToast(`${lead.clientName} marcado como ganado 🎯`, 'success');
          else if (target?.isLost) showToast(`${lead.clientName} marcado como perdido`);
          close();
        };
        return (
          <ContextMenu position={ctxMenu.position} onClose={close}>
            <ContextMenuLabel>{lead.clientName}</ContextMenuLabel>
            {phone && (
              <ContextMenuItem
                icon={<WhatsAppIcon size={13} color="var(--success)" />}
                onClick={() => {
                  whatsappCustomer(phone, lead.clientId);
                  close();
                }}
              >
                WhatsApp
              </ContextMenuItem>
            )}
            {phone && (
              <ContextMenuItem
                icon={<Phone size={14} />}
                onClick={() => {
                  callCustomer(phone, lead.clientId);
                  close();
                }}
              >
                Llamar
              </ContextMenuItem>
            )}
            <ContextMenuItem
              icon={<CalendarPlus size={14} />}
              onClick={() => {
                setScheduleLead(lead);
                close();
              }}
            >
              Agendar visita
            </ContextMenuItem>
            <ContextMenuItem
              icon={<ShoppingCart size={14} />}
              onClick={() => {
                startConvertToSale(lead);
                close();
              }}
            >
              Convertir a venta
            </ContextMenuItem>
            <ContextMenuDivider />
            <ContextMenuLabel>Posponer</ContextMenuLabel>
            <ContextMenuItem icon={<Clock3 size={14} />} onClick={() => { snoozeLeadMut.mutate({ leadId: lead.id, days: 1 }); showToast('Pospuesto mañana', 'success'); close(); }}>+1 día</ContextMenuItem>
            <ContextMenuItem icon={<Clock3 size={14} />} onClick={() => { snoozeLeadMut.mutate({ leadId: lead.id, days: 3 }); showToast('Pospuesto en 3 días', 'success'); close(); }}>+3 días</ContextMenuItem>
            <ContextMenuItem icon={<Clock3 size={14} />} onClick={() => { snoozeLeadMut.mutate({ leadId: lead.id, days: 7 }); showToast('Pospuesto en 1 semana', 'success'); close(); }}>+1 semana</ContextMenuItem>
            <ContextMenuDivider />
            <ContextMenuLabel>Mover a</ContextMenuLabel>
            {STAGES.filter((s) => !s.terminal && s.id !== lead.stage).map((s) => (
              <ContextMenuItem key={s.id} icon={<ArrowRight size={12} />} onClick={() => moveTo(s.id)}>
                {s.label}
              </ContextMenuItem>
            ))}
            <ContextMenuDivider />
            {wonStage && lead.stage !== wonStage.id && (
              <ContextMenuItem icon={<Trophy size={14} />} onClick={() => moveTo(wonStage.id)}>
                Marcar como ganado
              </ContextMenuItem>
            )}
            {lostStage && lead.stage !== lostStage.id && (
              <ContextMenuItem tone="danger" icon={<XCircle size={14} />} onClick={() => moveTo(lostStage.id)}>
                Marcar como perdido
              </ContextMenuItem>
            )}
          </ContextMenu>
        );
      })()}

      {/* Agendar visita — modal con preview de WA */}
      <ScheduleVisitModal
        open={!!scheduleLead}
        lead={scheduleLead}
        isMayorista={(() => {
          if (!scheduleLead) return false;
          const c = allClients.find((x) => x.id === scheduleLead.clientId);
          return c?.type === 'mayorista';
        })()}
        onClose={() => setScheduleLead(null)}
        onSubmit={async (data) => {
          if (!scheduleLead) throw new Error('no lead');
          const c = allClients.find((x) => x.id === scheduleLead.clientId);
          const isMayorista = c?.type === 'mayorista';
          return handleScheduleSubmit(scheduleLead, isMayorista, data);
        }}
        onSendWhatsApp={(message) => {
          if (!scheduleLead) return;
          const c = allClients.find((x) => x.id === scheduleLead.clientId);
          whatsappCustomer(c?.phone ?? null, scheduleLead.clientId, message);
        }}
      />
    </div>
  );
}
