import { dbSelect, dbExecute } from "./index";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { tasksApi, type CloudTask } from "../cloudAuth";
import { log } from "../logger";
import type { Task, CreateTaskInput } from "./types";

function cloudCtx(): { jwt: string; wsId: string } | null {
  const s = useCloudAuthStore.getState();
  if (!s.isCloudModeFor("tasks")) return null;
  if (!s.jwt || !s.activeWorkspaceId) return null;
  return { jwt: s.jwt, wsId: s.activeWorkspaceId };
}

function cloudTaskToLocal(c: CloudTask, localWid: string): Task {
  const c2 = c as unknown as Record<string, unknown>;
  return {
    id: c.id,
    workspace_id: localWid,
    type: String(c2.type ?? "rutina"),
    frequency: (c2.frequency as string | null) ?? null,
    custom_days: null,
    title: c.title,
    completed: c.completed,
    completed_at: (c2.completed_at as string | null) ?? null,
    assigned_to: (c2.assigned_to as string | null) ?? null,
    due_at: c.due_at,
    created_by: (c2.created_by as string | null) ?? null,
    created_at: String(c2.created_at ?? ""),
    template_id: (c2.template_id as string | null) ?? null,
    target_count: (c2.target_count as number | null) ?? null,
    progress: (c2.progress as number | null) ?? null,
  } as Task;
}

export async function getAll(workspaceId: string): Promise<Task[]> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await tasksApi.list(ctx.jwt, ctx.wsId);
    if (res.ok) return res.data.items.map((t) => cloudTaskToLocal(t, workspaceId));
    log.warn("getAll cloud falló", { scope: "tasksDb", data: { error: res.error } });
  }
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
  const taskOut: Task = {
    id, workspace_id: workspaceId,
    type: data.type,
    frequency: data.frequency ?? null,
    custom_days: data.custom_days ?? null,
    title: data.title,
    completed: 0, completed_at: null, assigned_to: null,
    due_at: data.due_at ?? null,
    created_by: data.created_by ?? null,
    created_at: now,
    template_id: null, target_count: null, progress: null,
  };

  const ctx = cloudCtx();
  if (ctx) {
    const res = await tasksApi.create(ctx.jwt, ctx.wsId, {
      id, type: data.type,
      frequency: data.frequency ?? null,
      title: data.title,
      due_at: data.due_at ?? null,
      completed: 0,
    } as Partial<CloudTask>);
    if (!res.ok) throw new Error(`No se pudo crear tarea en la nube: ${res.error}`);
    return taskOut;
  }

  await dbExecute(
    `INSERT INTO tasks
      (id, workspace_id, type, frequency, custom_days, title, completed, due_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      id, workspaceId, data.type,
      data.frequency ?? null, data.custom_days ?? null,
      data.title, data.due_at ?? null, data.created_by ?? null, now,
    ],
  );
  return taskOut;
}

export async function toggleComplete(id: string, completed: boolean): Promise<void> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await tasksApi.update(ctx.jwt, ctx.wsId, id, {
      completed: completed ? 1 : 0,
      completed_at: completed ? new Date().toISOString() : null,
    } as Partial<CloudTask>);
    if (!res.ok) throw new Error(`No se pudo togglear en la nube: ${res.error}`);
    return;
  }
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
  const ctx = cloudCtx();
  if (ctx) {
    const res = await tasksApi.remove(ctx.jwt, ctx.wsId, id);
    if (!res.ok) throw new Error(`No se pudo borrar en la nube: ${res.error}`);
    return;
  }
  await dbExecute("DELETE FROM tasks WHERE id = ?", [id]);
}

export async function resetRoutines(workspaceId: string): Promise<void> {
  await dbExecute(
    "UPDATE tasks SET completed = 0, completed_at = NULL WHERE workspace_id = ? AND type = 'rutina'",
    [workspaceId],
  );
}

export const tasksDb = { getAll, create, toggleComplete, remove, resetRoutines };
