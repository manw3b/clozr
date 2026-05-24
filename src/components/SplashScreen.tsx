import { useEffect, useMemo, useState } from "react";
import logoIsotipo from "../assets/logo-isotipo.svg";
import { pickRandomTip, type ClozrTip } from "../lib/clozrTips";
import { getCurrentVersion } from "../lib/updater";

/**
 * Una "task" del splash es algo que se está cargando en background y
 * cuyo progreso queremos mostrar al user. Pueden ser:
 *  - Pre-carga de chunks de Vite (Pipeline, Clientes, etc)
 *  - Pre-fetch de queries TanStack (clientes locales, ventas, etc)
 *  - Bootstrap de schema, etc.
 *
 * El caller (App.tsx) registra tasks; cada una declara su label y un
 * Promise. Cuando todas resuelven (o fallan — best-effort), el splash
 * queda "ready". Pero respetamos minDisplayMs igual: aunque cargue
 * todo en 200ms, mostramos splash full duración para que el user vea
 * los tips y se sienta deliberado.
 */
export interface SplashTask {
  id: string;
  label: string;
  promise: Promise<unknown>;
}

interface Props {
  /**
   * Tasks que el splash va a "esperar". Cada una se muestra en una
   * fila con su label y check cuando termina. Si está vacío, splash
   * se comporta como antes (timer puro).
   */
  tasks?: SplashTask[];
  /**
   * Tiempo mínimo visible aunque las tasks resuelvan rápido. Default 4s
   * — el sweet spot que validamos en conversación: lo suficiente para
   * leer un tip, no tan largo como para sentirse lento.
   */
  minDisplayMs?: number;
  /** Llamado cuando el fade out terminó — el caller monta la app real. */
  onDone: () => void;
}

/**
 * Splash de bienvenida: logo + versión + tip + progreso real.
 *
 * Diseño (sweet spot validado en conversación con el founder):
 *  - 4s mínimo visible → da tiempo a leer un tip + ver el progress
 *  - Progreso REAL — no spinner ofuscado. Mostramos qué se está cargando
 *    ("Catálogo ✓", "Clientes ✓", "Ventas...") para que la espera se
 *    sienta deliberada y no como "la app es lenta".
 *  - Tips rotando cada 2s mientras dure el splash.
 *  - Fade out 400ms al terminar.
 *
 * NO debe romper la app si una task falla — best-effort. El user puede
 * llegar a Mi Día con una query no pre-cacheada y eso solo significa
 * que esa pantalla va a hacer su fetch al abrirse (lo que sería el
 * comportamiento sin pre-carga). El splash captura los errores y los
 * marca como "fallido" en la UI pero igual avanza.
 */
export function SplashScreen({ tasks = [], minDisplayMs = 4000, onDone }: Props) {
  const [version, setVersion] = useState<string | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  // Estado de cada task: pending | done | failed.
  const [taskStatus, setTaskStatus] = useState<Record<string, "pending" | "done" | "failed">>(
    () => Object.fromEntries(tasks.map((t) => [t.id, "pending"])),
  );

  // Tip rotating — cambia cada 2s mientras dure el splash.
  const initialTip = useMemo(() => pickRandomTip(), []);
  const [tip, setTip] = useState<ClozrTip>(initialTip);
  const [tipKey, setTipKey] = useState(0); // re-trigger animation

  useEffect(() => {
    const interval = setInterval(() => {
      setTip(pickRandomTip());
      setTipKey((k) => k + 1);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  // Cargar versión (Tauri la tiene en memoria, es rápido).
  useEffect(() => {
    getCurrentVersion().then(setVersion);
  }, []);

  // Marcar minDisplayMs cumplido.
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), minDisplayMs);
    return () => clearTimeout(t);
  }, [minDisplayMs]);

  // Atachar handlers a cada task para trackear su progreso.
  useEffect(() => {
    for (const t of tasks) {
      t.promise
        .then(() => setTaskStatus((s) => ({ ...s, [t.id]: "done" })))
        .catch(() => setTaskStatus((s) => ({ ...s, [t.id]: "failed" })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // solo al mount — las tasks vienen del primer render

  const allTasksSettled = useMemo(
    () => tasks.every((t) => taskStatus[t.id] === "done" || taskStatus[t.id] === "failed"),
    [tasks, taskStatus],
  );

  // Ready = todas las tasks resolvieron (o no había ninguna) Y pasó el
  // tiempo mínimo. Después arrancar fade out.
  const ready = allTasksSettled || tasks.length === 0;

  useEffect(() => {
    if (!ready || !minElapsed || fadingOut) return;
    setFadingOut(true);
    const t = setTimeout(onDone, 400);
    return () => clearTimeout(t);
  }, [ready, minElapsed, fadingOut, onDone]);

  const completedCount = tasks.filter((t) => taskStatus[t.id] === "done" || taskStatus[t.id] === "failed").length;
  const progressPct = tasks.length === 0 ? 0 : (completedCount / tasks.length) * 100;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 50% 40%, rgba(232,0,29,0.08), transparent 60%), var(--bg)",
        gap: 22,
        opacity: fadingOut ? 0 : 1,
        transition: "opacity 400ms cubic-bezier(0.22, 1, 0.36, 1)",
        pointerEvents: fadingOut ? "none" : "auto",
        overflow: "hidden",
      }}
    >
      {/* Decoración: gradient sutil de fondo */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -200,
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(232,0,29,0.06), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Logo */}
      <img
        src={logoIsotipo}
        alt="Clozr"
        style={{
          height: 72,
          width: "auto",
          objectFit: "contain",
          animation: "clozr-splash-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
          filter: "drop-shadow(0 8px 32px rgba(232,0,29,0.25))",
        }}
      />

      {/* Wordmark + versión */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          animation: "clozr-splash-fade-up 500ms 200ms both",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: "var(--text)",
            letterSpacing: "-1px",
            lineHeight: 1,
          }}
        >
          Clozr<span style={{ color: "var(--primary)" }}>.</span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          {version ? `v${version}` : "Cargando…"}
        </div>
      </div>

      {/* Tip rotativo */}
      <div
        key={tipKey}
        style={{
          marginTop: 8,
          maxWidth: 460,
          minHeight: 56,
          padding: "12px 18px",
          background: "rgba(255,255,255,0.025)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          animation: "clozr-splash-fade-up 400ms both",
          backdropFilter: "blur(8px)",
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
          {tip.emoji}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {tip.text}
        </span>
      </div>

      {/* Progress real — solo si hay tasks */}
      {tasks.length > 0 && (
        <div
          style={{
            width: 460,
            maxWidth: "calc(100% - 32px)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            animation: "clozr-splash-fade-up 500ms 600ms both",
          }}
        >
          {/* Barra de progreso */}
          <div
            style={{
              width: "100%",
              height: 3,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                background: "linear-gradient(90deg, var(--primary), #ff4757)",
                borderRadius: 2,
                transition: "width 300ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          </div>

          {/* Lista de tasks con estado */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px 18px",
              fontSize: 11,
              color: "var(--text-dim)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {tasks.map((t) => {
              const status = taskStatus[t.id] ?? "pending";
              return (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: status === "pending" ? 0.55 : 1,
                    transition: "opacity 200ms",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        status === "done"
                          ? "var(--primary)"
                          : status === "failed"
                            ? "var(--text-dim)"
                            : "rgba(255,255,255,0.15)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      color: status === "done" ? "var(--text-muted)" : undefined,
                      textDecoration: status === "failed" ? "line-through" : undefined,
                    }}
                  >
                    {t.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback spinner si NO hay tasks (no debería pasar en prod pero por seguridad) */}
      {tasks.length === 0 && <SpinnerBar />}

      <style>{`
        @keyframes clozr-splash-pop {
          from { opacity: 0; transform: scale(0.6) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes clozr-splash-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes clozr-splash-bar {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function SpinnerBar() {
  return (
    <div
      style={{
        marginTop: 8,
        width: 120,
        height: 2,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "40%",
          height: "100%",
          background: "linear-gradient(90deg, transparent, var(--primary), transparent)",
          animation: "clozr-splash-bar 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        }}
      />
    </div>
  );
}
