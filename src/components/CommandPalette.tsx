import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Users,
  ShoppingCart,
  GitBranch,
  CheckSquare,
  Wallet,
  ArrowRight,
} from "lucide-react";
import { customersDb } from "../lib/db/customers";
import { salesDb } from "../lib/db/sales";
import { pipelineDb } from "../lib/db/pipeline";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useUIStore, type ScreenId } from "../store/uiStore";
import { color, radius, space, text, weight } from "../tokens";
import { formatMoney } from "../lib/format";

type ResultKind = "client" | "sale" | "lead" | "shortcut";

interface CommandResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  /** Texto a la derecha (ej: monto). */
  meta?: string;
  /** Acción a ejecutar al elegir. */
  action: () => void;
}

const SHORTCUTS: Array<{ id: string; label: string; screen: ScreenId; Icon: typeof Users }> = [
  { id: "go-mi-dia", label: "Ir a Mi Día", screen: "home", Icon: CheckSquare },
  { id: "go-clientes", label: "Ir a Clientes", screen: "customers", Icon: Users },
  { id: "go-pipeline", label: "Ir a Pipeline", screen: "pipeline", Icon: GitBranch },
  { id: "go-ventas", label: "Ir a Ventas", screen: "sales", Icon: ShoppingCart },
  { id: "go-caja", label: "Ir a Caja", screen: "cash", Icon: Wallet },
  { id: "go-tareas", label: "Ir a Tareas", screen: "tasks", Icon: CheckSquare },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { activeWorkspace } = useWorkspaceStore();
  const { setActiveScreen } = useUIStore();
  const wid = activeWorkspace?.id ?? "";

  // Cmd/Ctrl+K to toggle, Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Listen for the topbar trigger event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("clozr:open-cmdk", handler);
    return () => window.removeEventListener("clozr:open-cmdk", handler);
  }, []);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // Focus after the modal mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Index data when palette is open
  const customersQ = useQuery({
    queryKey: ["cmdk", "customers", wid],
    queryFn: () => customersDb.getAll(wid),
    enabled: open && !!wid,
    staleTime: 60_000,
  });
  const salesQ = useQuery({
    queryKey: ["cmdk", "sales", wid],
    queryFn: () => salesDb.getRecent(wid, 30),
    enabled: open && !!wid,
    staleTime: 60_000,
  });
  const leadsQ = useQuery({
    queryKey: ["cmdk", "leads", wid],
    queryFn: () => pipelineDb.getAll(wid),
    enabled: open && !!wid,
    staleTime: 60_000,
  });

  const results = useMemo<CommandResult[]>(() => {
    const q = query.trim().toLowerCase();
    const out: CommandResult[] = [];

    // Shortcuts (always shown when query is empty)
    if (!q) {
      for (const s of SHORTCUTS) {
        out.push({
          id: s.id,
          kind: "shortcut",
          title: s.label,
          action: () => {
            setActiveScreen(s.screen);
            setOpen(false);
          },
        });
      }
      return out;
    }

    // Filter clients by name/phone/email
    for (const c of customersQ.data ?? []) {
      if (
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      ) {
        out.push({
          id: `client-${c.id}`,
          kind: "client",
          title: c.name,
          subtitle: [c.phone, c.email].filter(Boolean).join(" · ") || c.type,
          action: () => {
            setActiveScreen("customers");
            // TODO: open client drawer with that id
            setOpen(false);
          },
        });
      }
      if (out.length >= 30) break;
    }

    // Filter sales by client/notes
    for (const s of salesQ.data ?? []) {
      const text = `${s.customer_name ?? ""} ${s.notes ?? ""}`.toLowerCase();
      if (text.includes(q)) {
        out.push({
          id: `sale-${s.id}`,
          kind: "sale",
          title: s.customer_name ?? "Sin cliente",
          subtitle: s.notes ?? "Venta",
          meta: formatMoney(s.total),
          action: () => {
            setActiveScreen("sales");
            setOpen(false);
          },
        });
      }
      if (out.length >= 50) break;
    }

    // Filter leads by client name
    for (const l of leadsQ.data ?? []) {
      if ((l.customer_name ?? "").toLowerCase().includes(q)) {
        out.push({
          id: `lead-${l.id}`,
          kind: "lead",
          title: l.customer_name ?? "Lead",
          subtitle: l.stage_name,
          meta: l.estimated_value ? formatMoney(l.estimated_value) : undefined,
          action: () => {
            setActiveScreen("pipeline");
            setOpen(false);
          },
        });
      }
      if (out.length >= 70) break;
    }

    return out;
  }, [query, customersQ.data, salesQ.data, leadsQ.data, setActiveScreen]);

  // Reset activeIdx if results change
  useEffect(() => {
    if (activeIdx >= results.length) setActiveIdx(0);
  }, [results, activeIdx]);

  // Keyboard nav within the list
  function handleListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[activeIdx]?.action();
    }
  }

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
        animation: "clozr-cmdk-fade 180ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleListKey}
        style={{
          width: "min(640px, calc(100vw - 32px))",
          maxHeight: "70vh",
          background: color.surface,
          border: `1px solid ${color.borderStrong}`,
          borderRadius: radius.xl,
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space[3],
            padding: `${space[3]} ${space[4]}`,
            borderBottom: `1px solid ${color.border}`,
            flexShrink: 0,
          }}
        >
          <Search size={16} color={color.textDim} strokeWidth={2.2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clientes, ventas, leads…"
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              outline: 0,
              color: color.text,
              fontSize: text.md,
            }}
          />
          <kbd
            style={{
              fontSize: 10,
              fontWeight: weight.medium,
              color: color.textMuted,
              padding: "2px 6px",
              background: color.bg,
              border: `1px solid ${color.border}`,
              borderRadius: radius.sm,
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
          {results.length === 0 ? (
            <div style={{ padding: `${space[6]} ${space[4]}`, textAlign: "center", color: color.textMuted, fontSize: text.sm }}>
              {query ? "Sin resultados" : "Empezá a escribir para buscar"}
            </div>
          ) : (
            results.map((r, i) => (
              <CommandRow
                key={r.id}
                result={r}
                active={i === activeIdx}
                onHover={() => setActiveIdx(i)}
                onClick={() => r.action()}
              />
            ))
          )}
        </div>
      </div>

      <style>{`
        @keyframes clozr-cmdk-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

function CommandRow({
  result,
  active,
  onHover,
  onClick,
}: {
  result: CommandResult;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const ICON = {
    client: Users,
    sale: ShoppingCart,
    lead: GitBranch,
    shortcut: ArrowRight,
  } as const;
  const Icon = ICON[result.kind];

  return (
    <button
      onMouseMove={onHover}
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: `${space[2]} ${space[3]}`,
        borderRadius: radius.md,
        background: active ? color.surfaceHover : "transparent",
        display: "flex",
        alignItems: "center",
        gap: space[3],
        color: color.text,
        cursor: "pointer",
        transition: "background 80ms",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.sm,
          background: color.surface2,
          color: color.textMuted,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.medium,
            color: color.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {result.title}
        </div>
        {result.subtitle && (
          <div
            style={{
              fontSize: text.xs,
              color: color.textMuted,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {result.subtitle}
          </div>
        )}
      </div>
      {result.meta && (
        <span style={{ fontSize: text.xs, color: color.textMuted, fontWeight: weight.semibold, flexShrink: 0 }}>
          {result.meta}
        </span>
      )}
    </button>
  );
}
