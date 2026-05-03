import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  MessageCircle,
  Phone,
  MoreHorizontal,
  Users,
  Download,
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Tabs } from '../../components/Tabs';
import { Badge } from '../../components/Badge';
import { Avatar } from '../../components/Avatar';
import { EmptyState } from '../../components/EmptyState';
import { DataTable, applySort, ColumnDef } from '../../components/data-table';
import { RowActions } from '../../components/data-table/RowActions';
import { ClientDrawer } from './components/ClientDrawer';
import { BulkActionBar } from './components/BulkActionBar';
import { useClientsList, useClientDetail, useDeleteClients } from './useClientsData';
import { ClientFormModal } from './components/ClientFormModal';
import { useUIStore } from '../../store/uiStore';
import { color, space, text, weight } from '../../tokens';
import { formatMoney, formatRelative, formatDaysAgo } from '../../lib/format';
import type { Client, ClientType, ClientStatus } from '../../types/domain';

const typeLabels: Record<ClientType, string> = {
  final: 'Final',
  revendedor: 'Revendedor',
  mayorista: 'Mayorista',
  empresa: 'Empresa',
};

const typeFilters: { value: ClientType | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'final', label: 'Final' },
  { value: 'revendedor', label: 'Revendedor' },
  { value: 'mayorista', label: 'Mayorista' },
  { value: 'empresa', label: 'Empresa' },
];

const statusFilters: { value: ClientStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'risk', label: 'En riesgo' },
  { value: 'inactive', label: 'Inactivos' },
];

export function Clientes() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>({
    columnId: 'lastContactAt',
    direction: 'desc',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const { setActiveScreen, showToast } = useUIStore();

  const { data: clientsData = [] } = useClientsList();
  const { data: openClientDetail } = useClientDetail(openClientId);
  const deleteMut = useDeleteClients();

  function exportToCsv(rows: typeof clientsData) {
    const headers = ['Nombre', 'Teléfono', 'Email', 'Tipo', 'Notas'];
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csvRows = [headers.join(',')];
    for (const c of rows) {
      csvRows.push([
        escape(c.name),
        escape(c.phone ?? ''),
        escape(c.email ?? ''),
        escape(c.type ?? ''),
        escape(c.notes ?? ''),
      ].join(','));
    }
    const blob = new Blob(['﻿' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} cliente${ids.length === 1 ? '' : 's'}? Esta acción no se puede deshacer.`)) return;
    deleteMut.mutate(ids, {
      onSuccess: () => {
        showToast(`${ids.length} cliente${ids.length === 1 ? '' : 's'} eliminado${ids.length === 1 ? '' : 's'}`, 'success');
        setSelected(new Set());
      },
      onError: (e) => showToast(e instanceof Error ? e.message : 'Error al eliminar'),
    });
  }

  function handleBulkExport() {
    const ids = selected;
    const rows = clientsData.filter((c) => ids.has(c.id));
    if (rows.length === 0) return;
    exportToCsv(rows);
    showToast(`${rows.length} cliente${rows.length === 1 ? '' : 's'} exportado${rows.length === 1 ? '' : 's'}`, 'success');
  }

  function handleExportAll() {
    if (clientsData.length === 0) return;
    exportToCsv(clientsData);
    showToast(`${clientsData.length} cliente${clientsData.length === 1 ? '' : 's'} exportado${clientsData.length === 1 ? '' : 's'}`, 'success');
  }

  // Open form modal when triggered from topbar "Nuevo > Cliente"
  useEffect(() => {
    const handler = () => { setEditingClient(null); setFormOpen(true); };
    window.addEventListener('clozr:open-new-client', handler);
    return () => window.removeEventListener('clozr:open-new-client', handler);
  }, []);

  /* ---------- Filtrado ---------- */
  const filtered = useMemo(() => {
    return clientsData.filter((c) => {
      if (typeFilter !== 'todos' && c.type !== typeFilter) return false;
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [search, typeFilter, statusFilter]);

  /* ---------- Sort ---------- */
  const sortedRows = useMemo(() => {
    return applySort(filtered, columns, sort, (row, columnId) => {
      const r = row as Client;
      switch (columnId) {
        case 'name':
          return r.name;
        case 'type':
          return r.type;
        case 'lastContactAt':
          return r.lastContactAt ? new Date(r.lastContactAt).getTime() : 0;
        case 'lifetimeValue':
          return r.lifetimeValue || 0;
        case 'balanceDue':
          return r.balanceDue || 0;
        case 'totalPurchases':
          return r.totalPurchases || 0;
        default:
          return '';
      }
    });
  }, [filtered, sort]);

  /* ---------- Drawer ---------- */
  const openClient = openClientDetail ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], height: '100%' }}>
      <PageHeader
        title="Clientes"
        subtitle={`${filtered.length} de ${clientsData.length} ${
          clientsData.length === 1 ? 'cliente' : 'clientes'
        }`}
        actions={
          <>
            <Button variant="secondary" size="md" iconLeft={<Download size={14} />} onClick={handleExportAll}>
              Exportar
            </Button>
            <Button
              variant="primary"
              size="md"
              iconLeft={<Plus size={16} />}
              onClick={() => { setEditingClient(null); setFormOpen(true); }}
            >
              Nuevo cliente
            </Button>
          </>
        }
      />

      {/* Toolbar — búsqueda + filtros */}
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
            placeholder="Buscar por nombre, teléfono o email…"
            iconLeft={<Search size={15} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs
          variant="pills"
          size="sm"
          value={typeFilter}
          onChange={setTypeFilter}
          items={typeFilters.map((f) => ({ value: f.value, label: f.label }))}
        />
        <div style={{ flex: 1 }} />
        <Tabs
          variant="pills"
          size="sm"
          value={statusFilter}
          onChange={setStatusFilter}
          items={statusFilters.map((f) => ({ value: f.value, label: f.label }))}
        />
      </div>

      {/* Bulk action bar (solo si hay selección) */}
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          onSendWhatsApp={() => showToast('Mensaje masivo: próximamente')}
          onAddTag={() => showToast('Etiquetas: próximamente')}
          onExport={handleBulkExport}
          onDelete={handleBulkDelete}
        />
      )}

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DataTable
          rows={sortedRows}
          columns={columns}
          getRowId={(c) => c.id}
          onRowClick={(c) => setOpenClientId(c.id)}
          activeRowId={openClientId || undefined}
          selection={{
            selected,
            onChange: setSelected,
          }}
          sort={sort || undefined}
          onSortChange={setSort}
          density="normal"
          empty={
            <EmptyState
              icon={<Users size={24} />}
              title={search.trim() ? 'Sin resultados' : 'Aún no tenés clientes'}
              description={
                search.trim()
                  ? `No encontramos clientes que coincidan con "${search}"`
                  : 'Agregá tu primer cliente para empezar a registrar ventas y seguimientos.'
              }
              action={
                search.trim()
                  ? { label: 'Limpiar búsqueda', onClick: () => setSearch(''), variant: 'secondary' }
                  : { label: 'Crear cliente', onClick: () => {}, iconLeft: <Plus size={14} /> }
              }
            />
          }
        />
      </div>

      {/* Right Drawer */}
      {openClient && (
        <ClientDrawer
          client={openClient}
          onClose={() => setOpenClientId(null)}
          onWhatsApp={() => {
            if (openClient.phone) {
              const num = openClient.phone.replace(/\D/g, "");
              const final = num.startsWith("54") ? num : `54${num}`;
              window.open(`https://wa.me/${final}`, "_blank");
            }
          }}
          onCall={() => { if (openClient.phone) window.open(`tel:${openClient.phone}`); }}
          onEmail={() => { if (openClient.email) window.open(`mailto:${openClient.email}`); }}
          onNewSale={() => setActiveScreen("sales")}
          onEdit={() => { setEditingClient(openClient); setFormOpen(true); }}
          onMarkPaid={() => {}}
        />
      )}

      <ClientFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        client={editingClient}
      />
    </div>
  );
}

/* ============================================================
 *  Definición de columnas
 * ============================================================ */

const columns: ColumnDef<Client>[] = [
  {
    id: 'name',
    header: 'Cliente',
    sortable: true,
    width: 'minmax(220px, 1.5fr)',
    cell: (c) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], minWidth: 0 }}>
        <Avatar name={c.name} size={32} />
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
            {c.name}
          </div>
          {c.phone && (
            <div
              style={{
                fontSize: text.xs,
                color: color.textMuted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {c.phone}
            </div>
          )}
        </div>
      </div>
    ),
  },
  {
    id: 'type',
    header: 'Tipo',
    sortable: true,
    width: '140px',
    cell: (c) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Badge tone={typeBadgeTone(c.type)} size="sm">
          {typeLabels[c.type]}
        </Badge>
        {c.tags?.includes('VIP') && (
          <Badge tone="primary" size="sm">
            VIP
          </Badge>
        )}
      </div>
    ),
  },
  {
    id: 'lastContactAt',
    header: 'Último contacto',
    sortable: true,
    width: '160px',
    cell: (c) => {
      if (!c.lastContactAt) {
        return <span style={{ color: color.textDim, fontSize: text.sm }}>—</span>;
      }
      const days = Math.floor((Date.now() - new Date(c.lastContactAt).getTime()) / 86_400_000);
      const isStale = days > 30;
      return (
        <span
          style={{
            fontSize: text.sm,
            color: isStale ? color.warning : color.textMuted,
            fontWeight: isStale ? weight.semibold : weight.regular,
          }}
        >
          {days < 1 ? formatRelative(c.lastContactAt) : formatDaysAgo(days)}
        </span>
      );
    },
  },
  {
    id: 'totalPurchases',
    header: 'Compras',
    sortable: true,
    width: '90px',
    align: 'right',
    cell: (c) => (
      <span style={{ fontSize: text.sm, color: color.textMuted, fontVariantNumeric: 'tabular-nums' }}>
        {c.totalPurchases || 0}
      </span>
    ),
  },
  {
    id: 'lifetimeValue',
    header: 'Histórico',
    sortable: true,
    width: '140px',
    align: 'right',
    cell: (c) => (
      <span
        style={{
          fontSize: text.sm,
          color: color.text,
          fontWeight: weight.medium,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {c.lifetimeValue ? formatMoney(c.lifetimeValue) : '—'}
      </span>
    ),
  },
  {
    id: 'balanceDue',
    header: 'Deuda',
    sortable: true,
    width: '140px',
    align: 'right',
    cell: (c) =>
      c.balanceDue && c.balanceDue > 0 ? (
        <span
          style={{
            fontSize: text.sm,
            color: color.danger,
            fontWeight: weight.semibold,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatMoney(c.balanceDue)}
        </span>
      ) : (
        <span style={{ color: color.textDim, fontSize: text.sm }}>—</span>
      ),
  },
  {
    id: 'actions',
    header: '',
    width: '120px',
    align: 'right',
    cell: (c) => (
      <RowActions
        actions={[
          {
            icon: <MessageCircle size={14} strokeWidth={2.2} />,
            label: 'WhatsApp',
            onClick: () => console.log('WhatsApp', c.id),
            tone: 'success',
          },
          {
            icon: <Phone size={14} strokeWidth={2.2} />,
            label: 'Llamar',
            onClick: () => console.log('Call', c.id),
          },
          {
            icon: <MoreHorizontal size={14} strokeWidth={2.2} />,
            label: 'Más',
            onClick: () => console.log('More', c.id),
          },
        ]}
      />
    ),
  },
];

function typeBadgeTone(type: ClientType): 'neutral' | 'info' | 'primary' | 'warning' {
  switch (type) {
    case 'revendedor':
      return 'info';
    case 'mayorista':
      return 'primary';
    case 'empresa':
      return 'warning';
    default:
      return 'neutral';
  }
}
