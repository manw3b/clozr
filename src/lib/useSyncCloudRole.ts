/**
 * useSyncCloudRole — cuando hay sesión cloud activa, mantiene el
 * authStore.userRole en sync con el rol del workspace activo.
 *
 * Por qué este puente en vez de tocar can() / callsites: hay ~50
 * llamadas a `can(userRole, "permName")` desperdigadas. Reemplazar todas
 * sería invasivo. Más simple: sincronizamos el rol local con el cloud
 * y dejamos que todo el código existente funcione sin cambio.
 *
 * Caveat: cuando cerrás sesión cloud, NO revertimos automáticamente el
 * userRole al valor anterior (no lo guardamos). Queda con el último
 * cloud role; el user puede cambiarlo manualmente desde el LoginScreen
 * local si vuelve al modo offline. En la práctica esto va a ser raro
 * porque cuando F2-B+ migre los datos, el cloud login va a ser obligatorio.
 */

import { useEffect } from "react";
import { useCloudAuthStore } from "../store/cloudAuthStore";
import { useAuthStore, type UserRole } from "../store/authStore";

const VALID_ROLES = new Set<UserRole>(["owner", "admin", "vendedor", "viewer"]);

export function useSyncCloudRole(): void {
  const cloudActiveWorkspace = useCloudAuthStore((s) => s.activeWorkspaceId);
  const cloudWorkspaces = useCloudAuthStore((s) => s.workspaces);
  const isLoggedIn = useCloudAuthStore((s) => s.isLoggedIn);
  const setUserRole = useAuthStore((s) => s.setUserRole);

  useEffect(() => {
    if (!isLoggedIn()) return;
    const active = cloudWorkspaces.find((w) => w.id === cloudActiveWorkspace);
    if (!active) return;
    if (!VALID_ROLES.has(active.role as UserRole)) return;
    setUserRole(active.role as UserRole);
  }, [cloudActiveWorkspace, cloudWorkspaces, isLoggedIn, setUserRole]);
}
