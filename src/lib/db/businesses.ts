import { dbSelect, dbExecute } from "./index";
import type { Business, CreateBusinessInput } from "./types";

export async function getAll(workspaceId: string): Promise<Business[]> {
  return dbSelect<Business>(
    "SELECT * FROM businesses WHERE workspace_id = ? AND active = 1 ORDER BY sort_order ASC, created_at ASC",
    [workspaceId],
  );
}

export async function getById(id: string): Promise<Business | null> {
  const rows = await dbSelect<Business>("SELECT * FROM businesses WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function create(workspaceId: string, data: CreateBusinessInput): Promise<Business> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const b: Business = {
    id,
    workspace_id: workspaceId,
    name: data.name,
    emoji: data.emoji ?? "🏪",
    color: data.color ?? "#E8001D",
    daily_goal: data.daily_goal ?? 0,
    currency: data.currency ?? "ARS",
    active: 1,
    sort_order: 0,
    created_at: now,
  };
  await dbExecute(
    `INSERT INTO businesses (id, workspace_id, name, emoji, color, daily_goal, currency, active, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
    [id, workspaceId, b.name, b.emoji, b.color, b.daily_goal, b.currency, now],
  );
  return b;
}

export async function update(
  id: string,
  data: Partial<Pick<Business, "name" | "emoji" | "color" | "daily_goal" | "currency">>,
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.name !== undefined) mapped.name = data.name;
  if (data.emoji !== undefined) mapped.emoji = data.emoji;
  if (data.color !== undefined) mapped.color = data.color;
  if (data.daily_goal !== undefined) mapped.daily_goal = data.daily_goal;
  if (data.currency !== undefined) mapped.currency = data.currency;
  if (Object.keys(mapped).length === 0) return;
  const fields = Object.keys(mapped).map((k) => `${k} = ?`).join(", ");
  await dbExecute(`UPDATE businesses SET ${fields} WHERE id = ?`, [...Object.values(mapped), id]);
}

export async function remove(id: string): Promise<void> {
  await dbExecute("UPDATE businesses SET active = 0 WHERE id = ?", [id]);
}

export const businessesDb = { getAll, getById, create, update, remove };
