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

/**
 * Abre WhatsApp con un teléfono argentino. Normaliza a formato internacional.
 *
 * Estrategia: intenta primero el deep link `whatsapp://send?...` que abre
 * WhatsApp Desktop directo si está instalado. Si la app no está registrada
 * como URL handler (ej: usuario sin WhatsApp Desktop), cae a `wa.me/<num>`
 * que sí abre en navegador → WhatsApp Web.
 */
export async function openWhatsApp(
  phone: string,
  message?: string,
): Promise<void> {
  const num = phone.replace(/\D/g, "");
  // Argentina: si no arranca con 54, lo prepended
  const final = num.startsWith("54") ? num : `54${num}`;
  const textParam = message ? `&text=${encodeURIComponent(message)}` : "";

  // 1) Deep link a la app
  const deepLink = `whatsapp://send?phone=${final}${textParam}`;
  try {
    await openUrl(deepLink);
    return;
  } catch (err) {
    log.warn("WhatsApp Desktop no está disponible, abriendo wa.me", {
      scope: "opener",
      data: { deepLink },
      err,
    });
  }

  // 2) Fallback: navegador → WhatsApp Web
  const webUrl = message
    ? `https://wa.me/${final}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${final}`;
  await openExternal(webUrl);
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
