import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Download, MoreHorizontal, Check, Copy, Eye } from 'lucide-react';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { workspaceSettings } from '../../lib/db/workspaceSettings';
import {
  VISIT_TEMPLATE_KEYS,
  DEFAULT_VISIT_TEMPLATES,
  applyVisitTemplate,
} from '../../lib/visitTemplates';
import { useClientsList } from '../clientes/useClientsData';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { openWhatsApp } from '../../lib/openExternal';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Tabs } from '../../components/Tabs';
import { Badge } from '../../components/Badge';
import { Avatar } from '../../components/Avatar';
import { EmptyState } from '../../components/EmptyState';
import { DataTable, applySort, ColumnDef } from '../../components/data-table';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuLabel,
  useContextMenu,
} from '../../components/ContextMenu';
import { RowActions } from '../../components/data-table/RowActions';
import { SalesMetrics } from './components/SalesMetrics';
import { SalesSparkChart } from './components/SalesSparkChart';
import { SaleDrawer } from './components/SaleDrawer';
import { NewSaleModal } from './components/NewSaleModal';
import { CollectPaymentModal } from '../../components/CollectPaymentModal';
import { buildSalesTimeline } from '../../lib/groupings';
import { useSalesList, useMarkSalePaid, useCreateSale } from './useSalesData';
import { useUIStore } from '../../store/uiStore';
import { exportToCsv, timestamp } from '../../lib/exportCsv';
import { usePersistedState } from '../../lib/usePersistedState';
import { PendingRegularizationBanner } from './components/PendingRegularizationBanner';
import { color, space, text, weight } from '../../tokens';
import { formatMoney, formatRelative } from '../../lib/format';
import { PAYMENT_METHOD_LABELS } from '../../types/domain';
import type { Sale, SaleStatus } from '../../types/domain';

const statusFilters: { value: SaleStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'partial', label: 'Parciales' },
  { value: 'pending', label: 'Pendientes' },
];

const periodFilters = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'all', label: 'Todas' },
];

export function Ventas() {
  const { data: sales = [] } = useSalesList();
  const { data: allClients = [] } = useClientsList();
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? '';
  const markPaidMut = useMarkSalePaid();
  const createSaleMut = useCreateSale();
  const { showToast, setActiveScreen } = useUIStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = usePersistedState<string>('ventas.statusFilter', 'todos');
  const [periodFilter, setPeriodFilter] = usePersistedState<string>('ventas.periodFilter', '30d');
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>({
    columnId: 'createdAt',
    direction: 'desc',
  });
  const [openSaleId, setOpenSaleId] = useState<string | null>(null);
  const ctxMenu = useContextMenu();
  const [ctxSale, setCtxSale] = useState<Sale | null>(null);
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [payingSale, setPayingSale] = useState<Sale | null>(null);

  useEffect(() => {
    const handler = () => setNewSaleOpen(true);
    window.addEventListener('clozr:open-new-sale', handler);
    return () => window.removeEventListener('clozr:open-new-sale', handler);
  }, []);

  // Permite abrir un drawer de venta desde otras pantallas (ej: Caja
  // → click en un movimiento que vino de una venta) disparando el evento
  // `clozr:open-sale` con detail.id.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setOpenSaleId(id);
    };
    window.addEventListener('clozr:open-sale', handler);
    return () => window.removeEventListener('clozr:open-sale', handler);
  }, []);

  /* ---------- Filtrado por período ---------- */
  const periodFiltered = useMemo(() => {
    const now = Date.now();
    if (periodFilter === 'all') return sales;
    let cutoff = 0;
    if (periodFilter === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      cutoff = d.getTime();
    } else if (periodFilter === '7d') {
      cutoff = now - 7 * 86400_000;
    } else if (periodFilter === '30d') {
      cutoff = now - 30 * 86400_000;
    }
    return sales.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
  }, [sales, periodFilter]);

  /* ---------- Filtros adicionales (search + status) ---------- */
  const filtered = useMemo(() => {
    return periodFiltered.filter((s) => {
      if (statusFilter !== 'todos' && s.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.clientName.toLowerCase().includes(q) ||
          s.product.toLowerCase().includes(q) ||
          s.number?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [periodFiltered, search, statusFilter]);

  /* ---------- Sort ---------- */
  const sortedRows = useMemo(() => {
    return applySort(filtered, columns, sort, (row, columnId) => {
      const r = row as Sale;
      switch (columnId) {
        case 'number': return r.number || r.id;
        case 'clientName': return r.clientName;
        case 'amount': return r.amount;
        case 'status': return r.status;
        case 'createdAt': return new Date(r.createdAt).getTime();
        case 'paymentMethod': return r.paymentMethod || '';
        default: return '';
      }
    });
  }, [filtered, sort]);

  const openSale = openSaleId ? sales.find((s) => s.id === openSaleId) : null;
  const timeline = useMemo(() => buildSalesTimeline(periodFiltered, 30), [periodFiltered]);
  const totalPeriod = periodFiltered.reduce((s, x) => s + x.amount, 0);

  // Columna de acciones: el botón ⋯ abre el ContextMenu posicionado en el
  // botón mismo, reusando el mismo state (`ctxSale` + `ctxMenu`) que ya
  // dispara el click derecho. Así una sola fuente de acciones para ambos
  // gestos. Antes el ⋯ tenía un onClick vacío y no hacía nada.
  const tableColumns = useMemo<ColumnDef<Sale>[]>(() => {
    return [
      ...columns,
      {
        id: 'actions',
        header: '',
        width: '60px',
        align: 'right',
        cell: (s) => (
          <RowActions
            actions={[
              {
                icon: <MoreHorizontal size={14} strokeWidth={2.2} />,
                label: 'Más acciones',
                onClick: (e) => {
                  if (!e) return;
                  setCtxSale(s);
                  ctxMenu.openAt(e);
                },
              },
            ]}
          />
        ),
      },
    ];
  }, []);

  /* ---------- Handlers ---------- */
  function handleMarkPaid(saleId: string) {
    markPaidMut.mutate(saleId);
  }

  async function handleNewSale(data: import('./useSalesData').NewSalePayload) {
    await createSaleMut.mutateAsync(data);
    showToast(data.outOfStock ? 'Venta fuera de stock registrada' : 'Venta registrada', 'success');
  }

  /**
   * Manda el mensaje post-venta por WhatsApp: agradecimiento + recordatorio
   * de etiquetar al negocio en redes a cambio del descuento configurable
   * en accesorios. Usa la plantilla del workspace (Ajustes → Plantillas
   * WhatsApp), con fallback al default si nunca la editaron.
   */
  async function handlePostSaleMessage(sale: import('../../types/domain').Sale) {
    const client = allClients.find((c) => c.id === sale.clientId);
    if (!client?.phone) {
      showToast('Este cliente no tiene teléfono registrado', 'error');
      return;
    }
    const settings = await workspaceSettings.getMany(wid, [
      VISIT_TEMPLATE_KEYS.postSale,
      VISIT_TEMPLATE_KEYS.postSaleDiscount,
    ]);
    const body = applyVisitTemplate(
      settings[VISIT_TEMPLATE_KEYS.postSale] ?? DEFAULT_VISIT_TEMPLATES.postSale,
      {
        nombre: sale.clientName,
        producto: sale.product,
        monto: formatMoney(sale.amount, sale.currency),
        descuento: settings[VISIT_TEMPLATE_KEYS.postSaleDiscount] ?? DEFAULT_VISIT_TEMPLATES.postSaleDiscount,
        negocio: activeWorkspace?.name ?? '',
      },
    );
    openWhatsApp(client.phone, body);
  }

  /**
   * Envía un comprobante de compra por WhatsApp para una venta pagada.
   * No usa plantilla del workspace — es un resumen factual de la operación
   * (cliente, producto, total, forma de pago) con un cierre de agradecimiento.
   */
  async function handleSendReceipt(sale: Sale) {
    const client = allClients.find((c) => c.id === sale.clientId);
    if (!client?.phone) {
      showToast('Este cliente no tiene teléfono registrado', 'error');
      return;
    }
    const negocio = activeWorkspace?.name ?? '';
    const metodo = sale.paymentMethod ? PAYMENT_METHOD_LABELS[sale.paymentMethod] : null;
    const lines = [
      negocio ? `🧾 *Comprobante de compra — ${negocio}*` : '🧾 *Comprobante de compra*',
      '',
      `Cliente: ${sale.clientName}`,
      `Producto: ${sale.product}`,
      `Total: ${formatMoney(sale.amount, sale.currency)}`,
      metodo ? `Forma de pago: ${metodo}` : null,
      sale.number ? `Comprobante N° ${sale.number}` : null,
      '',
      '¡Gracias por tu compra! 🙌',
    ].filter((l): l is string => l !== null);
    openWhatsApp(client.phone, lines.join('\n'));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], height: '100%' }}>
      <PageHeader
        title="Ventas"
        subtitle={`${filtered.length} ${filtered.length === 1 ? 'venta' : 'ventas'} · ${formatMoney(totalPeriod, 'USD')} en el período`}
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              iconLeft={<Download size={14} />}
              onClick={() => {
                if (filtered.length === 0) return;
                exportToCsv(`ventas-${timestamp()}.csv`, filtered, [
                  ['Nro', (r) => r.number ?? ''],
                  ['Fecha', (r) => new Date(r.createdAt).toLocaleDateString('es-AR')],
                  ['Cliente', (r) => r.clientName],
                  ['Producto', (r) => r.product],
                  ['Monto', (r) => r.amount],
                  ['Cobrado', (r) => r.paid],
                  ['Pendiente', (r) => r.pending ?? 0],
                  ['Estado', (r) => r.status],
                  ['Método de pago', (r) => r.paymentMethod ?? ''],
                ]);
                showToast(`${filtered.length} ${filtered.length === 1 ? 'venta exportada' : 'ventas exportadas'}`, 'success');
              }}
            >
              Exportar
            </Button>
            <Button
              variant="primary"
              size="md"
              iconLeft={<Plus size={16} />}
              onClick={() => setNewSaleOpen(true)}
            >
              Nueva venta
            </Button>
          </>
        }
      />

      <PendingRegularizationBanner />

      {/* Métricas */}
      <SalesMetrics sales={periodFiltered} />

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260, maxWidth: 400 }}>
          <Input
            placeholder="Buscar por cliente, producto o número…"
            iconLeft={<Search size={15} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs
          variant="pills"
          size="sm"
          value={statusFilter}
          onChange={setStatusFilter}
          items={statusFilters.map((f) => ({ value: f.value, label: f.label }))}
        />
        <div style={{ flex: 1 }} />
        <Tabs
          variant="pills"
          size="sm"
          value={periodFilter}
          onChange={setPeriodFilter}
          items={periodFilters}
        />
      </div>

      {/* Layout: Chart 1/3 + Table 2/3 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)',
          gap: space[4],
        }}
      >
        {/* Sidebar: chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <SalesSparkChart
            data={timeline}
            total={totalPeriod}
            count={periodFiltered.length}
            changePct={12.5}
          />
        </div>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <DataTable
            rows={sortedRows}
            columns={tableColumns}
            getRowId={(s) => s.id}
            onRowClick={(s) => setOpenSaleId(s.id)}
            onRowContextMenu={(s, e) => {
              setCtxSale(s);
              ctxMenu.openAt(e);
            }}
            activeRowId={openSaleId || undefined}
            sort={sort || undefined}
            onSortChange={setSort}
            density="normal"
            empty={
              <EmptyState
                icon={<Search size={24} />}
                title={search.trim() ? 'Sin resultados' : 'Sin ventas en este período'}
                description={search.trim() ? `No encontramos ventas que coincidan con "${search}"` : 'Probá ampliar el período o crear una nueva venta.'}
                action={
                  search.trim()
                    ? { label: 'Limpiar búsqueda', onClick: () => setSearch(''), variant: 'secondary' }
                    : { label: 'Nueva venta', onClick: () => setNewSaleOpen(true), iconLeft: <Plus size={14} /> }
                }
              />
            }
          />
        </div>
      </div>

      {/* Right Drawer */}
      {openSale && (
        <SaleDrawer
          sale={openSale}
          onClose={() => setOpenSaleId(null)}
          onMarkPaid={() => handleMarkPaid(openSale.id)}
          onAddPayment={() => setPayingSale(openSale)}
          onEdit={() => showToast('Editar venta: próximamente')}
          onCancel={() => showToast('Cancelar venta: próximamente')}
          onOpenClient={() => {
            setOpenSaleId(null);
            setActiveScreen('customers');
          }}
          onSendReceipt={() => {
            handleSendReceipt(openSale).catch((e) => {
              showToast(e instanceof Error ? e.message : 'No se pudo abrir WhatsApp', 'error');
            });
          }}
        />
      )}

      {/* Modal Nueva venta */}
      <NewSaleModal
        open={newSaleOpen}
        onClose={() => setNewSaleOpen(false)}
        onSubmit={handleNewSale}
      />

      {/* Modal Cobrar (pago parcial o total) */}
      <CollectPaymentModal
        open={!!payingSale}
        onClose={() => setPayingSale(null)}
        sale={
          payingSale
            ? {
                id: payingSale.id,
                clientName: payingSale.clientName,
                total: payingSale.amount,
                balance: payingSale.amount - payingSale.paid,
                currency: payingSale.currency as 'ARS' | 'USD',
              }
            : null
        }
      />

      {/* Context menu (click derecho en una venta) */}
      {ctxMenu.open && ctxSale && (
        <ContextMenu position={ctxMenu.position} onClose={ctxMenu.close}>
          <ContextMenuLabel>
            {ctxSale.clientName ?? 'Sin cliente'} · {formatMoney(ctxSale.amount, ctxSale.currency)}
          </ContextMenuLabel>
          <ContextMenuItem
            icon={<Eye size={14} />}
            onClick={() => {
              setOpenSaleId(ctxSale.id);
              ctxMenu.close();
            }}
          >
            Ver detalle
          </ContextMenuItem>
          {ctxSale.status !== 'paid' && (
            <ContextMenuItem
              icon={<Check size={14} />}
              onClick={() => {
                markPaidMut.mutate(ctxSale.id);
                showToast('Venta marcada como pagada', 'success');
                ctxMenu.close();
              }}
            >
              Marcar como pagada
            </ContextMenuItem>
          )}
          <ContextMenuItem
            icon={<WhatsAppIcon size={13} color="var(--success)" />}
            onClick={() => {
              const sale = ctxSale;
              ctxMenu.close();
              handlePostSaleMessage(sale).catch((e) => {
                showToast(e instanceof Error ? e.message : 'No se pudo abrir WhatsApp', 'error');
              });
            }}
          >
            Mensaje post-venta
          </ContextMenuItem>
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Copy size={14} />}
            onClick={() => {
              navigator.clipboard.writeText(ctxSale.id).catch(() => {});
              showToast('ID copiado', 'success');
              ctxMenu.close();
            }}
          >
            Copiar ID
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  );
}

/* ============================================================
 *  Columnas
 * ============================================================ */

const columns: ColumnDef<Sale>[] = [
  {
    id: 'number',
    header: 'N°',
    sortable: true,
    width: '90px',
    cell: (s) => (
      <span style={{ fontSize: text.xs, color: color.textMuted, fontWeight: weight.semibold, fontFamily: 'monospace' }}>
        {s.number || s.id}
      </span>
    ),
  },
  {
    id: 'clientName',
    header: 'Cliente',
    sortable: true,
    width: 'minmax(180px, 1.4fr)',
    cell: (s) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], minWidth: 0 }}>
        <Avatar name={s.clientName} size={28} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: text.sm,
              fontWeight: weight.semibold,
              color: color.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {s.clientName}
          </div>
          <div
            style={{
              fontSize: text.xs,
              color: color.textMuted,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {s.product}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'amount',
    header: 'Monto',
    sortable: true,
    width: '140px',
    align: 'right',
    cell: (s) => (
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: text.sm, fontWeight: weight.bold, color: color.text, fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(s.amount, s.currency as 'USD' | 'ARS')}
        </div>
        {s.status === 'partial' && s.pending && (
          <div style={{ fontSize: 10, color: color.warning, fontWeight: weight.semibold, marginTop: 1 }}>
            Falta {formatMoney(s.pending, s.currency as 'USD' | 'ARS')}
          </div>
        )}
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Estado',
    sortable: true,
    width: '120px',
    cell: (s) => {
      if (s.status === 'paid') return <Badge tone="success" size="sm" dot>Pagado</Badge>;
      if (s.status === 'partial') return <Badge tone="warning" size="sm" dot>Parcial</Badge>;
      const overdue = s.dueAt && new Date(s.dueAt).getTime() < Date.now();
      return <Badge tone="danger" size="sm" dot>{overdue ? 'Vencido' : 'Pendiente'}</Badge>;
    },
  },
  {
    id: 'paymentMethod',
    header: 'Pago',
    sortable: true,
    width: '130px',
    cell: (s) => (
      <span style={{ fontSize: text.xs, color: color.textMuted }}>
        {s.paymentMethod ? PAYMENT_METHOD_LABELS[s.paymentMethod] : '—'}
      </span>
    ),
  },
  {
    id: 'createdAt',
    header: 'Fecha',
    sortable: true,
    width: '120px',
    cell: (s) => (
      <span style={{ fontSize: text.xs, color: color.textMuted }}>
        {formatRelative(s.createdAt)}
      </span>
    ),
  },
  // La columna de acciones se construye dentro del componente para tener
  // acceso al ContextMenu (necesita posición + callbacks). Ver buildActionsColumn.
];
