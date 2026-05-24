/**
 * useDailyGoal — devuelve la meta diaria del workspace activo.
 *
 * G/A4: cuando hay sesión cloud activa, el daily_goal viene del workspace
 * cloud (compartido con todo el equipo). Sin cloud, fallback al workspace
 * local — comportamiento pre-G.
 *
 * Reactive — re-renderea cuando el dueño actualiza la meta desde Ajustes
 * (el cloud store invalida → React re-evalúa).
 */
import { useCloudAuthStore } from "../store/cloudAuthStore";
import { useWorkspaceStore } from "../store/workspaceStore";

export interface DailyGoal {
  amount: number;
  currency: string;
  count: number;
}

export function useDailyGoal(): DailyGoal {
  const cloudWs = useCloudAuthStore((s) => {
    if (!s.isLoggedIn() || !s.activeWorkspaceId) return null;
    return s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null;
  });
  const localWs = useWorkspaceStore((s) => s.activeWorkspace);

  if (cloudWs && cloudWs.daily_goal !== undefined) {
    return {
      amount: Number(cloudWs.daily_goal ?? 0),
      currency: cloudWs.daily_goal_currency ?? "USD",
      count: Number(cloudWs.daily_goal_count ?? 0),
    };
  }
  return {
    amount: Number(localWs?.daily_goal ?? 0),
    currency: localWs?.daily_goal_currency ?? "USD",
    count: Number(localWs?.daily_goal_count ?? 0),
  };
}
