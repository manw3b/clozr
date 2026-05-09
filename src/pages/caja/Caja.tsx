import { useEffect, useState } from 'react';
import { Plus, Download, Calendar, Copy } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuLabel,
  useContextMenu,
} from '../../components/ContextMenu';
import { useUIStore } from '../../store/uiStore';
import { CashBalanceCard } from './components/CashBalanceCard';
import { CashFlowCards } from './components/CashFlowCards';
import { CashMovementsList } from './components/CashMovementsList';
import { NewMovementModal } from './components/NewMovementModal';
import { space } from '../../tokens';
import { formatMoney } from '../../lib/format';
import { useCashSummary, useCreateMovement } from './useCashData';
import type { CashSummary, CashMovement, CashMovementKind, CashCategory, PaymentMethod } from '../../types/domain';

const EMPTY_SUMMARY: CashSummary = {
  date: new Date().toISOString().slice(0, 10),
  openingBalance: { ars: 0, usd: 0 },
  totalIncome: { ars: 0, usd: 0 },
  totalExpense: { ars: 0, usd: 0 },
  currentBalance: { ars: 0, usd: 0 },
  usdRate: 1,
  movements: [],
};

const periodFilters = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
];

const kindFilters: { value: 'todos' | CashMovementKind; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Egresos' },
];

export function Caja() {
  const { data: summary = EMPTY_SUMMARY } = useCashSummary();
  const createMovementMut = useCreateMovement();
  const [period, setPeriod] = useState('today');
  const [kindFilter, setKindFilter] = useState<string>('todos');
  const [newMovOpen, setNewMovOpen] = useState(false);
  const ctxMenu = useContextMenu();
  const [ctxMov, setCtxMov] = useState<CashMovement | null>(null);
  const { showToast } = useUIStore();

  useEffect(() => {
    const handler = () => setNewMovOpen(true);
    window.addEventListener('clozr:open-new-movement', handler);
    return () => window.removeEventListener('clozr:open-new-movement', handler);
  }, []);

  const filteredMovements = summary.movements.filter((m) => {
    if (kindFilter !== 'todos' && m.kind !== kindFilter) return false;
    return true;
  });

  function handleNewMovement(data: {
    kind: CashMovementKind;
    amount: number;
    currency: 'ARS' | 'USD';
    description: string;
    category: CashCategory;
    paymentMethod?: PaymentMethod;
  }) {
    createMovementMut.mutate(
      {
        kind: data.kind,
        amount: data.amount,
        currency: data.currency,
        category: data.category,
        description: data.description ?? '',
      },
      { onSuccess: () => setNewMovOpen(false) },
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], height: '100%' }}>
      <PageHeader
        title="Caja"
        subtitle="Balance dual ARS/USD · movimientos del día"
        actions={
          <>
            <Button variant="secondary" size="md" iconLeft={<Calendar size={14} />}>
              Cerrar caja
            </Button>
            <Button variant="secondary" size="md" iconLeft={<Download size={14} />}>
              Exportar
            </Button>
            <Button
              variant="primary"
              size="md"
              iconLeft={<Plus size={16} />}
              onClick={() => setNewMovOpen(true)}
            >
              Nuevo movimiento
            </Button>
          </>
        }
      />

      {/* Balance hero + Flow cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
          gap: space[3],
        }}
      >
        <CashBalanceCard summary={summary} />
        <CashFlowCards summary={summary} />
      </div>

      {/* Filtros */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space[3],
          flexWrap: 'wrap',
        }}
      >
        <Tabs variant="pills" size="sm" value={period} onChange={setPeriod} items={periodFilters} />
        <div style={{ flex: 1 }} />
        <Tabs
          variant="pills"
          size="sm"
          value={kindFilter}
          onChange={setKindFilter}
          items={kindFilters.map((f) => ({ value: f.value, label: f.label }))}
        />
      </div>

      {/* Lista de movimientos */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <CashMovementsList
          movements={filteredMovements}
          onMovementClick={() => { /* Detalle de movimiento: próxima iteración */ }}
          onMovementContextMenu={(m, e) => {
            setCtxMov(m);
            ctxMenu.openAt(e);
          }}
        />
      </div>

      {/* Modal */}
      <NewMovementModal
        open={newMovOpen}
        onClose={() => setNewMovOpen(false)}
        onSubmit={handleNewMovement}
      />

      {ctxMenu.open && ctxMov && (
        <ContextMenu position={ctxMenu.position} onClose={ctxMenu.close}>
          <ContextMenuLabel>{ctxMov.description || 'Movimiento'}</ContextMenuLabel>
          <ContextMenuItem
            icon={<Copy size={14} />}
            onClick={() => {
              navigator.clipboard.writeText(formatMoney(ctxMov.amount, ctxMov.currency)).then(
                () => showToast('Monto copiado', 'success'),
                () => showToast('No se pudo copiar', 'error'),
              );
              ctxMenu.close();
            }}
          >
            Copiar monto
          </ContextMenuItem>
          {ctxMov.description && (
            <ContextMenuItem
              icon={<Copy size={14} />}
              onClick={() => {
                navigator.clipboard.writeText(ctxMov.description).then(
                  () => showToast('Descripción copiada', 'success'),
                  () => showToast('No se pudo copiar', 'error'),
                );
                ctxMenu.close();
              }}
            >
              Copiar descripción
            </ContextMenuItem>
          )}
        </ContextMenu>
      )}
    </div>
  );
}
