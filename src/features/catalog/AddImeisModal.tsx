import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { catalogDb } from "../../lib/db/catalog";
import { useUIStore } from "../../store/uiStore";
import type { CatalogImei, CatalogItemWithImeis } from "../../lib/db/types";

const IMEI_REGEX = /^\d{15}$/;

interface Props {
  item: CatalogItemWithImeis;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AddImeisModal({ item, onSuccess, onCancel }: Props) {
  const { showToast } = useUIStore();
  const [rawText, setRawText] = useState("");
  const [currentImeis, setCurrentImeis] = useState<CatalogImei[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const validImeis = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => IMEI_REGEX.test(l));

  const duplicates = validImeis.filter((imei) =>
    currentImeis.some((ci) => ci.imei === imei),
  );
  const newImeis = validImeis.filter((imei) =>
    !currentImeis.some((ci) => ci.imei === imei),
  );

  useEffect(() => {
    catalogDb.getImeisForItem(item.id)
      .then(setCurrentImeis)
      .catch(() => {});
  }, [item.id]);

  const handleAdd = async () => {
    if (newImeis.length === 0) return;
    setIsSubmitting(true);
    try {
      const { added } = await catalogDb.addImeis(item.id, newImeis);
      showToast(`${added} IMEI${added !== 1 ? "s" : ""} agregado${added !== 1 ? "s" : ""}`, "success");
      onSuccess();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al agregar IMEIs");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (imeiId: string) => {
    setDeletingId(imeiId);
    try {
      await catalogDb.deleteImei(imeiId);
      setCurrentImeis((prev) => prev.filter((i) => i.id !== imeiId));
      showToast("IMEI eliminado", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al eliminar IMEI");
    } finally {
      setDeletingId(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div>
      {/* Textarea */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
          Pegá los IMEIs (uno por línea)
        </label>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={"351234567890123\n351234567890124\n..."}
          rows={5}
          style={{ ...inputStyle, resize: "none", lineHeight: 1.6, fontFamily: "monospace", fontSize: 12 }}
        />
      </div>

      {/* Preview */}
      {rawText.trim() && (
        <div style={{
          padding: "8px 12px", borderRadius: 8, marginBottom: 14,
          background: newImeis.length > 0 ? "rgba(48,209,88,0.1)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${newImeis.length > 0 ? "rgba(48,209,88,0.2)" : "var(--border)"}`,
        }}>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            <span style={{ fontWeight: 600, color: newImeis.length > 0 ? "var(--green)" : "var(--text-tertiary)" }}>
              {newImeis.length} IMEI{newImeis.length !== 1 ? "s" : ""} nuevo{newImeis.length !== 1 ? "s" : ""}
            </span>
            {duplicates.length > 0 && (
              <span style={{ color: "var(--amber)", marginLeft: 10 }}>
                · {duplicates.length} duplicado{duplicates.length !== 1 ? "s" : ""}
              </span>
            )}
            {validImeis.length !== rawText.split("\n").filter((l) => l.trim()).length && (
              <span style={{ color: "var(--text-tertiary)", marginLeft: 10 }}>
                · {rawText.split("\n").filter((l) => l.trim()).length - validImeis.length} inválido{rawText.split("\n").filter((l) => l.trim()).length - validImeis.length !== 1 ? "s" : ""}
              </span>
            )}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
            Los IMEIs válidos son exactamente 15 dígitos numéricos
          </p>
        </div>
      )}

      {/* Current IMEIs */}
      {currentImeis.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            IMEIs actuales ({currentImeis.length})
          </p>
          <div style={{
            border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
            maxHeight: 200, overflowY: "auto",
          }}>
            {currentImeis.map((imei) => (
              <div
                key={imei.id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <code style={{ fontSize: 12, color: "var(--text-primary)", fontFamily: "monospace" }}>
                    {imei.imei}
                  </code>
                  {imei.sold_at ? (
                    <span style={{
                      fontSize: 10, padding: "1px 6px",
                      background: "rgba(99,99,102,0.2)", color: "var(--text-tertiary)",
                      borderRadius: 10, fontWeight: 600,
                    }}>
                      Vendido
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 10, padding: "1px 6px",
                      background: "rgba(48,209,88,0.15)", color: "var(--green)",
                      borderRadius: 10, fontWeight: 600,
                    }}>
                      Disponible
                    </span>
                  )}
                </div>
                {!imei.sold_at && (
                  <button
                    onClick={() => handleDelete(imei.id)}
                    disabled={deletingId === imei.id}
                    style={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center", opacity: deletingId === imei.id ? 0.5 : 1 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onCancel}
          style={{ padding: "8px 16px", background: "var(--surface-2)", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}
        >
          Cerrar
        </button>
        <button
          onClick={handleAdd}
          disabled={newImeis.length === 0 || isSubmitting}
          style={{
            padding: "8px 18px", background: "var(--brand)", borderRadius: 8,
            fontSize: 13, fontWeight: 600, color: "#fff",
            opacity: newImeis.length === 0 || isSubmitting ? 0.5 : 1,
          }}
        >
          {isSubmitting ? "Agregando..." : `Agregar ${newImeis.length} IMEI${newImeis.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
