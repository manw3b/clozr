import { useState, useCallback } from "react";
import { UserPlus, Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersDb } from "../../lib/db/customers";
import { settingsDb } from "../../lib/db/settings";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { useDebounce } from "../../lib/hooks";
import SidePanel from "../../components/SidePanel";
import Modal from "../../components/Modal";
import CustomerRow from "./CustomerRow";
import CustomerSheet from "./CustomerSheet";
import CustomerForm from "./CustomerForm";
import type { Customer, CreateCustomerInput } from "../../lib/db/types";

type SheetMode = "view" | "edit";

export default function CustomersScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const { userId } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const wid = activeWorkspace?.id ?? "";

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("todos");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>("view");
  const [showCreate, setShowCreate] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);

  const { data: customerTypes = [] } = useQuery({
    queryKey: ["customer-types", wid],
    queryFn: () => settingsDb.getCustomerTypes(wid),
    enabled: !!wid,
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", wid, debouncedQuery, activeFilter],
    queryFn: () =>
      customersDb.search(wid, {
        query: debouncedQuery || undefined,
        type: activeFilter !== "todos" ? activeFilter : undefined,
      }),
    enabled: !!wid,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "customers" }),
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: (data: CreateCustomerInput) => customersDb.create(wid, data),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      showToast("Cliente creado", "success");
    },
    onError: () => showToast("Error al crear cliente"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateCustomerInput }) =>
      customersDb.update(wid, id, data),
    onSuccess: (_, { id, data }) => {
      invalidate();
      if (selected?.id === id) setSelected((prev) => (prev ? { ...prev, ...data } : prev));
      setSheetMode("view");
      showToast("Cliente actualizado", "success");
    },
    onError: () => showToast("Error al actualizar cliente"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customersDb.remove(wid, id),
    onSuccess: () => {
      invalidate();
      setSelected(null);
      showToast("Cliente eliminado", "success");
    },
    onError: () => showToast("Error al eliminar cliente"),
  });

  const handleCreate = (data: CreateCustomerInput) =>
    createMutation.mutateAsync({ ...data, created_by: userId ?? undefined });

  const handleUpdate = (data: CreateCustomerInput) => {
    if (!selected) return Promise.resolve();
    return updateMutation.mutateAsync({ id: selected.id, data });
  };

  const filters = [
    { value: "todos", label: "Todos" },
    ...customerTypes.map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 0", background: "var(--bg)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5 }}>Clientes</h1>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
              {customers.length} resultado{customers.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "0 12px",
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, width: 240,
            }}>
              <Search size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                style={{ flex: 1, padding: "8px 0", background: "transparent", border: "none", color: "var(--text-primary)", fontSize: 13, outline: "none" }}
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--brand)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff" }}
            >
              <UserPlus size={14} />
              Nuevo cliente
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              style={{
                padding: "8px 14px", fontSize: 13,
                fontWeight: activeFilter === f.value ? 600 : 400,
                color: activeFilter === f.value ? "var(--brand)" : "var(--text-secondary)",
                borderBottom: activeFilter === f.value ? "2px solid var(--brand)" : "2px solid transparent",
                marginBottom: -1, transition: "color 0.12s", whiteSpace: "nowrap",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {isLoading ? (
          <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13 }}>Cargando...</div>
        ) : customers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-tertiary)", fontSize: 14 }}>
            {searchQuery ? "Sin resultados para tu búsqueda" : "Sin clientes aún"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Nombre", "Tipo", "Estado", "Barrio", "Teléfono", ""].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600,
                    color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px",
                    whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--bg)", zIndex: 1,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  selected={selected?.id === c.id}
                  onPress={(cust) => { setSelected(cust); setSheetMode("view"); }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SidePanel isOpen={!!selected} onClose={() => setSelected(null)} title={sheetMode === "edit" ? "Editar cliente" : undefined}>
        {selected && (
          <CustomerSheet
            customer={selected}
            mode={sheetMode}
            customerTypes={customerTypes}
            onClose={() => setSelected(null)}
            onModeChange={setSheetMode}
            onUpdate={handleUpdate}
            onDelete={() => deleteMutation.mutate(selected.id)}
          />
        )}
      </SidePanel>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nuevo cliente" maxWidth={620}>
        <CustomerForm
          customerTypes={customerTypes}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>
    </div>
  );
}
