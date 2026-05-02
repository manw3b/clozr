import { dbSelect, dbExecute } from "./index";
import type { Followup, CreateFollowupInput } from "./types";

export async function getForDay(
  workspaceId: string,
  businessId: string,
  date: string,
): Promise<Followup[]> {
  return dbSelect<Followup>(
    `SELECT * FROM followups
     WHERE workspace_id = ? AND business_id = ?
       AND (due_date <= ? OR (due_date = ? AND completed = 0))
     ORDER BY completed ASC, due_date ASC`,
    [workspaceId, businessId, date, date],
  );
}

export async function getAll(workspaceId: string, businessId: string): Promise<Followup[]> {
  return dbSelect<Followup>(
    `SELECT * FROM followups
     WHERE workspace_id = ? AND business_id = ?
     ORDER BY completed ASC, due_date ASC`,
    [workspaceId, businessId],
  );
}

export async function create(
  workspaceId: string,
  businessId: string,
  data: CreateFollowupInput,
): Promise<Followup> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO followups (id, workspace_id, business_id, customer_id, customer_name, text, due_date, completed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, workspaceId, businessId, data.customer_id ?? null, data.customer_name ?? null, data.text, data.due_date, now],
  );
  return {
    id, workspace_id: workspaceId, business_id: businessId,
    customer_id: data.customer_id ?? null, customer_name: data.customer_name ?? null,
    text: data.text, due_date: data.due_date,
    completed: 0, completed_at: null, created_at: now,
  };
}

export async function toggleComplete(id: string, completed: boolean): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    "UPDATE followups SET completed = ?, completed_at = ? WHERE id = ?",
    [completed ? 1 : 0, completed ? now : null, id],
  );
}

export async function remove(id: string): Promise<void> {
  await dbExecute("DELETE FROM followups WHERE id = ?", [id]);
}

export const followupsDb = { getForDay, getAll, create, toggleComplete, remove };
