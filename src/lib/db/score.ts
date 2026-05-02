import { dbSelect } from "./index";
import { getTodayISO } from "../hooks";

export async function calculateDayScore(workspaceId: string): Promise<number> {
  const today = getTodayISO();
  let score = 0;

  // +20: at least 1 sale today
  const salesRows = await dbSelect<{ count: number }>(
    "SELECT COUNT(*) as count FROM sales WHERE workspace_id = ? AND date(created_at) = ?",
    [workspaceId, today],
  );
  if ((salesRows[0]?.count ?? 0) >= 1) score += 20;

  // +20: all routine tasks completed
  const taskRows = await dbSelect<{ total: number; done: number }>(
    `SELECT COUNT(*) as total,
            COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) as done
     FROM tasks WHERE workspace_id = ? AND type = 'rutina'`,
    [workspaceId],
  );
  const t = taskRows[0];
  if (t && t.total > 0 && t.done >= t.total) score += 20;

  // +20: no leads with >7 days inactive
  const urgentRows = await dbSelect<{ count: number }>(
    `SELECT COUNT(*) as count FROM pipeline_items
     WHERE workspace_id = ? AND status = 'open'
       AND CAST((julianday('now') - julianday(COALESCE(updated_at, created_at))) AS INTEGER) >= 7`,
    [workspaceId],
  );
  if ((urgentRows[0]?.count ?? 0) === 0) score += 20;

  // +20: cash has movements today (active day)
  const cashRows = await dbSelect<{ count: number }>(
    "SELECT COUNT(*) as count FROM cash_movements WHERE workspace_id = ? AND date(created_at) = ?",
    [workspaceId, today],
  );
  if ((cashRows[0]?.count ?? 0) >= 1) score += 20;

  // +20: at least 1 followup completed today
  const followupRows = await dbSelect<{ count: number }>(
    "SELECT COUNT(*) as count FROM followups WHERE workspace_id = ? AND completed = 1 AND date(completed_at) = ?",
    [workspaceId, today],
  );
  if ((followupRows[0]?.count ?? 0) >= 1) score += 20;

  return score;
}

export const scoreDb = { calculateDayScore };
