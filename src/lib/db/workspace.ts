import { dbSelect, dbExecute } from "./index";
import type { Workspace } from "./types";

export async function getAll(): Promise<Workspace[]> {
  return dbSelect<Workspace>("SELECT * FROM workspaces ORDER BY created_at ASC");
}

export async function getById(id: string): Promise<Workspace | null> {
  const rows = await dbSelect<Workspace>(
    "SELECT * FROM workspaces WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function create(
  name: string,
  emoji = "🏪",
  color = "#E8001D",
): Promise<Workspace> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExecute(
    "INSERT INTO workspaces (id, name, emoji, color, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, name, emoji, color, now],
  );
  return { id, name, emoji, color, plan: "free", logo_path: null, daily_goal: 0, daily_goal_currency: "USD", created_at: now };
}

export async function update(
  id: string,
  updates: Partial<
    Pick<Workspace, "name" | "emoji" | "color" | "plan" | "daily_goal" | "daily_goal_currency">
  >,
): Promise<void> {
  const fields = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .join(", ");
  const values = [...Object.values(updates), id];
  await dbExecute(`UPDATE workspaces SET ${fields} WHERE id = ?`, values);
}

export const workspaceDb = { getAll, getById, create, update };
