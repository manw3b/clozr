import { dbSelect, dbExecute } from "./index";
import type { Task, CreateTaskInput } from "./types";

export async function getAll(workspaceId: string): Promise<Task[]> {
  return dbSelect<Task>(
    "SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at ASC",
    [workspaceId],
  );
}

export async function create(
  workspaceId: string,
  data: CreateTaskInput,
): Promise<Task> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO tasks
      (id, workspace_id, type, frequency, custom_days, title, completed, due_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      id,
      workspaceId,
      data.type,
      data.frequency ?? null,
      data.custom_days ?? null,
      data.title,
      data.due_at ?? null,
      data.created_by ?? null,
      now,
    ],
  );
  return {
    id,
    workspace_id: workspaceId,
    type: data.type,
    frequency: data.frequency ?? null,
    custom_days: data.custom_days ?? null,
    title: data.title,
    completed: 0,
    completed_at: null,
    assigned_to: null,
    due_at: data.due_at ?? null,
    created_by: data.created_by ?? null,
    created_at: now,
    // Migration 030 — tareas creadas manualmente (sin template) no son
    // obligatorias y no tienen contador.
    template_id: null,
    target_count: null,
    progress: null,
  };
}

export async function toggleComplete(id: string, completed: boolean): Promise<void> {
  if (completed) {
    await dbExecute(
      "UPDATE tasks SET completed = 1, completed_at = ? WHERE id = ?",
      [new Date().toISOString(), id],
    );
  } else {
    await dbExecute(
      "UPDATE tasks SET completed = 0, completed_at = NULL WHERE id = ?",
      [id],
    );
  }
}

export async function remove(id: string): Promise<void> {
  await dbExecute("DELETE FROM tasks WHERE id = ?", [id]);
}

export async function resetRoutines(workspaceId: string): Promise<void> {
  await dbExecute(
    "UPDATE tasks SET completed = 0, completed_at = NULL WHERE workspace_id = ? AND type = 'rutina'",
    [workspaceId],
  );
}

export const tasksDb = { getAll, create, toggleComplete, remove, resetRoutines };
