import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, MoreHorizontal, Users, Download, Upload, Tag as TagIcon, ChevronDown, DollarSign } from 'lucide-react';
import { colorCss } from '../../lib/colorPalette';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Tabs } from '../../components/Tabs';
import { Badge } from '../../components/Badge';
import { Avatar } from '../../components/Avatar';
import { TagChip } from '../../components/TagChip';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuLabel,
  useContextMenu,
} from '../../components/ContextMenu';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { Phone, Pencil, Trash2, Mail, Copy } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { DataTable, applySort, ColumnDef } from '../../components/data-table';
import { ClientDrawer } from './components/ClientDrawer';
import { BulkActionBar } from './components/BulkActionBar';
import { useClientsList, useClientDetail, useDeleteClients, useRecordContact, useCustomerTags } from './useClientsData';
import { ClientFormModal } from './components/ClientFormModal';
import { ImportClientsModal } from './components/ImportClientsModal';
import { NewSaleModal } from '../ventas/components/NewSaleModal';
import { useCreateSale } from '../ventas/useSalesData';
import { CustomerWaQuickPicker } from '../../components/CustomerWaQuickPicker';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { useUIStore } from '../../store/uiStore';
import { openWhatsApp, openTel, openMail } from '../../lib/openExternal';
import { exportToCsv as exportCsv, timestamp as csvTimestamp } from '../../lib/exportCsv';
import { usePersistedState } from '../../lib/usePersistedState';
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
  const [typeFilter, setTypeFilter] = usePersistedState<string>('clientes.typeFilter', 'todos');
  const [statusFilter, setStatusFilter] = usePersistedState<string>('clientes.statusFilter', 'todos');
  const [tagFilter, setTagFilter] = usePersistedState<string>('clientes.tagFilter', 'todos');
  const [sort, setSort] = usePersistedState<{ columnId: string; direction: 'asc' | 'desc' } | null>(
    'clientes.sort',
    { columnId: 'lastContactAt', direction: 'desc' },
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  // Cierre rápido: cuando es no-null, abrimos NewSaleModal con preset.client.
  // Disparado desde el botón $ de la fila, del context menu y del footer del
  // drawer — todas son la misma acción mental: "venta para ESTE cliente".
  const [saleClient, setSaleClient] = useState<Client | null>(null);
  // Estado para el modal de confirmación de borrado:
  //  - { kind: 'single', client } → borrar UNO con su nombre como confirm
  //  - { kind: 'bulk', ids }      → borrar VARIOS, requiere tipear "ELIMINAR N"
  // null = cerrado.
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: 'single'; client: Client }
    | { kind: 'bulk'; ids: string[] }
    | null
  >(null);
  const { showToast } = useUIStore();
  const createSaleMut = useCreateSale();

  // Context menu (right-click) state — sostiene el client objetivo y la
  // posición. Se cierra al elegir cualquier item o click outside.
  const ctxMenu = useContextMenu();
  const [ctxClient, setCtxClient] = useState<Client | null>(null);

  const { data: clientsData = [] } = useClientsList();
  const { data: openClientDetail } = useClientDetail(openClientId);
  const { data: allTags = [] } = useCustomerTags();
  const deleteMut = useDeleteClients();
  const recordContactMut = useRecordContact();

  function exportToCsv(rows: typeof clientsData) {
    exportCsv(`clientes-${csvTimestamp()}.csv`, rows, [
      ['Nombre', (c) => c.name],
      ['Teléfono', (c) => c.phone ?? ''],
      ['Email', (c) => c.email ?? ''],
      ['Tipo', (c) => c.type ?? ''],
      ['Etiquetas', (c) => (c.tags ?? []).map((t) => t.name).join(' · ')],
      ['Notas', (c) => c.notes ?? ''],
    ]);
  }

  function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setConfirmDelete({ kind: 'bulk', ids });
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

  // Open client drawer when triggered from CommandPalette
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id) setOpenClientId(detail.id);
    };
    window.addEventListener('clozr:open-client', handler);
    return () => window.removeEventListener('clozr:open-client', handler);
  }, []);

  /* ---------- Filtrado ---------- */
  const filtered = useMemo(() => {
    return clientsData.filter((c) => {
      if (typeFilter !== 'todos' && c.type !== typeFilter) return false;
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (tagFilter !== 'todos') {
        const ids = (c.tags ?? []).map((t) => t.id);
        if (!ids.includes(tagFilter)) return false;
      }
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
  }, [clientsData, search, typeFilter, statusFilter, tagFilter]);

  /* ---------- Columns con actions (cierre rápido + WA picker) ---------- */
  // Mergeamos las columnas base con una columna de actions que tiene closure
  // sobre las setters del componente (saleClient, recordContact, etc.). Las
  // columnas base están a nivel módulo para que applySort las pueda usar.
  const columns = useMemo<ColumnDef<Client>[]>(
    () => [
      ...baseColumns,
      {
        id: 'actions',
        header: '',
        width: '150px',
        align: 'right',
        cell: (c) => (
          <div
            className="row-quick-actions"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <CustomerWaQuickPicker
              client={{ id: c.id, name: c.name, phone: c.phone ?? null }}
              variant="small"
              onSend={(body) => {
                if (!c.phone) return;
                openWhatsApp(c.phone, body);
                recordContactMut.mutate({ customerId: c.id, kind: 'whatsapp' });
              }}
            />
            <RowIconBtn
              ariaLabel="Llamar"
              disabled={!c.phone}
              onClick={() => {
                if (!c.phone) return;
                openTel(c.phone);
                recordContactMut.mutate({ customerId: c.id, kind: 'call' });
              }}
            >
              <Phone size={13} strokeWidth={2.2} color="var(--text-muted)" />
            </RowIconBtn>
            <RowIconBtn
              ariaLabel="Nueva venta"
              tone="success"
              onClick={() => setSaleClient(c)}
            >
              <DollarSign size={13} strokeWidth={2.4} color="var(--success)" />
            </RowIconBtn>
            <RowIconBtn
              ariaLabel="Más"
              onClick={() => setOpenClientId(c.id)}
            >
              <MoreHorizontal size={14} strokeWidth={2.2} color="var(--text-muted)" />
            </RowIconBtn>
          </div>
        ),
      },
    ],
    [recordContactMut],
  );

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
  }, [filtered, sort, columns]);

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
            <Button variant="ghost" size="md" iconLeft={<Upload size={14} />} onClick={() => setImportOpen(true)}>
              Importar
            </Button>
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
        {allTags.length > 0 && (
          <TagFilterPicker
            tags={allTags}
            value={tagFilter}
            onChange={setTagFilter}
          />
        )}
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
          onRowContextMenu={(c, e) => {
            setCtxClient(c);
            ctxMenu.openAt(e);
          }}
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
                  : { label: 'Crear cliente', onClick: () => { setEditingClient(null); setFormOpen(true); }, iconLeft: <Plus size={14} /> }
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
              openWhatsApp(openClient.phone);
              recordContactMut.mutate({ customerId: openClient.id, kind: "whatsapp" });
            }
          }}
          onCall={() => {
            if (openClient.phone) {
              openTel(openClient.phone);
              recordContactMut.mutate({ customerId: openClient.id, kind: "call" });
            }
          }}
          onEmail={() => {
            if (openClient.email) {
              openMail(openClient.email);
              recordContactMut.mutate({ customerId: openClient.id, kind: "email" });
            }
          }}
          onNewSale={() => setSaleClient(openClient)}
          onEdit={() => { setEditingClient(openClient); setFormOpen(true); }}
          onMarkPaid={() => {}}
        />
      )}

      <ClientFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        client={editingClient}
      />

      <ImportClientsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />

      {/* Cierre rápido desde Clientes: preset.client viene seteado, el resto
          (producto + precio + pago) lo completa el vendedor. */}
      <NewSaleModal
        open={!!saleClient}
        onClose={() => setSaleClient(null)}
        preset={saleClient ? { client: saleClient } : null}
        onSubmit={async (data) => {
          await createSaleMut.mutateAsync(data);
          showToast(
            data.outOfStock ? 'Venta fuera de stock registrada' : 'Venta registrada',
            'success',
          );
        }}
      />

      {/* Confirm estricto de borrado. Cartera de clientes = valor real, así
          que pedimos tipear el nombre (single) o "ELIMINAR N" (bulk) antes
          de borrar. Reemplaza el window.confirm que era muy fácil de aceptar
          por accidente. */}
      {confirmDelete?.kind === 'single' && (
        <ConfirmDeleteModal
          open
          onClose={() => setConfirmDelete(null)}
          title={`Eliminar a ${confirmDelete.client.name}`}
          description={
            <>
              Vas a eliminar <strong>{confirmDelete.client.name}</strong> de tu
              cartera. {confirmDelete.client.phone && (
                <>Su teléfono ({confirmDelete.client.phone}) deja de estar disponible para WhatsApp/llamada rápida. </>
              )}
              {confirmDelete.client.totalPurchases ? (
                <>Tiene <strong>{confirmDelete.client.totalPurchases}</strong> {confirmDelete.client.totalPurchases === 1 ? 'venta registrada' : 'ventas registradas'} — el historial queda en la DB pero sin nombre asociado.</>
              ) : null}
            </>
          }
          confirmText={confirmDelete.client.name}
          confirmLabel={`Eliminar a ${confirmDelete.client.name.split(' ')[0]}`}
          onConfirm={async () => {
            await new Promise<void>((resolve, reject) =>
              deleteMut.mutate([confirmDelete.client.id], {
                onSuccess: () => {
                  showToast('Cliente eliminado', 'success');
                  resolve();
                },
                onError: (err) => {
                  showToast(err instanceof Error ? err.message : 'Error al eliminar', 'error');
                  reject(err);
                },
              }),
            );
          }}
        />
      )}

      {confirmDelete?.kind === 'bulk' && (
        <ConfirmDeleteModal
          open
          onClose={() => setConfirmDelete(null)}
          title={`Eliminar ${confirmDelete.ids.length} clientes`}
          description={
            <>
              Vas a borrar <strong>{confirmDelete.ids.length} clientes</strong> de
              tu cartera en una sola pasada. Para borrados masivos pedimos un
              tipeo más explícito porque no se pueden recuperar uno por uno.
            </>
          }
          confirmText={`ELIMINAR ${confirmDelete.ids.length}`}
          confirmLabel={`Eliminar ${confirmDelete.ids.length} clientes`}
          onConfirm={async () => {
            const ids = confirmDelete.ids;
            await new Promise<void>((resolve, reject) =>
              deleteMut.mutate(ids, {
                onSuccess: () => {
                  showToast(
                    `${ids.length} cliente${ids.length === 1 ? '' : 's'} eliminado${ids.length === 1 ? '' : 's'}`,
                    'success',
                  );
                  setSelected(new Set());
                  resolve();
                },
                onError: (err) => {
                  showToast(err instanceof Error ? err.message : 'Error al eliminar', 'error');
                  reject(err);
                },
              }),
            );
          }}
        />
      )}

      {/* Context menu (click derecho en una fila) */}
      {ctxMenu.open && ctxClient && (
        <ContextMenu position={ctxMenu.position} onClose={ctxMenu.close}>
          <ContextMenuLabel>{ctxClient.name}</ContextMenuLabel>
          <ContextMenuItem
            icon={<Users size={14} />}
            onClick={() => {
              setOpenClientId(ctxClient.id);
              ctxMenu.close();
            }}
          >
            Ver detalle
          </ContextMenuItem>
          <ContextMenuDivider />
          {ctxClient.phone && (
            <>
              <ContextMenuItem
                icon={<WhatsAppIcon size={13} color="var(--success)" />}
                onClick={() => {
                  if (ctxClient.phone) {
                    openWhatsApp(ctxClient.phone);
                    recordContactMut.mutate({ customerId: ctxClient.id, kind: 'whatsapp' });
                  }
                  ctxMenu.close();
                }}
              >
                WhatsApp
              </ContextMenuItem>
              <ContextMenuItem
                icon={<Phone size={14} />}
                onClick={() => {
                  if (ctxClient.phone) {
                    openTel(ctxClient.phone);
                    recordContactMut.mutate({ customerId: ctxClient.id, kind: 'call' });
                  }
                  ctxMenu.close();
                }}
              >
                Llamar
              </ContextMenuItem>
            </>
          )}
          {ctxClient.email && (
            <ContextMenuItem
              icon={<Mail size={14} />}
              onClick={() => {
                if (ctxClient.email) openMail(ctxClient.email);
                ctxMenu.close();
              }}
            >
              Email
            </ContextMenuItem>
          )}
          <ContextMenuItem
            icon={<Copy size={14} />}
            onClick={() => {
              const text = [ctxClient.name, ctxClient.phone, ctxClient.email]
                .filter(Boolean)
                .join(' · ');
              navigator.clipboard.writeText(text).catch(() => {});
              showToast('Datos copiados', 'success');
              ctxMenu.close();
            }}
          >
            Copiar contacto
          </ContextMenuItem>
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<DollarSign size={14} color="var(--success)" />}
            onClick={() => {
              setSaleClient(ctxClient);
              ctxMenu.close();
            }}
          >
            Nueva venta
          </ContextMenuItem>
          <ContextMenuItem
            icon={<Pencil size={14} />}
            onClick={() => {
              setEditingClient(ctxClient);
              setFormOpen(true);
              ctxMenu.close();
            }}
          >
            Editar
          </ContextMenuItem>
          <ContextMenuDivider />
          <ContextMenuItem
            tone="danger"
            icon={<Trash2 size={14} />}
            onClick={() => {
              setConfirmDelete({ kind: 'single', client: ctxClient });
              ctxMenu.close();
            }}
          >
            Eliminar
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  );
}

/* ============================================================
 *  Definición de columnas
 * ============================================================ */

const baseColumns: ColumnDef<Client>[] = [
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
    width: 'minmax(160px, 1fr)',
    cell: (c) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone={typeBadgeTone(c.type)} size="sm">
          {typeLabels[c.type]}
        </Badge>
        {c.tags?.slice(0, 3).map((t) => (
          <TagChip key={t.id} tag={t} />
        ))}
        {c.tags && c.tags.length > 3 && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-dim)',
              padding: '2px 6px',
              fontWeight: 600,
            }}
            title={c.tags.slice(3).map((t) => t.name).join(', ')}
          >
            +{c.tags.length - 3}
          </span>
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
  // La columna 'actions' se inyecta dentro del componente para que tenga
  // closure sobre los setters de venta rápida y el record-contact mut.
];

/* ============================================================
 *  RowIconBtn — botón cuadrado 26×26 para acciones de fila
 * ============================================================ */

interface RowIconBtnProps {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  /** 'success' tinta el hover bg en verde (botón $). */
  tone?: 'neutral' | 'success';
}

function RowIconBtn({ children, ariaLabel, onClick, disabled, tone = 'neutral' }: RowIconBtnProps) {
  const hoverBg = tone === 'success' ? 'var(--success-bg)' : 'var(--surface-hover)';
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      style={{
        width: 26,
        height: 26,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 100ms',
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

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

/* ============================================================
 *  TagFilterPicker — dropdown para filtrar la lista por una etiqueta
 * ============================================================ */

function TagFilterPicker({
  tags,
  value,
  onChange,
}: {
  tags: Array<{ id: string; name: string; color: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = value !== 'todos' ? tags.find((t) => t.id === value) : null;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: space[2],
          padding: `6px ${space[3]}`,
          borderRadius: 'var(--radius-full)',
          background: selected ? `${colorCss(selected.color)}22` : color.surface2,
          border: `1px solid ${selected ? colorCss(selected.color) : color.border}`,
          color: selected ? colorCss(selected.color) : color.text,
          fontSize: text.xs,
          fontWeight: weight.semibold,
          cursor: 'pointer',
        }}
      >
        <TagIcon size={11} />
        {selected ? selected.name : 'Etiqueta'}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 30,
            minWidth: 200,
            maxHeight: 300,
            overflowY: 'auto',
            background: color.surface,
            border: `1px solid var(--border-strong)`,
            borderRadius: 8,
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
          }}
        >
          <FilterRow active={value === 'todos'} onClick={() => { onChange('todos'); setOpen(false); }}>
            Todas las etiquetas
          </FilterRow>
          <div style={{ height: 1, background: color.border, margin: '4px 0' }} />
          {tags.map((t) => (
            <FilterRow
              key={t.id}
              active={value === t.id}
              onClick={() => { onChange(t.id); setOpen(false); }}
            >
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: colorCss(t.color), flexShrink: 0,
                }}
              />
              {t.name}
            </FilterRow>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({
  children, active, onClick,
}: {
  children: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: `7px ${space[3]}`,
        background: active ? color.surfaceHover : 'transparent',
        color: color.text,
        fontSize: text.sm,
        fontWeight: weight.medium,
        textAlign: 'left',
        borderRadius: 4,
        cursor: 'pointer',
        width: '100%',
        transition: 'background 100ms',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = active ? color.surfaceHover : 'transparent')}
    >
      {children}
    </button>
  );
}
