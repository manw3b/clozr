/**
 * useTaskVisibilityFilter (G+1) — devuelve la función `shouldShow(task)`
 * que filtra las tareas visibles según el rol del user actual.
 *
 * Reglas:
 *   - owner|admin: ven TODO (necesitan supervisar el equipo).
 *   - vendedor|viewer: ven solo tareas asignadas a ellos
 *     (`assigned_to === currentUserId`) o sin asignar (`assigned_to === null`).
 *
 * "currentUserId" significa:
 *   - cloud: useCloudAuthStore.userId (el ID del user en cloud users)
 *   - local: useAuthStore.userId (el ID del member local)
 *
 * Cuando Caro abre Mi Día, ve solo las tareas que vos le asignaste a ella
 * + las tareas sin assignee (libres / del workspace). NO ve las tareas
 * que asignaste a Gonza, ni las que están solo para vos.
 */
import { useCloudAuthStore } from "../store/cloudAuthStore";
import { useAuthStore } from "../store/authStore";

export function useTaskVisibilityFilter(): (task: { assigned_to: string | null }) => boolean {
  const cloudUserId = useCloudAuthStore((s) => (s.isLoggedIn() ? s.userId : null));
  const localUserId = useAuthStore((s) => s.userId);
  const localRole = useAuthStore((s) => s.userRole);

  const effectiveUserId = cloudUserId ?? localUserId;
  const role = localRole; // useSyncCloudRole mantiene authStore.userRole en sync con el cloud role

  // Owner/admin ven todo.
  if (role === "owner" || role === "admin") {
    return () => true;
  }
  // Vendedor/viewer: solo lo suyo o sin asignar.
  return (task) => {
    if (task.assigned_to === null || task.assigned_to === undefined) return true;
    return task.assigned_to === effectiveUserId;
  };
}
