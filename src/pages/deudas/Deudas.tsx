import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Check, Download, Eye } from "lucide-react";
import { confirmAsync } from "../../lib/confirmAsync";
import { WhatsAppIcon } from "../../components/icons/WhatsAppIcon";
import { openWhatsApp, openTel } from "../../lib/openExternal";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuLabel,
  useContextMenu,
} from "../../components/ContextMenu";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Avatar } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Card } from "../../components/Card";
import { DataTable, type ColumnDef } from "../../components/data-table";
import { salesDb } from "../../lib/db/sales";
import { customersDb } from "../../lib/db/customers";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { invalidate, qk } from "../../lib/queryKeys";
import { color, space, text, weight } from "../../tokens";
import { formatMoney } from "../../lib/format";
import { exportToCsv, timestamp } from "../../lib/exportCsv";
import { useRecordContact } from "../clientes/useClientsData";
import type { Sale } from "../../lib/db/types";

interface DeudaRow {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  pendingSales: number;
  totalDue: number;
  oldestDueDate: string;
  maxDaysOverdue: number;
  sales: Sale[];
}

export function Deudas() {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast } = useUIStore();
  const ctxMenu = useContextMenu();
  const [ctxRow, setCtxRow] = useState<DeudaRow | null>(null);
  const wid = activeWorkspace?.id ?? "";
  const qc = useQueryClient();
  const recordContactMut = useRecordContact();

  const { data: pendingSales = [] } = useQuery({
    queryKey: qk.deudas.list(wid),
    queryFn: async () => {
      const sales = await salesDb.getAll(wid);
      return sales.filter((s) => s.is_paid === 0 && s.balance > 0);
    },
    enabled: !!wid,
  });

  // Need phones — fetch customers once
  const { data: allCustomers = [] } = useQuery({
    queryKey: qk.deudas.customers(wid),
    queryFn: () => customersDb.getAll(wid),
    enabled: !!wid,
  });

  const markPaidMut = useMutation({
    mutationFn: (saleId: string) => salesDb.markAsPaid(saleId),
    onSuccess: () => {
      invalidate.afterSaleChange(qc);
      qc.invalidateQueries({ queryKey: qk.deudas.all() });
      showToast("Cobrado", "success");
    },
  });

  const rows: DeudaRow[] = useMemo(() => {
    const phoneById = new Map(allCustomers.map((c) => [c.id, c.phone]));
    const grouped = new Map<string, DeudaRow>();
    const now = Date.now();

    for (const s of pendingSales) {
      const cid = s.customer_id ?? "no-client";
      const cname = s.customer_name ?? "Sin cliente";
      const days = Math.max(0, Math.floor((now - new Date(s.created_at).getTime()) / 86_400_000) - 30);
      let row = grouped.get(cid);
      if (!row) {
        row = {
          customerId: cid,
          customerName: cname,
          customerPhone: cid !== "no-client" ? phoneById.get(cid) ?? null : null,
          pendingSales: 0,
          totalDue: 0,
          oldestDueDate: s.created_at,
          maxDaysOverdue: 0,
          sales: [],
        };
        grouped.set(cid, row);
      }
      row.pendingSales += 1;
      row.totalDue += s.balance;
      row.sales.push(s);
      if (s.created_at < row.oldestDueDate) row.oldestDueDate = s.created_at;
      if (days > row.maxDaysOverdue) row.maxDaysOverdue = days;
    }

    return Array.from(grouped.values()).sort((a, b) => b.totalDue - a.totalDue);
  }, [pendingSales, allCustomers]);

  const totals = useMemo(() => {
    const totalDue = rows.reduce((s, r) => s + r.totalDue, 0);
    const overdueCount = rows.filter((r) => r.maxDaysOverdue > 0).length;
    return { totalDue, overdueCount, customerCount: rows.length };
  }, [rows]);

  // hasPhone se usa solo para mostrar/ocultar el botón. La normalización
  // del número y la apertura van por openWhatsApp().
  function hasPhone(phone: string | null): boolean {
    return !!phone && phone.replace(/\D/g, "").length > 0;
  }

  const columns: ColumnDef<DeudaRow>[] = [
    {
      id: "customer",
      header: "Cliente",
      sortable: true,
      width: "minmax(220px, 1.4fr)",
      cell: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
          <Avatar name={r.customerName} size={32} />
          <div>
            <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
              {r.customerName}
            </div>
            {r.customerPhone && (
              <div style={{ fontSize: text.xs, color: color.textMuted }}>{r.customerPhone}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "pendingSales",
      header: "Ventas",
      sortable: true,
      width: "100px",
      align: "center",
      cell: (r) => (
        <span style={{ fontSize: text.sm, color: color.text }}>
          {r.pendingSales}
        </span>
      ),
    },
    {
      id: "totalDue",
      header: "Saldo",
      sortable: true,
      width: "140px",
      align: "right",
      cell: (r) => (
        <span style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.danger }}>
          {formatMoney(r.totalDue, 'USD')}
        </span>
      ),
    },
    {
      id: "maxDaysOverdue",
      header: "Atraso",
      sortable: true,
      width: "120px",
      cell: (r) =>
        r.maxDaysOverdue === 0 ? (
          <Badge tone="neutral">A tiempo</Badge>
        ) : r.maxDaysOverdue > 30 ? (
          <Badge tone="danger">+{r.maxDaysOverdue}d</Badge>
        ) : (
          <Badge tone="warning">+{r.maxDaysOverdue}d</Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      width: "240px",
      cell: (r) => {
        return (
          <div style={{ display: "flex", gap: space[2], justifyContent: "flex-end" }}>
            {hasPhone(r.customerPhone) && (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<WhatsAppIcon size={13} color="var(--success)" />}
                onClick={(e) => {
                  e.stopPropagation();
                  if (r.customerPhone) {
                    openWhatsApp(r.customerPhone);
                    recordContactMut.mutate({ customerId: r.customerId, kind: "whatsapp" });
                  }
                }}
              >
                WhatsApp
              </Button>
            )}
            {r.customerPhone && (
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Phone size={13} />}
                onClick={(e) => {
                  e.stopPropagation();
                  if (r.customerPhone) {
                    openTel(r.customerPhone);
                    recordContactMut.mutate({ customerId: r.customerId, kind: "call" });
                  }
                }}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Check size={13} />}
              onClick={async (e) => {
                e.stopPropagation();
                if (await confirmAsync({
                  title: "Marcar como pagadas",
                  message: `¿Marcar como pagadas las ${r.pendingSales} ventas pendientes de ${r.customerName}?`,
                  confirmText: "Marcar pagadas",
                })) {
                  for (const s of r.sales) markPaidMut.mutate(s.id);
                }
              }}
            >
              Cobrar
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[5], height: "100%" }}>
      <PageHeader
        title="Deudas"
        subtitle={`${totals.customerCount} cliente${totals.customerCount === 1 ? "" : "s"} con saldo pendiente`}
        actions={
          <Button
            variant="secondary"
            iconLeft={<Download size={14} />}
            onClick={() => {
              if (rows.length === 0) return;
              exportToCsv(`deudas-${timestamp()}.csv`, rows, [
                ["Cliente", (r) => r.customerName],
                ["Teléfono", (r) => r.customerPhone ?? ""],
                ["Ventas pendientes", (r) => r.pendingSales],
                ["Saldo total", (r) => r.totalDue],
                ["Días de atraso (máx)", (r) => r.maxDaysOverdue],
                ["Venta más vieja", (r) => new Date(r.oldestDueDate).toLocaleDateString("es-AR")],
              ]);
              showToast(`${rows.length} cliente${rows.length === 1 ? "" : "s"} exportado${rows.length === 1 ? "" : "s"}`, "success");
            }}
          >
            Exportar
          </Button>
        }
      />

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: space[3] }}>
        <Card padding={5}>
          <div style={{ fontSize: text.sm, color: color.textMuted, marginBottom: space[2] }}>
            Saldo total
          </div>
          <div
            style={{
              fontSize: text["2xl"],
              fontWeight: weight.bold,
              color: color.danger,
              letterSpacing: "-0.5px",
            }}
          >
            {formatMoney(totals.totalDue, 'USD')}
          </div>
        </Card>
        <Card padding={5}>
          <div style={{ fontSize: text.sm, color: color.textMuted, marginBottom: space[2] }}>
            Vencidas
          </div>
          <div
            style={{
              fontSize: text["2xl"],
              fontWeight: weight.bold,
              color: color.warning,
              letterSpacing: "-0.5px",
            }}
          >
            {totals.overdueCount}
          </div>
        </Card>
        <Card padding={5}>
          <div style={{ fontSize: text.sm, color: color.textMuted, marginBottom: space[2] }}>
            Clientes con saldo
          </div>
          <div
            style={{
              fontSize: text["2xl"],
              fontWeight: weight.bold,
              color: color.text,
              letterSpacing: "-0.5px",
            }}
          >
            {totals.customerCount}
          </div>
        </Card>
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DataTable<DeudaRow>
          rows={rows}
          columns={columns}
          getRowId={(r) => r.customerId}
          onRowContextMenu={(r, e) => {
            setCtxRow(r);
            ctxMenu.openAt(e);
          }}
          density="normal"
          empty={
            <EmptyState
              title="Sin deudas"
              description="Todos tus clientes están al día. Buen trabajo 🎉"
            />
          }
        />
      </div>

      {ctxMenu.open && ctxRow && (
        <ContextMenu position={ctxMenu.position} onClose={ctxMenu.close}>
          <ContextMenuLabel>{ctxRow.customerName}</ContextMenuLabel>
          {ctxRow.customerPhone && (
            <>
              <ContextMenuItem
                icon={<WhatsAppIcon size={13} color="var(--success)" />}
                onClick={() => {
                  if (ctxRow.customerPhone) {
                    openWhatsApp(ctxRow.customerPhone);
                    recordContactMut.mutate({ customerId: ctxRow.customerId, kind: "whatsapp" });
                  }
                  ctxMenu.close();
                }}
              >
                WhatsApp
              </ContextMenuItem>
              <ContextMenuItem
                icon={<Phone size={14} />}
                onClick={() => {
                  if (ctxRow.customerPhone) {
                    openTel(ctxRow.customerPhone);
                    recordContactMut.mutate({ customerId: ctxRow.customerId, kind: "call" });
                  }
                  ctxMenu.close();
                }}
              >
                Llamar
              </ContextMenuItem>
              <ContextMenuDivider />
            </>
          )}
          <ContextMenuItem
            icon={<Eye size={14} />}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("clozr:open-client", { detail: { id: ctxRow.customerId } }),
              );
              ctxMenu.close();
            }}
          >
            Ver cliente
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  );
}
