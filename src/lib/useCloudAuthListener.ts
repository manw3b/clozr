/**
 * useCloudAuthListener — hook global que escucha el event "auth:deep-link"
 * que dispara el handler de Rust (src-tauri/src/main.rs) cuando el SO le
 * pasa un URL clozr:// a la app.
 *
 * Lo llamamos UNA SOLA VEZ desde App.tsx, al boot. Maneja success y error
 * cases, llena cloudAuthStore, y muestra toast.
 *
 * Si la app está cerrada y el user clickea el link del email:
 *   1. SO ve scheme clozr:// → busca handler → ejecuta Clozr.exe con el URL
 *   2. Rust setup() arranca, .on_open_url se registra, recibe el evento
 *   3. Rust emit "auth:deep-link" → este hook lo recibe → guarda sesión
 *
 * Si la app ya está abierta:
 *   1. SO intenta lanzar 2da instancia
 *   2. single-instance intercepta, manda argv a la 1ra instancia
 *   3. deep-link plugin (con feature "deep-link" en single-instance) parsea
 *      el URL y dispara on_open_url
 *   4. Mismo path: emit → hook → guarda sesión
 */

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useCloudAuthStore } from "../store/cloudAuthStore";
import { useUIStore } from "../store/uiStore";
import { parseAuthDeepLink, parseJwtPayload } from "./cloudAuth";

const REASON_LABELS: Record<string, string> = {
  invalid_token: "El link de acceso no es válido. Pedí uno nuevo.",
  already_used: "Ese link ya se usó. Pedí uno nuevo desde Ajustes.",
  expired: "El link expiró (válido por 15 min). Pedí uno nuevo.",
  missing_token: "El link no tiene token.",
};

export function useCloudAuthListener(): void {
  const setSession = useCloudAuthStore((s) => s.setSession);
  const showToast = useUIStore((s) => s.showToast);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    (async () => {
      try {
        const unl = await listen<string>("auth:deep-link", (event) => {
          const url = event.payload;
          // eslint-disable-next-line no-console
          console.log("[cloud-auth] deep link received:", url);

          const parsed = parseAuthDeepLink(url);
          if (!parsed) {
            // URL clozr:// con un path que no reconocemos. Ignoramos en
            // silencio — capaz es un deep link de otra feature futura.
            // eslint-disable-next-line no-console
            console.warn("[cloud-auth] unrecognized deep link:", url);
            return;
          }

          if (parsed.type === "error") {
            const label = REASON_LABELS[parsed.reason ?? ""] ?? "No se pudo entrar.";
            showToast(label, "error");
            return;
          }

          // success — parsear JWT para sacar uid/sub/exp
          const jwt = parsed.jwt;
          if (!jwt) {
            showToast("Login falló: token vacío", "error");
            return;
          }
          const payload = parseJwtPayload(jwt);
          if (!payload) {
            showToast("Login falló: token inválido", "error");
            return;
          }

          // El email no está en el JWT (decidimos no meterlo). Por ahora
          // lo dejamos vacío; lo va a setear quien dispara el flow
          // (CloudAccountSection guarda el email pendiente en sessionStorage
          // antes de pedir el link, y lo recupera acá).
          const pendingEmail = sessionStorage.getItem("clozr:pending-login-email") ?? "";
          sessionStorage.removeItem("clozr:pending-login-email");

          setSession({
            jwt,
            email: pendingEmail,
            userId: payload.uid,
            sessionId: payload.sub,
            expiresAt: payload.exp,
          });
          showToast(`Conectado a la nube${pendingEmail ? " como " + pendingEmail : ""}`, "success");
        });
        unlistenFn = unl;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[cloud-auth] failed to listen:", e);
      }
    })();

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [setSession, showToast]);
}
