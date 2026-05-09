import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Search, Plus, Filter } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Tabs } from '../../components/Tabs';
import { ClientDrawer } from '../clientes/components/ClientDrawer';
import { LeadCard } from './components/LeadCard';
import { SortableLeadCard } from './components/SortableLeadCard';
import { PipelineColumn, ColumnEmpty } from './components/PipelineColumn';
import { PipelineMetrics } from './components/PipelineMetrics';
import { groupLeadsByStage } from '../../lib/groupings';
import { usePipelineLeads, useMoveLead, useSnoozeLead, useAddLeadNote } from './usePipelineData';
import { useClientDetail, useRecordContact, useClientsList } from '../clientes/useClientsData';
import { useUIStore } from '../../store/uiStore';
import { useBusinessStore } from '../../store/businessStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAuthStore } from '../../store/authStore';
import { useExchangeRateStore } from '../../store/exchangeRateStore';
import { space } from '../../tokens';
import { STAGES } from '../../types/domain';
import type { Lead, LeadStage } from '../../types/domain';
import { NewSaleModal, type NewSalePreset } from '../ventas/components/NewSaleModal';
import { useCreateSale } from '../ventas/useSalesData';
import { NewLeadModal } from './components/NewLeadModal';

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
    const num = phone.replace(/\D/g, '');
    const final = num.startsWith('54') ? num : `54${num}`;
    const url = body
      ? `https://wa.me/${final}?text=${encodeURIComponent(body)}`
      : `https://wa.me/${final}`;
    window.open(url, '_blank');
    recordContactMut.mutate({ customerId, kind: 'whatsapp' });
  }

  function callCustomer(phone: string | null | undefined, customerId: string) {
    if (!phone) {
      showToast('Este cliente no tiene teléfono registrado');
      return;
    }
    window.open(`tel:${phone}`);
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const { data: openClientDetail } = useClientDetail(openClientId);

  // Local optimistic state for drag&drop reorder. Mutation handles persistence.
  const [localLeads, setLocalLeads] = useState<Lead[] | null>(null);
  const leads = localLeads ?? dbLeads;
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

  /* ---------- Filtrado ---------- */
  const filteredLeads = useMemo(() => {
    const now = Date.now();
    return leads.filter((l) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.clientName.toLowerCase().includes(q) &&
          !l.product?.toLowerCase().includes(q)
        )
          return false;
      }
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
      return true;
    });
  }, [leads, search, priorityFilter, userId]);

  const grouped = useMemo(() => groupLeadsByStage(filteredLeads), [filteredLeads]);
  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  /* ---------- Drag handlers ---------- */
  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Encontramos el lead que estamos arrastrando
    const activeLead = leads.find((l) => l.id === activeId);
    if (!activeLead) return;

    // El "over" puede ser otra card (mismo column o distinto) O una columna vacía
    const overLead = leads.find((l) => l.id === overId);
    const overStage = (overLead?.stage || (overId as LeadStage)) as LeadStage;

    // Si está sobre la misma stage, no hacemos nada acá (lo maneja DragEnd para reordenar)
    if (activeLead.stage === overStage) return;

    // Mover entre columnas: actualizamos el stage y le ponemos position al final
    setLeads((prev) => {
      const next = prev.map((l) => (l.id === activeId ? { ...l, stage: overStage } : l));
      return next;
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    setLeads((prev) => {
      const activeIdx = prev.findIndex((l) => l.id === activeId);
      const overIdx = prev.findIndex((l) => l.id === overId);
      if (activeIdx === -1 || overIdx === -1) return prev;

      const activeLead = prev[activeIdx];
      const overLead = prev[overIdx];
      if (!activeLead || !overLead) return prev;

      // Si están en la misma stage, reordenamos
      if (activeLead.stage === overLead.stage) {
        return arrayMove(prev, activeIdx, overIdx);
      }

      // Si no, ya se actualizó la stage en handleDragOver — devolvemos el estado actual
      return prev;
    });

    // Persist stage change to SQLite. Confirm si se mueve a "perdido"
    // — fácil hacerlo por accidente con el drag.
    const movedLead = leads.find((l) => l.id === activeId);
    if (movedLead) {
      if (movedLead.stage === 'perdido') {
        const ok = window.confirm(
          `¿Marcar el lead de ${movedLead.clientName} como perdido?`,
        );
        if (!ok) {
          // Revertir el optimistic update local — descartamos los cambios
          // visuales del drag y dejamos que el próximo render use dbLeads.
          setLocalLeads(null);
          return;
        }
      }
      moveLeadMut.mutate({ leadId: activeId, newStage: movedLead.stage });
    }
  }

  /* ---------- Drawer del cliente (real DB) ---------- */
  const openClient = openClientDetail ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], height: '100%' }}>
      <PageHeader
        title="Pipeline"
        subtitle={`${filteredLeads.filter((l) => l.stage !== 'cerrado' && l.stage !== 'perdido').length} leads activos`}
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              iconLeft={<Filter size={14} />}
              onClick={() => showToast('Filtros avanzados: próximamente')}
            >
              Filtros
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
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
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
                    <ColumnEmpty />
                  ) : (
                    stageLeads.map((lead) => (
                      <SortableLeadCard
                        key={lead.id}
                        lead={lead}
                        onClick={(l) => setOpenClientId(l.clientId)}
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
                          if (newStage === 'cerrado') {
                            showToast(`${l.clientName} marcado como ganado 🎯`, 'success');
                          } else if (newStage === 'perdido') {
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
                      />
                    ))
                  )}
                </SortableContext>
              </PipelineColumn>
            );
          })}
        </div>

        {/* Overlay que sigue al cursor durante drag */}
        <DragOverlay>
          {activeLead && <LeadCard lead={activeLead} isOverlay />}
        </DragOverlay>
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
              window.open(`mailto:${openClient.email}`);
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
          // Mover el lead a "cerrado" automáticamente
          if (convertingLead) {
            try {
              await moveLeadMut.mutateAsync({ leadId: convertingLead.id, newStage: 'cerrado' });
            } catch {
              /* si falla el move, la venta igual quedó registrada */
            }
          }
          showToast('Lead convertido a venta', 'success');
          setConvertingLead(null);
          setSalePreset(null);
        }}
      />
    </div>
  );
}
