import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { color, radius, space, text, weight } from "../tokens";

interface Shortcut {
  keys: string[];
  label: string;
}

interface Group {
  title: string;
  items: Shortcut[];
}

const GROUPS: Group[] = [
  {
    title: "Acciones rápidas",
    items: [
      { keys: ["V"], label: "Nueva venta" },
      { keys: ["C"], label: "Nuevo cliente" },
      { keys: ["M"], label: "Nuevo movimiento de caja" },
      { keys: ["T"], label: "Nueva tarea" },
      { keys: ["L"], label: "Ir al pipeline (lead)" },
    ],
  },
  {
    title: "Navegación",
    items: [
      { keys: ["1"], label: "Mi Día" },
      { keys: ["2"], label: "Pipeline" },
      { keys: ["3"], label: "Clientes" },
      { keys: ["4"], label: "Ventas" },
      { keys: ["5"], label: "Caja" },
      { keys: ["6"], label: "Deudas" },
      { keys: ["7"], label: "Inventario" },
      { keys: ["8"], label: "Tareas" },
      { keys: ["9"], label: "Reportes" },
    ],
  },
  {
    title: "General",
    items: [
      { keys: ["⌘", "K"], label: "Búsqueda global" },
      { keys: ["?"], label: "Mostrar este menú" },
      { keys: ["Esc"], label: "Cerrar diálogos" },
    ],
  },
];

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Atajos de teclado" maxWidth={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: space[5] }}>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3
              style={{
                margin: 0,
                marginBottom: space[2],
                fontSize: text.xs,
                fontWeight: weight.semibold,
                color: color.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.6px",
              }}
            >
              {g.title}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {g.items.map((s) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: `${space[2]} ${space[3]}`,
                    borderRadius: radius.sm,
                    background: color.surface2,
                    fontSize: text.sm,
                    color: color.text,
                  }}
                >
                  <span>{s.label}</span>
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        style={{
                          fontSize: 11,
                          fontWeight: weight.semibold,
                          color: color.text,
                          padding: "2px 8px",
                          background: color.bg,
                          border: `1px solid ${color.border}`,
                          borderRadius: radius.sm,
                          fontFamily: "inherit",
                          minWidth: 18,
                          textAlign: "center",
                        }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
