import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Search } from "lucide-react";
import { Modal, ModalField } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { salesDb } from "../../../lib/db/sales";
import { catalogDb } from "../../../lib/db/catalog";
import { useWorkspaceStore } from "../../../store/workspaceStore";
import { useAuthStore } from "../../../store/authStore";
import { useUIStore } from "../../../store/uiStore";
import { invalidate, qk } from "../../../lib/queryKeys";
import { color, radius, space, text, weight } from "../../../tokens";
import { formatMoney } from "../../../lib/format";
import type { Sale, CatalogItem } from "../../../lib/db/types";

export function PendingRegularizationBanner() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  const [open, setOpen] = useState(false);

  const pendingQ = useQuery({
    queryKey: qk.ventas.pendingRegularization(wid),
    queryFn: () => salesDb.getPendingRegularization(wid),
    enabled: !!wid,
    refetchInterval: 30_000,
  });

  const count = pendingQ.data?.length ?? 0;
  if (count === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: space[3],
          padding: space[3],
          background: color.warningBg,
          border: `1px solid ${color.warning}`,
          borderRadius: radius.md,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <AlertCircle size={18} color={color.warning} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
            {count} {count === 1 ? "venta" : "ventas"} fuera de stock pendientes de regularizar
          </div>
          <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
            Click para vincularlas con un producto del catálogo
          </div>
        </div>
        <span style={{ fontSize: text.xs, color: color.warning, fontWeight: weight.semibold }}>
          Ver →
        </span>
      </button>

      <RegularizationModal open={open} onClose={() => setOpen(false)} pending={pendingQ.data ?? []} wid={wid} />
    </>
  );
}

function RegularizationModal({
  open,
  onClose,
  pending,
  wid,
}: {
  open: boolean;
  onClose: () => void;
  pending: Sale[];
  wid: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pendientes de regularizar"
      subtitle={`${pending.length} ${pending.length === 1 ? "venta" : "ventas"} hechas fuera de stock`}
      maxWidth={640}
    >
      {pending.length === 0 ? (
        <p style={{ fontSize: text.sm, color: color.textMuted }}>Todo al día. 🎉</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          {pending.map((s) => (
            <PendingRow key={s.id} sale={s} wid={wid} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function PendingRow({ sale, wid }: { sale: Sale; wid: string }) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const { userId } = useAuthStore();
  const [linking, setLinking] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [imei, setImei] = useState("");

  const catalogQ = useQuery({
    queryKey: qk.catalog.itemsSearch(wid),
    queryFn: () => catalogDb.getAll(wid),
    enabled: linking && !!wid,
  });

  const filtered = (catalogQ.data ?? []).filter((p) =>
    !search.trim() ? true : p.name.toLowerCase().includes(search.toLowerCase()),
  ).slice(0, 5);

  const mut = useMutation({
    mutationFn: () => salesDb.regularizeSale(sale.id, picked?.id ?? null, imei.trim() || null, userId ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ventas.pendingRegularizationAll() });
      invalidate.afterSaleChange(qc);
      showToast("Venta regularizada", "success");
      setLinking(false);
      setPicked(null);
      setImei("");
    },
  });

  return (
    <div style={{ background: color.surface2, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[3] }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: space[2] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
            {sale.customer_name ?? "Sin cliente"} · {formatMoney(sale.total)}
          </div>
          <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
            {sale.notes ?? "Sin descripción"} · {new Date(sale.created_at).toLocaleString("es-AR")}
          </div>
        </div>
        {!linking && (
          <Button size="sm" onClick={() => setLinking(true)}>Regularizar</Button>
        )}
      </div>

      {linking && (
        <div style={{ marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${color.border}` }}>
          <ModalField label="Producto del catálogo">
            {picked ? (
              <div
                style={{ padding: space[2], background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.sm, display: "flex", alignItems: "center", gap: space[3] }}
              >
                <span style={{ flex: 1, fontSize: text.sm, color: color.text }}>{picked.name}</span>
                <button onClick={() => setPicked(null)} style={{ fontSize: text.xs, color: color.textMuted }}>Cambiar</button>
              </div>
            ) : (
              <>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  iconLeft={<Search size={14} />}
                />
                {filtered.length > 0 && (
                  <div style={{ marginTop: space[2], background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.sm, overflow: "hidden" }}>
                    {filtered.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPicked(p)}
                        style={{ width: "100%", textAlign: "left", padding: space[2], fontSize: text.sm, color: color.text, borderBottom: `1px solid ${color.border}` }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </ModalField>
          <ModalField label="IMEI" hint="Opcional">
            <Input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="35XXXXXXXXX" />
          </ModalField>
          <div style={{ display: "flex", gap: space[2], justifyContent: "flex-end" }}>
            <Button variant="ghost" size="sm" onClick={() => setLinking(false)}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={() => mut.mutate()} loading={mut.isPending}>
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
