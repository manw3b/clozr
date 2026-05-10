import { useEffect, useState } from 'react';
import { Plus, Copy, Trash2, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
import { EmptyState } from '../../components/EmptyState';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuDivider,
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
import {
  useCashSummary,
  useCreateMovement,
  useDeleteMovement,
  type CashPeriod,
} from './useCashData';
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

const periodFilters: { value: CashPeriod; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
];

const kindFilters: { value: 'todos' | CashMovementKind; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Egresos' },
];

/** Labels que dependen del período seleccionado. Centralizados acá para
 *  que el header, las cards y el título de la lista de movimientos digan
 *  todos lo mismo. */
const PERIOD_LABELS: Record<CashPeriod, { suffix: string; verbose: string }> = {
  today: { suffix: 'del día', verbose: 'hoy' },
  week: { suffix: 'de esta semana', verbose: 'esta semana' },
  month: { suffix: 'de este mes', verbose: 'este mes' },
};

export function Caja() {
  const [period, setPeriod] = useState<CashPeriod>('today');
  const { data: summary = EMPTY_SUMMARY } = useCashSummary(period);
  const createMovementMut = useCreateMovement();
  const deleteMovementMut = useDeleteMovement();
  const [kindFilter, setKindFilter] = useState<string>('todos');
  const [newMovOpen, setNewMovOpen] = useState(false);
  const ctxMenu = useContextMenu();
  const [ctxMov, setCtxMov] = useState<CashMovement | null>(null);
  const { showToast } = useUIStore();
  const periodLabel = PERIOD_LABELS[period];

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
        subtitle={`Balance dual ARS/USD · movimientos ${periodLabel.suffix}`}
        actions={
          <Button
            variant="primary"
            size="md"
            iconLeft={<Plus size={16} />}
            onClick={() => setNewMovOpen(true)}
          >
            Nuevo movimiento
          </Button>
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
        <CashFlowCards summary={summary} periodSuffix={periodLabel.suffix} />
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
        <Tabs
          variant="pills"
          size="sm"
          value={period}
          onChange={(v) => setPeriod(v as CashPeriod)}
          items={periodFilters}
        />
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
          title="Movimientos"
          subtitle={periodLabel.suffix}
          onMovementClick={() => { /* Detalle de movimiento: próxima iteración */ }}
          onMovementContextMenu={(m, e) => {
            setCtxMov(m);
            ctxMenu.openAt(e);
          }}
          emptyState={
            <EmptyState
              icon={<Wallet size={28} />}
              title={
                kindFilter === 'todos'
                  ? `Sin movimientos ${periodLabel.verbose}`
                  : kindFilter === 'income'
                  ? `Sin ingresos ${periodLabel.verbose}`
                  : `Sin egresos ${periodLabel.verbose}`
              }
              description="Cargá un ingreso o un egreso para que se refleje en el balance."
              action={{
                label: 'Cargar movimiento',
                iconLeft: <Plus size={14} />,
                onClick: () => setNewMovOpen(true),
              }}
            />
          }
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
          <ContextMenuDivider />
          <ContextMenuItem
            tone="danger"
            icon={<Trash2 size={14} />}
            onClick={() => {
              const m = ctxMov;
              ctxMenu.close();
              const sign = m.kind === 'income' ? '+' : '−';
              const ok = window.confirm(
                `¿Eliminar este movimiento?\n\n${sign}${formatMoney(m.amount, m.currency)} · ${m.description || 'sin descripción'}\n\nEsta acción no se puede deshacer.`,
              );
              if (!ok) return;
              deleteMovementMut.mutate(m.id, {
                onSuccess: () => showToast('Movimiento eliminado', 'success'),
                onError: (e) =>
                  showToast(
                    e instanceof Error ? e.message : 'No se pudo eliminar',
                    'error',
                  ),
              });
            }}
          >
            Eliminar movimiento
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  );
}
