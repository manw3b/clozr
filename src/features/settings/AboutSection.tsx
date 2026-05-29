import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getCurrentVersion,
  checkForUpdateVerbose,
  type CheckResult,
} from "../../lib/updater";
import { fetchRecentReleases, parseChangeBullets, type ReleaseInfo } from "../../lib/releaseNotes";
import { formatDateFull } from "../../lib/format";
import { useUIStore } from "../../store/uiStore";

/**
 * Sección "Acerca de Clozr" en Ajustes:
 *  - Versión actual del binario instalado (visible permanentemente).
 *  - Botón "Buscar actualizaciones" — con feedback claro de errores
 *    (a diferencia del banner que es silencioso).
 *  - Historial de versiones — últimas 10 releases con sus changelogs
 *    colapsables, traídas de la API de GitHub.
 *
 * Para que el usuario:
 *  - Sepa siempre en qué versión está.
 *  - Pueda forzar un check manual si el banner no apareció.
 *  - Pueda revisar qué cambió en versiones pasadas.
 */
export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<CheckResult | null>(null);
  const [history, setHistory] = useState<ReleaseInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const { showToast } = useUIStore();

  useEffect(() => {
    getCurrentVersion().then((v) => setVersion(v));
  }, []);

  useEffect(() => {
    fetchRecentReleases(10).then((list) => {
      setHistory(list);
      setHistoryLoading(false);
    });
  }, []);

  async function handleCheck() {
    setChecking(true);
    try {
      const result = await checkForUpdateVerbose();
      setLastCheck(result);
      if (result.kind === "up-to-date") {
        showToast("Estás al día — no hay actualizaciones", "success");
      } else if (result.kind === "available") {
        showToast(`Disponible: v${result.latest.version}`, "success");
      } else {
        showToast(`Error al chequear: ${result.error}`, "error");
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.2px",
            margin: 0,
          }}
        >
          Acerca de Clozr
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-dim)",
            marginTop: 4,
            margin: "4px 0 0 0",
          }}
        >
          Versión del binario, control de actualizaciones e historial de cambios.
        </p>
      </header>

      {/* Card de versión + check */}
      <div
        style={{
          padding: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.6px",
              marginBottom: 4,
            }}
          >
            Versión instalada
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text)",
              fontFamily: "monospace",
              letterSpacing: "-0.3px",
            }}
          >
            v{version ?? "—"}
          </div>
          {lastCheck && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color:
                  lastCheck.kind === "error"
                    ? "var(--danger)"
                    : lastCheck.kind === "available"
                    ? "var(--success)"
                    : "var(--text-dim)",
              }}
            >
              {lastCheck.kind === "error"
                ? `Error: ${lastCheck.error}`
                : lastCheck.kind === "available"
                ? `Disponible: v${lastCheck.latest.version}`
                : "Estás al día"}
            </div>
          )}
        </div>
        <button
          onClick={handleCheck}
          disabled={checking}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text)",
            cursor: checking ? "not-allowed" : "pointer",
            opacity: checking ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <RefreshCw
            size={13}
            style={{ animation: checking ? "clozr-spin 0.8s linear infinite" : undefined }}
          />
          {checking ? "Buscando…" : "Buscar actualizaciones"}
        </button>
      </div>

      {/* Historial */}
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: 8,
        }}
      >
        Historial de versiones
      </h3>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
        Últimas 10 releases — los cambios se generan automáticamente desde los commits.
      </p>

      {historyLoading ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Cargando…</div>
      ) : history.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
          No pudimos cargar el historial (GitHub API caída o sin internet).
        </div>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}
        >
          {history.map((r) => (
            <ReleaseCard key={r.version} release={r} isCurrent={r.version === version} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes clozr-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ReleaseCard({ release, isCurrent }: { release: ReleaseInfo; isCurrent: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const bullets = parseChangeBullets(release.body);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${isCurrent ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 10,
        padding: "12px 14px",
        position: "relative",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: "transparent",
          width: "100%",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text)",
            fontFamily: "monospace",
            letterSpacing: "-0.2px",
          }}
        >
          v{release.version}
        </span>
        {isCurrent && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              fontWeight: 700,
              color: "var(--primary)",
              padding: "2px 6px",
              background: "var(--primary-bg)",
              borderRadius: 4,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            <Sparkles size={10} /> Tu versión
          </span>
        )}
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {formatDateFull(release.publishedAt)}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {bullets.length} {bullets.length === 1 ? "cambio" : "cambios"}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {expanded ? "▴" : "▾"}
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          {bullets.length > 0 ? (
            <ul
              style={{
                margin: 0,
                paddingLeft: 16,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 12.5,
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              {bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
              }}
            >
              {release.body || "(sin notas)"}
            </div>
          )}
          <button
            onClick={() => openUrl(release.url).catch(() => {})}
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--text-dim)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <ExternalLink size={10} /> Ver en GitHub
          </button>
        </div>
      )}
    </div>
  );
}
