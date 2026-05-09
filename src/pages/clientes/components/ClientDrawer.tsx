import { useEffect, useRef, useState } from 'react';
import {
  Phone,
  Mail,
  Plus,
  MoreVertical,
  ShoppingCart,
  CreditCard,
  Pencil,
  CircleDot,
  CheckCircle2,
  Clock,
  Tag,
  Check,
} from 'lucide-react';
import { WhatsAppIcon } from '../../../components/icons/WhatsAppIcon';
import { Drawer } from '../../../components/Drawer';
import { Button } from '../../../components/Button';
import { Badge } from '../../../components/Badge';
import { Avatar } from '../../../components/Avatar';
import { Tabs } from '../../../components/Tabs';
import { TagChip } from '../../../components/TagChip';
import { EmptyState } from '../../../components/EmptyState';
import { useCustomerTags, useSetCustomerTags } from '../useClientsData';
import { ManualDebtModal } from './ManualDebtModal';
import type { ClientTag } from '../../../types/domain';
import { color, radius, space, text, weight } from '../../../tokens';
import {
  formatMoney,
  formatRelative,
  formatDateLong,
} from '../../../lib/format';
import type {
  ClientDetail,
  ClientType,
  Sale,
  ActivityItem,
  ActivityKind,
} from '../../../types/domain';

interface ClientDrawerProps {
  client: ClientDetail;
  onClose: () => void;
  onWhatsApp: () => void;
  onCall: () => void;
  onEmail?: () => void;
  onNewSale: () => void;
  onEdit: () => void;
  onMarkPaid?: (debtId: string) => void;
}

const typeLabels: Record<ClientType, string> = {
  final: 'Final',
  revendedor: 'Revendedor',
  mayorista: 'Mayorista',
  empresa: 'Empresa',
};

const typeTones: Record<ClientType, 'neutral' | 'info' | 'primary' | 'warning'> = {
  final: 'neutral',
  revendedor: 'info',
  mayorista: 'primary',
  empresa: 'warning',
};

export function ClientDrawer({
  client,
  onClose,
  onWhatsApp,
  onCall,
  onEmail,
  onNewSale,
  onEdit,
  onMarkPaid,
}: ClientDrawerProps) {
  const [tab, setTab] = useState<'info' | 'ventas' | 'deudas' | 'historial'>('info');
  const [debtModalOpen, setDebtModalOpen] = useState(false);

  const totalDebt = client.outstandingDebts.reduce((sum, d) => sum + d.amount, 0);

  return (
    <Drawer
      open={true}
      onClose={onClose}
      header={
        <ClientHeader
          client={client}
          onClose={onClose}
          onEdit={onEdit}
          onWhatsApp={onWhatsApp}
          onCall={onCall}
          onEmail={onEmail}
        />
      }
      footer={
        <div style={{ display: 'flex', gap: space[2] }}>
          <Button
            variant="secondary"
            size="md"
            iconLeft={<WhatsAppIcon size={15} color="var(--success)" />}
            onClick={onWhatsApp}
            fullWidth
          >
            WhatsApp
          </Button>
          <Button
            variant="primary"
            size="md"
            iconLeft={<Plus size={15} />}
            onClick={onNewSale}
            fullWidth
          >
            Nueva venta
          </Button>
        </div>
      }
    >
      {/* Quick stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 0,
          padding: 0,
          borderBottom: `1px solid ${color.border}`,
        }}
      >
        <Stat label="Compras" value={String(client.totalPurchases || 0)} />
        <Stat label="Histórico" value={formatMoney(client.lifetimeValue || 0)} compact />
        <Stat
          label="Deuda"
          value={formatMoney(totalDebt)}
          compact
          tone={totalDebt > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {/* Tabs */}
      <div
        style={{
          padding: `${space[3]} ${space[5]} 0`,
        }}
      >
        <Tabs
          variant="underline"
          value={tab}
          onChange={(v) => setTab(v as 'info' | 'ventas' | 'deudas' | 'historial')}
          size="sm"
          items={[
            { value: 'info', label: 'Info' },
            { value: 'ventas', label: 'Ventas', count: client.sales.length },
            {
              value: 'deudas',
              label: 'Deudas',
              count: client.outstandingDebts.length || undefined,
            },
            { value: 'historial', label: 'Historial', count: client.activity.length },
          ]}
        />
      </div>

      {/* Content */}
      <div style={{ padding: space[5] }}>
        {tab === 'info' && <InfoTab client={client} />}
        {tab === 'ventas' && <SalesTab sales={client.sales} />}
        {tab === 'deudas' && (
          <DebtsTab
            debts={client.outstandingDebts}
            onMarkPaid={onMarkPaid}
            onAddDebt={() => setDebtModalOpen(true)}
          />
        )}
        {tab === 'historial' && <HistoryTab activity={client.activity} />}
      </div>

      <ManualDebtModal
        open={debtModalOpen}
        onClose={() => setDebtModalOpen(false)}
        clientId={client.id}
        clientName={client.name}
      />
    </Drawer>
  );
}

/* ============================================================
 *  Header del drawer del cliente
 * ============================================================ */

function ClientHeader({
  client,
  onClose,
  onEdit,
  onCall,
  onEmail,
}: {
  client: ClientDetail;
  onClose: () => void;
  onEdit: () => void;
  onWhatsApp: () => void;
  onCall: () => void;
  onEmail?: () => void;
}) {
  return (
    <div
      style={{
        padding: space[5],
        borderBottom: `1px solid ${color.border}`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: space[3],
          marginBottom: space[3],
        }}
      >
        <Avatar name={client.name} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: text.lg,
              fontWeight: weight.bold,
              color: color.text,
              letterSpacing: '-0.3px',
            }}
          >
            {client.name}
          </h2>
          <div
            style={{
              marginTop: 4,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <Badge tone={typeTones[client.type]} size="sm">
              {typeLabels[client.type]}
            </Badge>
            <ClientTagsEditor clientId={client.id} tags={client.tags ?? []} />
            {client.lastContactAt && (
              <span style={{ fontSize: text.xs, color: color.textMuted }}>
                Último contacto {formatRelative(client.lastContactAt)}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <IconButton onClick={onEdit} title="Editar">
            <Pencil size={15} strokeWidth={2.2} />
          </IconButton>
          <IconButton onClick={() => {}} title="Más opciones">
            <MoreVertical size={15} strokeWidth={2.2} />
          </IconButton>
          <IconButton onClick={onClose} title="Cerrar">
            <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 300 }}>×</span>
          </IconButton>
        </div>
      </div>

      {/* Quick contact actions */}
      <div style={{ display: 'flex', gap: space[2] }}>
        <ContactButton onClick={onCall} icon={<Phone size={14} />} tone="neutral">
          {client.phone || 'Sin tel.'}
        </ContactButton>
        {client.email && (
          <ContactButton onClick={onEmail} icon={<Mail size={14} />} tone="neutral" minimal>
            {client.email}
          </ContactButton>
        )}
      </div>
    </div>
  );
}

function ContactButton({
  children,
  onClick,
  icon,
  minimal,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon: React.ReactNode;
  tone?: 'neutral' | 'success';
  minimal?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: minimal ? 'none' : 1,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: `0 ${space[3]}`,
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        color: color.text,
        fontSize: text.sm,
        fontWeight: weight.medium,
        transition: 'all 100ms',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minWidth: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = color.surfaceHover;
        e.currentTarget.style.borderColor = color.borderStrong;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = color.surface2;
        e.currentTarget.style.borderColor = color.border;
      }}
    >
      <span style={{ color: color.textMuted, display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </button>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 28,
        height: 28,
        borderRadius: radius.sm,
        color: color.textMuted,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 100ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = color.surfaceHover;
        e.currentTarget.style.color = color.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = color.textMuted;
      }}
    >
      {children}
    </button>
  );
}

/* ============================================================
 *  Stats compactos
 * ============================================================ */

function Stat({
  label,
  value,
  tone = 'neutral',
  compact,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'danger';
  compact?: boolean;
}) {
  const toneColor =
    tone === 'success' ? color.success : tone === 'danger' ? color.danger : color.text;
  return (
    <div
      style={{
        padding: `${space[3]} ${space[4]}`,
        borderRight: `1px solid ${color.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        // sin border-right en el último (lo manejamos con :nth-child no inline, así que hacemos el detalle así:)
      }}
    >
      <span
        style={{
          fontSize: text.xs,
          color: color.textMuted,
          fontWeight: weight.medium,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: compact ? text.md : text.lg,
          fontWeight: weight.bold,
          color: toneColor,
          letterSpacing: '-0.3px',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ============================================================
 *  Tab: Info
 * ============================================================ */

function InfoTab({ client }: { client: ClientDetail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <InfoSection title="Datos de contacto">
        <InfoRow label="Teléfono" value={client.phone || '—'} />
        <InfoRow label="Email" value={client.email || '—'} />
        <InfoRow label="Tipo" value={typeLabels[client.type]} />
        {client.createdAt && (
          <InfoRow label="Cliente desde" value={formatDateLong(client.createdAt)} />
        )}
      </InfoSection>

      <InfoSection title="Notas">
        {client.notes ? (
          <p
            style={{
              margin: 0,
              fontSize: text.sm,
              color: color.text,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {client.notes}
          </p>
        ) : (
          <span style={{ fontSize: text.sm, color: color.textDim, fontStyle: 'italic' }}>
            Sin notas. Agregá información clave del cliente acá.
          </span>
        )}
      </InfoSection>
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        style={{
          margin: 0,
          marginBottom: space[3],
          fontSize: text.xs,
          fontWeight: weight.semibold,
          color: color.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: space[3],
        padding: `${space[2]} 0`,
        borderBottom: `1px solid ${color.border}`,
      }}
    >
      <span style={{ fontSize: text.sm, color: color.textMuted }}>{label}</span>
      <span
        style={{
          fontSize: text.sm,
          color: color.text,
          fontWeight: weight.medium,
          textAlign: 'right',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ============================================================
 *  Tab: Ventas
 * ============================================================ */

function SalesTab({ sales }: { sales: Sale[] }) {
  if (sales.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<ShoppingCart size={20} />}
        title="Sin ventas registradas"
        description="Cuando vendás algo a este cliente, va a aparecer acá."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {sales.map((sale) => (
        <SaleCard key={sale.id} sale={sale} />
      ))}
    </div>
  );
}

function SaleCard({ sale }: { sale: Sale }) {
  return (
    <div
      style={{
        padding: space[4],
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.semibold,
            color: color.text,
            marginBottom: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sale.product}
        </div>
        <div
          style={{
            fontSize: text.xs,
            color: color.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {formatRelative(sale.createdAt)}
          {sale.status === 'paid' && (
            <Badge tone="success" size="sm" dot>
              Pagado
            </Badge>
          )}
          {sale.status === 'partial' && (
            <Badge tone="warning" size="sm" dot>
              Parcial
            </Badge>
          )}
          {sale.status === 'pending' && (
            <Badge tone="danger" size="sm" dot>
              Sin pagar
            </Badge>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.bold,
            color: color.text,
            letterSpacing: '-0.2px',
          }}
        >
          {formatMoney(sale.amount)}
        </div>
        {sale.status === 'partial' && (
          <div style={{ fontSize: 10, color: color.warning, fontWeight: weight.semibold, marginTop: 2 }}>
            Falta {formatMoney(sale.amount - sale.paid)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 *  Tab: Deudas
 * ============================================================ */

function DebtsTab({
  debts,
  onMarkPaid,
  onAddDebt,
}: {
  debts: ClientDetail['outstandingDebts'];
  onMarkPaid?: (id: string) => void;
  onAddDebt?: () => void;
}) {
  if (debts.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<CheckCircle2 size={20} />}
        title="Sin deudas pendientes"
        description="Este cliente está al día con todos sus pagos."
        action={
          onAddDebt
            ? { label: 'Cargar deuda manual', onClick: onAddDebt, iconLeft: <Plus size={14} /> }
            : undefined
        }
      />
    );
  }

  const total = debts.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {onAddDebt && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" iconLeft={<Plus size={14} />} onClick={onAddDebt}>
            Cargar deuda
          </Button>
        </div>
      )}
      <div
        style={{
          padding: space[4],
          background: color.dangerBg,
          border: `1px solid ${color.danger}`,
          borderRadius: radius.md,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: text.xs, color: color.textMuted, marginBottom: 2 }}>
            Saldo pendiente total
          </div>
          <div style={{ fontSize: text.xl, fontWeight: weight.bold, color: color.danger }}>
            {formatMoney(total)}
          </div>
        </div>
      </div>

      {debts.map((debt) => (
        <div
          key={debt.saleId}
          style={{
            padding: space[4],
            background: color.surface2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            display: 'flex',
            alignItems: 'center',
            gap: space[3],
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: text.sm,
                fontWeight: weight.semibold,
                color: color.text,
                marginBottom: 2,
              }}
            >
              {debt.product}
            </div>
            <div
              style={{
                fontSize: text.xs,
                color: debt.daysOverdue > 0 ? color.danger : color.textMuted,
                fontWeight: debt.daysOverdue > 0 ? weight.semibold : weight.regular,
              }}
            >
              {debt.daysOverdue > 0
                ? `Vencida hace ${debt.daysOverdue}d`
                : `Vence en ${Math.abs(debt.daysOverdue)}d`}
            </div>
          </div>
          <div
            style={{
              fontSize: text.sm,
              fontWeight: weight.bold,
              color: debt.daysOverdue > 0 ? color.danger : color.text,
            }}
          >
            {formatMoney(debt.amount)}
          </div>
          {onMarkPaid && (
            <Button variant="secondary" size="sm" onClick={() => onMarkPaid(debt.saleId)}>
              Cobrar
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
 *  Tab: Historial (timeline)
 * ============================================================ */

const activityIcons: Record<ActivityKind, { icon: React.ReactNode; tone: string; bg: string }> = {
  sale: {
    icon: <ShoppingCart size={13} strokeWidth={2.4} />,
    tone: color.success,
    bg: color.successBg,
  },
  payment: {
    icon: <CreditCard size={13} strokeWidth={2.4} />,
    tone: color.success,
    bg: color.successBg,
  },
  contact: {
    icon: <Phone size={13} strokeWidth={2.4} />,
    tone: color.info,
    bg: color.infoBg,
  },
  note: {
    icon: <Pencil size={13} strokeWidth={2.4} />,
    tone: color.textMuted,
    bg: color.surface2,
  },
  'lead-stage-change': {
    icon: <CircleDot size={13} strokeWidth={2.4} />,
    tone: color.primary,
    bg: color.primaryBg,
  },
  task: {
    icon: <Clock size={13} strokeWidth={2.4} />,
    tone: color.warning,
    bg: color.warningBg,
  },
  created: {
    icon: <Plus size={13} strokeWidth={2.4} />,
    tone: color.textDim,
    bg: color.surface2,
  },
};

function HistoryTab({ activity }: { activity: ActivityItem[] }) {
  if (activity.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<Clock size={20} />}
        title="Sin actividad"
        description="La actividad del cliente va a aparecer acá."
      />
    );
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 0 }}>
      {/* Línea vertical del timeline */}
      <div
        style={{
          position: 'absolute',
          left: 13,
          top: 14,
          bottom: 14,
          width: 1,
          background: color.border,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {activity.map((item) => {
          const { icon, tone, bg } = activityIcons[item.kind];
          return (
            <div
              key={item.id}
              style={{
                display: 'flex',
                gap: space[3],
                position: 'relative',
                zIndex: 1,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: bg,
                  border: `2px solid ${color.surface}`,
                  color: tone,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
              <div style={{ flex: 1, paddingTop: 2, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: text.sm,
                    fontWeight: weight.semibold,
                    color: color.text,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: space[2],
                    marginBottom: 2,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </span>
                  {item.amount && (
                    <span style={{ color: tone, flexShrink: 0 }}>
                      {formatMoney(item.amount)}
                    </span>
                  )}
                </div>
                {item.description && (
                  <div
                    style={{
                      fontSize: text.xs,
                      color: color.textMuted,
                      marginBottom: 2,
                      lineHeight: 1.5,
                    }}
                  >
                    {item.description}
                  </div>
                )}
                <div
                  style={{
                    fontSize: text.xs,
                    color: color.textDim,
                    display: 'flex',
                    gap: space[2],
                    alignItems: 'center',
                  }}
                >
                  <span>{formatRelative(item.at)}</span>
                  {item.by && (
                    <>
                      <span>·</span>
                      <span>{item.by}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 *  ClientTagsEditor — chips inline + dropdown para asignar/quitar tags
 * ============================================================ */

function ClientTagsEditor({
  clientId,
  tags,
}: {
  clientId: string;
  tags: ClientTag[];
}) {
  const { data: allTags = [] } = useCustomerTags();
  const setTagsMut = useSetCustomerTags();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const assignedIds = new Set(tags.map((t) => t.id));

  function toggle(tagId: string) {
    const next = new Set(assignedIds);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    setTagsMut.mutate({ customerId: clientId, tagIds: Array.from(next) });
  }

  function removeTag(tagId: string) {
    const next = new Set(assignedIds);
    next.delete(tagId);
    setTagsMut.mutate({ customerId: clientId, tagIds: Array.from(next) });
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {tags.map((t) => (
        <TagChip key={t.id} tag={t} size="sm" onRemove={() => removeTag(t.id)} />
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 8px',
          background: 'transparent',
          border: `1px dashed ${color.border}`,
          borderRadius: radius.sm,
          color: color.textMuted,
          fontSize: 11,
          fontWeight: weight.semibold,
          cursor: 'pointer',
          transition: 'all 100ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = color.borderStrong;
          e.currentTarget.style.color = color.text;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = color.border;
          e.currentTarget.style.color = color.textMuted;
        }}
      >
        {tags.length === 0 ? (
          <>
            <Plus size={11} /> Etiqueta
          </>
        ) : (
          <>
            <Tag size={10} /> Editar
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            minWidth: 220,
            maxHeight: 300,
            overflowY: 'auto',
            background: color.surface,
            border: `1px solid ${color.borderStrong}`,
            borderRadius: radius.md,
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {allTags.length === 0 ? (
            <div style={{ padding: `${space[3]} ${space[4]}`, fontSize: text.xs, color: color.textMuted, textAlign: 'center' }}>
              No hay etiquetas configuradas.
              <br />
              Creá algunas en Ajustes → Etiquetas de clientes.
            </div>
          ) : (
            allTags.map((t) => {
              const assigned = assignedIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: space[2],
                    padding: `6px ${space[3]}`,
                    background: 'transparent',
                    color: color.text,
                    fontSize: text.sm,
                    fontWeight: weight.medium,
                    textAlign: 'left',
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <TagChip tag={t} size="sm" />
                  </span>
                  {assigned && <Check size={14} color={color.success} />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
