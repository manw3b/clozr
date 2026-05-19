import { useEffect, useState } from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { getCurrentVersion } from "../lib/updater";
import { fetchReleaseNotes, parseChangeBullets, type ReleaseInfo } from "../lib/releaseNotes";
import { color, radius, space, text, weight } from "../tokens";
import { openUrl } from "@tauri-apps/plugin-opener";

const LS_KEY = "clozr.whatsNew.lastSeenVersion";

/**
 * Modal "¿Qué hay de nuevo?" — se dispara automáticamente la primera vez
 * que el usuario abre una versión nueva. Trae el changelog del release de
 * GitHub vía API (cero esfuerzo de mantenimiento: lo genera el workflow
 * desde los commits).
 *
 * Lógica de display:
 *  - Al montar, leemos la versión actual (tauri getVersion).
 *  - Comparamos con `clozr.whatsNew.lastSeenVersion` en localStorage.
 *  - Si son distintas: fetch release notes + mostrar modal.
 *  - Al cerrar: guardamos versión actual como "vista".
 *  - Próxima vez con la misma versión: no se muestra.
 *
 * Si la API de GitHub falla o las notes están vacías, no rompemos ni
 * mostramos un modal vacío — simplemente no aparece nada.
 */
export function WhatsNewModal() {
  const [open, setOpen] = useState(false);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const current = await getCurrentVersion();
      if (!current || cancelled) return;

      const lastSeen = localStorage.getItem(LS_KEY);
      // Primera vez en cualquier versión → marcamos como vista pero no
      // mostramos modal (sería molesto en la primera instalación).
      if (!lastSeen) {
        localStorage.setItem(LS_KEY, current);
        return;
      }
      if (lastSeen === current) return; // ya la vimos

      // Cambió la versión — fetch notes y mostrar.
      const notes = await fetchReleaseNotes(current);
      if (cancelled) return;

      // Si no encontramos notes (API caída / tag sin body), igual marcamos
      // como vista para no reintentar en cada arranque.
      if (!notes || !notes.body.trim()) {
        localStorage.setItem(LS_KEY, current);
        return;
      }

      setRelease(notes);
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleClose() {
    setOpen(false);
    if (release) {
      localStorage.setItem(LS_KEY, release.version);
    }
  }

  if (!release) return null;

  const bullets = parseChangeBullets(release.body);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: space[2] }}>
          <Sparkles size={18} color={color.primary} strokeWidth={2.4} />
          Novedades de v{release.version}
        </span>
      }
      subtitle={`Publicado ${formatDate(release.publishedAt)}`}
      maxWidth={560}
      footer={
        <>
          <Button
            variant="ghost"
            iconLeft={<ExternalLink size={13} />}
            onClick={() => {
              openUrl(release.url).catch(() => {});
            }}
          >
            Ver en GitHub
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="primary" onClick={handleClose}>
            Entendido
          </Button>
        </>
      }
    >
      {bullets.length > 0 ? (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: space[2],
          }}
        >
          {bullets.map((b, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                gap: space[3],
                fontSize: text.sm,
                color: color.text,
                lineHeight: 1.5,
                padding: `${space[2]} ${space[3]}`,
                background: color.surface2,
                borderRadius: radius.md,
                border: `1px solid ${color.border}`,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color.primary,
                  marginTop: 7,
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <ChangeBullet text={b} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div
          style={{
            fontSize: text.sm,
            color: color.textMuted,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {release.body}
        </div>
      )}
    </Modal>
  );
}

/**
 * Formatea un commit message corto para mostrar en bullet — saca el
 * prefix tipo "feat:", "fix:", "chore:" y lo convierte en un badge
 * tonal.
 */
function ChangeBullet({ text }: { text: string }) {
  const match = text.match(/^(feat|fix|chore|perf|refactor|ux|polish|docs)(\([^)]+\))?:\s*(.+)$/);
  if (!match) {
    return <span>{text}</span>;
  }
  const [, type, scope, message] = match;
  const TONE_MAP: Record<string, { bg: string; fg: string; label: string }> = {
    feat: { bg: color.successBg, fg: color.success, label: "Nuevo" },
    fix: { bg: color.warningBg, fg: color.warning, label: "Fix" },
    chore: { bg: color.surface2, fg: color.textMuted, label: "Interno" },
    perf: { bg: color.infoBg, fg: color.info, label: "Performance" },
    refactor: { bg: color.surface2, fg: color.textMuted, label: "Refactor" },
    ux: { bg: color.primaryBg, fg: color.primary, label: "UX" },
    polish: { bg: color.primaryBg, fg: color.primary, label: "Pulido" },
    docs: { bg: color.surface2, fg: color.textMuted, label: "Docs" },
  };
  const tone = TONE_MAP[type ?? ""] ?? TONE_MAP.chore!;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: space[2], flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: weight.bold,
          textTransform: "uppercase",
          letterSpacing: "0.6px",
          padding: "2px 6px",
          background: tone.bg,
          color: tone.fg,
          borderRadius: radius.sm,
          flexShrink: 0,
        }}
        title={`${type}${scope ?? ""}`}
      >
        {tone.label}
      </span>
      <span>{message}</span>
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}
