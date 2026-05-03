import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../components/Modal";
import ProductsTab from "./ProductsTab";
import StockTab from "./StockTab";
import ItemFormModal from "./ItemFormModal";
import AddImeisModal from "./AddImeisModal";
import StockAdjustModal from "./StockAdjustModal";
import type { CatalogItemWithImeis, StockViewItem } from "../../lib/db/types";

type TabId = "products" | "stock";

type ModalState =
  | { type: "create" }
  | { type: "edit"; item: CatalogItemWithImeis }
  | { type: "imeis"; item: CatalogItemWithImeis }
  | { type: "adjust"; item: CatalogItemWithImeis };

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "products", label: "Productos" },
  { id: "stock", label: "Stock" },
];

export default function CatalogScreen() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("products");
  const [modal, setModal] = useState<ModalState | null>(null);

  const closeModal = () => setModal(null);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (q) => (q.queryKey[0] as string).startsWith("catalog"),
    });
  }, [queryClient]);

  const handleSuccess = () => {
    invalidate();
    closeModal();
  };

  const modalTitle = !modal
    ? ""
    : modal.type === "create"
    ? "Nuevo producto"
    : modal.type === "edit"
    ? "Editar producto"
    : modal.type === "imeis"
    ? `IMEIs — ${modal.item.name}`
    : `Ajustar stock — ${modal.item.name}`;

  const modalMaxWidth =
    modal?.type === "imeis" ? 520 : modal?.type === "adjust" ? 400 : 540;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px 0",
        flexShrink: 0,
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5 }}>
          Catálogo
        </h1>
        <button
          onClick={() => setModal({ type: "create" })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: "var(--primary)",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          <Plus size={14} />
          Nuevo producto
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        padding: "16px 24px 0",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "var(--text)" : "var(--text-muted)",
              borderBottom: `2px solid ${activeTab === tab.id ? "var(--primary)" : "transparent"}`,
              marginBottom: -1,
              transition: "color 0.1s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "products" ? (
          <ProductsTab
            onEdit={(item) => setModal({ type: "edit", item })}
            onAddImeis={(item) => setModal({ type: "imeis", item })}
            onAdjust={(item) => setModal({ type: "adjust", item })}
          />
        ) : (
          <StockTab
            onAdjust={(item: StockViewItem) => setModal({ type: "adjust", item })}
          />
        )}
      </div>

      {/* Modals */}
      <Modal isOpen={modal !== null} onClose={closeModal} title={modalTitle} maxWidth={modalMaxWidth}>
        {(modal?.type === "create" || modal?.type === "edit") && (
          <ItemFormModal
            item={modal.type === "edit" ? modal.item : null}
            onSuccess={handleSuccess}
            onCancel={closeModal}
          />
        )}
        {modal?.type === "imeis" && (
          <AddImeisModal
            item={modal.item}
            onSuccess={handleSuccess}
            onCancel={closeModal}
          />
        )}
        {modal?.type === "adjust" && (
          <StockAdjustModal
            item={modal.item}
            onSuccess={handleSuccess}
            onCancel={closeModal}
          />
        )}
      </Modal>
    </div>
  );
}
