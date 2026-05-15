import { useEffect, useMemo, useState } from "react";
import logoIsotipo from "../assets/logo-isotipo.svg";
import { pickRandomTip } from "../lib/clozrTips";
import { getCurrentVersion } from "../lib/updater";

interface Props {
  /** True cuando la app terminó de cargar la data crítica.
   *  El splash espera ambos: este flag + minDisplayMs antes de hacer fade. */
  ready: boolean;
  /** Tiempo mínimo que el splash queda visible aunque la app cargue rápido.
   *  Sin esto, en máquinas rápidas el splash parpadea 50ms y queda raro. */
  minDisplayMs?: number;
  /** Llamado cuando el fade out terminó — el caller monta la app real. */
  onDone: () => void;
}

/**
 * Splash de bienvenida: logo + versión + tip random + fade out.
 *
 * Objetivos:
 *  - Que el arranque "se sienta" deliberado, no como una pantalla en blanco.
 *  - Mostrar la versión sin obligar al usuario a ir a Ajustes.
 *  - Enseñar algo (1 tip rotado del pool) en cada arranque.
 *  - Si la data tarda en cargar (workspaces grandes), tener algo para ver.
 *
 * Timing:
 *  - minDisplayMs (default 1400ms) — el splash queda visible al menos esto.
 *  - Cuando `ready=true` Y minDisplayMs pasó → arranca fade out (400ms).
 *  - Al terminar el fade, llama onDone() — el caller monta la app real.
 */
export function SplashScreen({ ready, minDisplayMs = 1400, onDone }: Props) {
  const tip = useMemo(() => pickRandomTip(), []);
  const [version, setVersion] = useState<string | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  // Cargar versión (es una await rápida — Tauri la tiene en memoria).
  useEffect(() => {
    getCurrentVersion().then(setVersion);
  }, []);

  // Marcar minDisplayMs cumplido.
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), minDisplayMs);
    return () => clearTimeout(t);
  }, [minDisplayMs]);

  // Cuando estamos listos (data + tiempo mínimo), arrancar fade out.
  useEffect(() => {
    if (!ready || !minElapsed || fadingOut) return;
    setFadingOut(true);
    const t = setTimeout(onDone, 400); // duración del fade
    return () => clearTimeout(t);
  }, [ready, minElapsed, fadingOut, onDone]);

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
        gap: 24,
        opacity: fadingOut ? 0 : 1,
        transition: "opacity 400ms cubic-bezier(0.22, 1, 0.36, 1)",
        pointerEvents: fadingOut ? "none" : "auto",
        // Asegurar que esté arriba de cualquier overlay/modal residual.
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

      {/* Logo con animación de entrada */}
      <img
        src={logoIsotipo}
        alt="Clozr"
        style={{
          height: 72,
          width: "auto",
          objectFit: "contain",
          animation:
            "clozr-splash-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
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

      {/* Tip "did you know" */}
      <div
        style={{
          marginTop: 16,
          maxWidth: 460,
          padding: "12px 18px",
          background: "rgba(255,255,255,0.025)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          animation: "clozr-splash-fade-up 500ms 400ms both",
          backdropFilter: "blur(8px)",
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
          {tip.emoji}
        </span>
        <span
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          {tip.text}
        </span>
      </div>

      {/* Spinner sutil — sólo si la espera se va estirando */}
      <SpinnerBar />

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
        animation: "clozr-splash-fade-up 500ms 600ms both",
      }}
    >
      <div
        style={{
          width: "40%",
          height: "100%",
          background:
            "linear-gradient(90deg, transparent, var(--primary), transparent)",
          animation: "clozr-splash-bar 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        }}
      />
    </div>
  );
}
