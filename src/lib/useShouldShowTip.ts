/**
 * useShouldShowTip — gate para el modal "¿Sabías que…?" (J1).
 *
 * Reglas (decididas con el user — "todo bajo tus recomendaciones"):
 *   1. Máximo 1 vez por semana (7 días = 7 × 24h desde lastShown).
 *   2. Solo en la PRIMERA llegada del día — si ya se vio (o se silenció)
 *      en esta sesión, no vuelve a aparecer hasta refresh del próximo día.
 *   3. El user puede silenciar permanentemente con "No mostrar más".
 *   4. Pequeño delay desde el login (3s) para no chocar con el splash.
 *
 * localStorage keys:
 *   clozr:tips:lastShown   → ISO timestamp del último show
 *   clozr:tips:seenIds     → JSON array de ids ya vistos
 *   clozr:tips:silenced    → "1" si el user pidió no ver más
 *
 * Uso:
 *   const { tip, dismiss, silence, markSeen } = useShouldShowTip();
 *   if (tip) return <TipsModal tip={tip} ... />;
 */

import { useEffect, useState, useCallback } from "react";
import { pickFeatureTip, type FeatureTip } from "./clozrTips";

const LS_LAST_SHOWN = "clozr:tips:lastShown";
const LS_SEEN_IDS = "clozr:tips:seenIds";
const LS_SILENCED = "clozr:tips:silenced";
const LS_SESSION_DISMISSED = "clozr:tips:sessionDismissed"; // sessionStorage

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 3000;

function readSeenIds(): string[] {
  try {
    const raw = localStorage.getItem(LS_SEEN_IDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function shouldShow(): boolean {
  // Silenciado permanentemente?
  if (localStorage.getItem(LS_SILENCED) === "1") return false;
  // Ya descartado en esta sesión?
  try {
    if (sessionStorage.getItem(LS_SESSION_DISMISSED) === "1") return false;
  } catch {
    /* sessionStorage puede fallar en webview muy locked-down */
  }
  // Hace menos de 1 semana?
  const last = localStorage.getItem(LS_LAST_SHOWN);
  if (last) {
    const lastTs = Date.parse(last);
    if (!isNaN(lastTs) && Date.now() - lastTs < WEEK_MS) return false;
  }
  return true;
}

export function useShouldShowTip(enabled: boolean): {
  tip: FeatureTip | null;
  dismiss: () => void;
  silence: () => void;
} {
  const [tip, setTip] = useState<FeatureTip | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!shouldShow()) return;

    const handle = setTimeout(() => {
      if (!shouldShow()) return; // re-check por si cambió entre tanto
      const seen = readSeenIds();
      const picked = pickFeatureTip(seen);
      setTip(picked);
      // Marcamos lastShown + seenId al mostrarlo (no al cerrarlo) —
      // si el user lo cierra inmediato, igual cuenta como visto esta semana.
      try {
        localStorage.setItem(LS_LAST_SHOWN, new Date().toISOString());
        const newSeen = [...seen, picked.id].slice(-50); // cap
        localStorage.setItem(LS_SEEN_IDS, JSON.stringify(newSeen));
      } catch {
        /* quota / disabled */
      }
    }, SHOW_DELAY_MS);

    return () => clearTimeout(handle);
  }, [enabled]);

  const dismiss = useCallback(() => {
    setTip(null);
    try {
      sessionStorage.setItem(LS_SESSION_DISMISSED, "1");
    } catch {
      /* */
    }
  }, []);

  const silence = useCallback(() => {
    setTip(null);
    try {
      localStorage.setItem(LS_SILENCED, "1");
      sessionStorage.setItem(LS_SESSION_DISMISSED, "1");
    } catch {
      /* */
    }
  }, []);

  return { tip, dismiss, silence };
}
