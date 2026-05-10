import { useEffect, useMemo, useState } from 'react';
import { Plus, Copy, Trash2, Wallet, Search, Calendar, ExternalLink, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
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
import { TopExpenseCategories } from './components/TopExpenseCategories';
import { CashSessionChip } from './components/CashSessionChip';
import { CloseCashModal } from './components/CloseCashModal';
import { CASH_CATEGORY_LABELS } from '../../types/domain';
import { space } from '../../tokens';
import { formatMoney } from '../../lib/format';
import {
  useCashSummary,
  useCreateMovement,
  useDeleteMovement,
  useCashSession,
  useCloseCashSession,
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
  const { data: session } = useCashSession();
  const createMovementMut = useCreateMovement();
  const deleteMovementMut = useDeleteMovement();
  const closeCashMut = useCloseCashSession();
  const [closeOpen, setCloseOpen] = useState(false);
  const isClosed = !!session?.closed_at;
  const [kindFilter, setKindFilter] = useState<string>('todos');
  const [currencyFilter, setCurrencyFilter] = useState<'todas' | 'ARS' | 'USD'>('todas');
  const [search, setSearch] = useState('');
  const [newMovOpen, setNewMovOpen] = useState(false);
  // Tipo pre-seleccionado para el próximo "Nuevo movimiento" (lo setea
  // el quick-add de las flow cards).
  const [newMovKind, setNewMovKind] = useState<CashMovementKind>('income');
  const ctxMenu = useContextMenu();
  const [ctxMov, setCtxMov] = useState<CashMovement | null>(null);
  const { showToast, setActiveScreen } = useUIStore();
  const periodLabel = PERIOD_LABELS[period];

  function openQuickAdd(kind: CashMovementKind) {
    setNewMovKind(kind);
    setNewMovOpen(true);
  }

  useEffect(() => {
    const handler = () => setNewMovOpen(true);
    window.addEventListener('clozr:open-new-movement', handler);
    return () => window.removeEventListener('clozr:open-new-movement', handler);
  }, []);

  /**
   * Click en un movimiento que vino de una venta → navegamos a Ventas y
   * disparamos un evento que abre el drawer de esa venta. Si el movimiento
   * NO tiene saleId asociada, no hacemos nada (la card es informativa).
   */
  function handleOpenMovement(m: CashMovement) {
    if (!m.saleId) return;
    setActiveScreen('sales');
    // Diferimos un tick para que Ventas ya esté montado y haya registrado
    // su listener del evento.
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('clozr:open-sale', { detail: { id: m.saleId } }),
      );
    }, 0);
  }

  const filteredMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summary.movements.filter((m) => {
      if (kindFilter !== 'todos' && m.kind !== kindFilter) return false;
      if (currencyFilter !== 'todas' && m.currency !== currencyFilter) return false;
      if (q) {
        // Buscamos en descripción, categoría humana y monto (string).
        const haystack = [
          m.description ?? '',
          CASH_CATEGORY_LABELS[m.category] ?? '',
          String(m.amount),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [summary.movements, kindFilter, currencyFilter, search]);

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
      {/* Animaciones globales de Caja — entrada de cards/filas + hover lift.
          Centralizadas acá para que todos los componentes hijos compartan
          el mismo lenguaje visual sin duplicar keyframes por archivo. */}
      <style>{`
        @keyframes clozr-caja-pop {
          from { opacity: 0; transform: translateY(10px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1);     }
        }
        @keyframes clozr-caja-row {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        @keyframes clozr-caja-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(48,209,88,0); }
          50%      { box-shadow: 0 0 0 6px rgba(48,209,88,0.18); }
        }
        @keyframes clozr-caja-pulse-danger {
          0%, 100% { box-shadow: 0 0 0 0 rgba(232,0,29,0); }
          50%      { box-shadow: 0 0 0 6px rgba(232,0,29,0.18); }
        }
        .clozr-caja-card {
          animation: clozr-caja-pop 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
          transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 240ms cubic-bezier(0.22, 1, 0.36, 1),
                      border-color 240ms;
        }
        .clozr-caja-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
        }
        .clozr-caja-row {
          animation: clozr-caja-row 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .clozr-caja-pulse-income {
          animation: clozr-caja-pulse 2.4s ease-in-out infinite;
        }
        .clozr-caja-pulse-expense {
          animation: clozr-caja-pulse-danger 2.4s ease-in-out infinite;
        }
      `}</style>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            Caja
            <CashSessionChip session={session} />
          </span>
        }
        subtitle={`Balance dual ARS/USD · movimientos ${periodLabel.suffix}`}
        actions={
          <>
            {!isClosed && (
              <Button
                variant="secondary"
                size="md"
                iconLeft={<Calendar size={14} />}
                onClick={() => setCloseOpen(true)}
              >
                Cerrar caja
              </Button>
            )}
            {/* Botones prominentes de alta — verde para ingreso, rojo para
                egreso. Sustituyen al "Nuevo movimiento" único: 1 click menos
                porque el tipo ya viene preseleccionado. */}
            <Button
              variant="success"
              size="md"
              iconLeft={<ArrowUpRight size={16} strokeWidth={2.4} />}
              onClick={() => openQuickAdd('income')}
              disabled={isClosed}
              title={isClosed ? 'La caja está cerrada' : 'Registrar ingreso'}
            >
              Ingreso
            </Button>
            <Button
              variant="danger"
              size="md"
              iconLeft={<ArrowDownRight size={16} strokeWidth={2.4} />}
              onClick={() => openQuickAdd('expense')}
              disabled={isClosed}
              title={isClosed ? 'La caja está cerrada' : 'Registrar egreso'}
            >
              Egreso
            </Button>
          </>
        }
      />

      {/* Balance hero + Flow cards (Ingresos / Egresos / Neto) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)',
          gap: space[3],
        }}
      >
        <CashBalanceCard summary={summary} />
        <CashFlowCards
          summary={summary}
          periodSuffix={periodLabel.suffix}
          onQuickAdd={openQuickAdd}
        />
      </div>

      {/* Top categorías de egreso — sólo aparece si hay egresos */}
      <TopExpenseCategories
        movements={summary.movements}
        periodSuffix={periodLabel.suffix}
      />

      {/* Filtros + búsqueda */}
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
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descripción, categoría o monto…"
            iconLeft={<Search size={14} />}
          />
        </div>
        <Tabs
          variant="pills"
          size="sm"
          value={currencyFilter}
          onChange={(v) => setCurrencyFilter(v as 'todas' | 'ARS' | 'USD')}
          items={[
            { value: 'todas', label: 'Todas' },
            { value: 'ARS', label: 'Pesos' },
            { value: 'USD', label: 'Dólares' },
          ]}
        />
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
          onMovementClick={handleOpenMovement}
          onMovementContextMenu={(m, e) => {
            setCtxMov(m);
            ctxMenu.openAt(e);
          }}
          emptyState={
            search.trim() ? (
              <EmptyState
                icon={<Search size={26} />}
                title="Sin resultados"
                description={`No encontramos movimientos que coincidan con "${search}".`}
                action={{
                  label: 'Limpiar búsqueda',
                  variant: 'secondary',
                  onClick: () => setSearch(''),
                }}
              />
            ) : (
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
                  onClick: () => {
                    setNewMovKind(kindFilter === 'expense' ? 'expense' : 'income');
                    setNewMovOpen(true);
                  },
                }}
              />
            )
          }
        />
      </div>

      {/* Modal */}
      <NewMovementModal
        open={newMovOpen}
        onClose={() => setNewMovOpen(false)}
        initialKind={newMovKind}
        onSubmit={handleNewMovement}
      />

      {/* Modal de cierre / arqueo */}
      <CloseCashModal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        summary={summary}
        onConfirm={async ({ ars, usd }) => {
          await closeCashMut.mutateAsync(
            { ars, usd },
            {
              onSuccess: () => {
                showToast('Caja cerrada · arqueo guardado', 'success');
              },
              onError: (e) => {
                showToast(
                  e instanceof Error ? e.message : 'No se pudo cerrar la caja',
                  'error',
                );
              },
            },
          );
        }}
      />

      {ctxMenu.open && ctxMov && (
        <ContextMenu position={ctxMenu.position} onClose={ctxMenu.close}>
          <ContextMenuLabel>{ctxMov.description || 'Movimiento'}</ContextMenuLabel>
          {ctxMov.saleId && (
            <ContextMenuItem
              icon={<ExternalLink size={14} />}
              onClick={() => {
                const m = ctxMov;
                ctxMenu.close();
                handleOpenMovement(m);
              }}
            >
              Ver venta original
            </ContextMenuItem>
          )}
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
