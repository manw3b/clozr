import { useMemo, useState } from 'react';
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
import { Search, Plus, Filter, LayoutGrid } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Tabs } from '../../components/Tabs';
import { ClientDrawer } from '../clientes/components/ClientDrawer';
import { LeadCard } from './components/LeadCard';
import { SortableLeadCard } from './components/SortableLeadCard';
import { PipelineColumn, ColumnEmpty } from './components/PipelineColumn';
import { PipelineMetrics } from './components/PipelineMetrics';
import { groupLeadsByStage } from '../../mock/leads';
import { usePipelineLeads, useMoveLead } from './usePipelineData';
import { useClientDetail } from '../clientes/useClientsData';
import { color, space, text, weight } from '../../tokens';
import { STAGES } from '../../types/domain';
import type { Lead, LeadStage } from '../../types/domain';

const priorityFilters = [
  { value: 'todos', label: 'Todos' },
  { value: 'hot', label: '🔥 Calientes' },
  { value: 'high', label: 'Alta' },
  { value: 'stuck', label: 'Estancados' },
];

export function Pipeline() {
  const { data: dbLeads = [] } = usePipelineLeads();
  const moveLeadMut = useMoveLead();
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('todos');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const { data: openClientDetail } = useClientDetail(openClientId);

  // Local optimistic state for drag&drop reorder. Mutation handles persistence.
  const [localLeads, setLocalLeads] = useState<Lead[] | null>(null);
  const leads = localLeads ?? dbLeads;
  const setLeads = (updater: (prev: Lead[]) => Lead[]) => setLocalLeads(updater(leads));

  // Reset local state when server data changes
  useMemo(() => {
    if (!moveLeadMut.isPending) setLocalLeads(null);
    return null;
  }, [dbLeads, moveLeadMut.isPending]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Pequeña distancia para que el click puro no dispare drag
      activationConstraint: { distance: 6 },
    })
  );

  /* ---------- Filtrado ---------- */
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.clientName.toLowerCase().includes(q) &&
          !l.product?.toLowerCase().includes(q)
        )
          return false;
      }
      if (priorityFilter === 'hot' && l.priority !== 'hot') return false;
      if (priorityFilter === 'high' && l.priority !== 'high' && l.priority !== 'hot') return false;
      if (priorityFilter === 'stuck') {
        if (!l.stageChangedAt) return false;
        const days = (Date.now() - new Date(l.stageChangedAt).getTime()) / 86_400_000;
        if (days < 7) return false;
      }
      return true;
    });
  }, [leads, search, priorityFilter]);

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

      // Si están en la misma stage, reordenamos
      if (prev[activeIdx].stage === prev[overIdx].stage) {
        return arrayMove(prev, activeIdx, overIdx);
      }

      // Si no, ya se actualizó la stage en handleDragOver — devolvemos el estado actual
      return prev;
    });

    // Persist stage change to SQLite
    const movedLead = leads.find((l) => l.id === activeId);
    if (movedLead) {
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
            <Button variant="secondary" size="md" iconLeft={<Filter size={14} />}>
              Filtros
            </Button>
            <Button variant="primary" size="md" iconLeft={<Plus size={16} />}>
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
          onChange={setPriorityFilter}
          items={priorityFilters}
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
                onAddLead={() => console.log('Add lead to', stage.id)}
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
                        onWhatsApp={(l) => console.log('WhatsApp', l.id)}
                        onCall={(l) => console.log('Call', l.id)}
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
          onWhatsApp={() => console.log('WhatsApp', openClient.id)}
          onCall={() => console.log('Call', openClient.id)}
          onEmail={() => console.log('Email', openClient.id)}
          onNewSale={() => console.log('New sale', openClient.id)}
          onEdit={() => console.log('Edit', openClient.id)}
          onMarkPaid={(id) => console.log('Mark paid', id)}
        />
      )}
    </div>
  );
}
