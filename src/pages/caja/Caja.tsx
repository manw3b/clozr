import { useState } from 'react';
import { Plus, Download, Calendar } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
import { CashBalanceCard } from './components/CashBalanceCard';
import { CashFlowCards } from './components/CashFlowCards';
import { CashMovementsList } from './components/CashMovementsList';
import { NewMovementModal } from './components/NewMovementModal';
import { space } from '../../tokens';
import { useCashSummary, useCreateMovement } from './useCashData';
import type { CashSummary, CashMovementKind } from '../../types/domain';

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

  const filteredMovements = summary.movements.filter((m) => {
    if (kindFilter !== 'todos' && m.kind !== kindFilter) return false;
    return true;
  });

  function handleNewMovement(data: any) {
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
          onMovementClick={(m) => console.log('Open movement', m.id)}
        />
      </div>

      {/* Modal */}
      <NewMovementModal
        open={newMovOpen}
        onClose={() => setNewMovOpen(false)}
        onSubmit={handleNewMovement}
      />
    </div>
  );
}
