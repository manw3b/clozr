/**
 * Helper para abrir URLs externas (WhatsApp, tel:, mailto:) en Tauri.
 *
 * `window.open(url)` en Tauri NO abre URLs en el navegador del SO — la
 * webview intenta navegar dentro del app (bloqueado por seguridad).
 * El plugin-opener llama a la shell del SO (`ShellExecute` en Windows,
 * `open` en macOS, `xdg-open` en Linux), que respeta los URL handlers
 * registrados — `wa.me/<phone>` abre WhatsApp Desktop si está instalado,
 * o el navegador por defecto que redirige a WhatsApp Web.
 *
 * Fallback a `window.open` si el plugin no está disponible (ej: corriendo
 * en navegador puro durante dev sin tauri dev).
 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { log } from "./logger";

/** Abre cualquier URL externa con la app default del SO.
 *  Si el plugin falla (ej: corriendo en navegador puro), cae a window.open
 *  como fallback — en Tauri esto NO va a abrir realmente la URL externa,
 *  pero al menos loggeamos el error con detalle. */
export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch (err) {
    log.error("openUrl falló — la URL no se va a abrir", {
      scope: "opener",
      data: { url },
      err,
    });
    // Fallback (solo útil fuera de Tauri):
    try {
      window.open(url, "_blank");
    } catch {
      /* ignore */
    }
  }
}

/** Abre WhatsApp con un teléfono argentino. Normaliza a formato internacional. */
export async function openWhatsApp(
  phone: string,
  message?: string,
): Promise<void> {
  const num = phone.replace(/\D/g, "");
  // Argentina: si no arranca con 54, lo prepended
  const final = num.startsWith("54") ? num : `54${num}`;
  const url = message
    ? `https://wa.me/${final}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${final}`;
  await openExternal(url);
}

/** Discador del SO. */
export async function openTel(phone: string): Promise<void> {
  await openExternal(`tel:${phone}`);
}

/** Cliente de mail del SO. */
export async function openMail(email: string, subject?: string): Promise<void> {
  const url = subject
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${email}`;
  await openExternal(url);
}
