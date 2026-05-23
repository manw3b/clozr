/**
 * useUserActivity — track de actividad reciente del usuario (mouse/keyboard/
 * touch). Devuelve `true` mientras hubo input en los últimos N ms.
 *
 * Por qué: el polling cloud corre cada 5s. Si nadie está usando la app
 * (ej: la dejaron abierta y se fueron a almorzar), 12 polls/min/PC son
 * 720/hora desperdiciados. Cuando detectamos idle, useCloudQueryConfig
 * sube el intervalo a 30s — sigue refrescando para que al volver el dato
 * sea reciente, pero 6x menos carga.
 *
 * Page Visibility API ya pausa polls automáticamente cuando se minimiza
 * el WebView (TanStack lo respeta vía refetchIntervalInBackground=false).
 * Esto es el caso "ventana visible, usuario no toca nada".
 */
import { useEffect, useState } from "react";

const IDLE_AFTER_MS = 2 * 60_000; // 2 min sin input → idle
const EVENTS: Array<keyof WindowEventMap> = [
  "mousemove", "mousedown", "keydown", "scroll", "touchstart", "focus",
];

// Estado global compartido entre todos los hooks — no tiene sentido tener
// N timers idénticos. Cada hook se suscribe vía subscriber set.
let lastActivity = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<(active: boolean) => void>();

function markActive(): void {
  const wasIdle = Date.now() - lastActivity > IDLE_AFTER_MS;
  lastActivity = Date.now();
  if (wasIdle) {
    for (const fn of subscribers) fn(true);
  }
}

function ensureListenersAttached(): void {
  if (timer !== null) return;
  for (const ev of EVENTS) window.addEventListener(ev, markActive, { passive: true });
  // Check periódico para emitir "se volvió idle" — sin un timer no podríamos
  // notificar la transición activa→idle (solo sabríamos en el próximo input).
  timer = setInterval(() => {
    const active = Date.now() - lastActivity < IDLE_AFTER_MS;
    for (const fn of subscribers) fn(active);
  }, 30_000);
}

export function useUserActivity(): boolean {
  const [active, setActive] = useState(() => Date.now() - lastActivity < IDLE_AFTER_MS);

  useEffect(() => {
    ensureListenersAttached();
    subscribers.add(setActive);
    // Sync inicial — por si hubo input mientras montaba.
    setActive(Date.now() - lastActivity < IDLE_AFTER_MS);
    return () => {
      subscribers.delete(setActive);
    };
  }, []);

  return active;
}
