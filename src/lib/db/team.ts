import { dbSelect, dbExecute } from "./index";
import type { WorkspaceMember, MemberRole } from "./types";

export interface AddMemberInput {
  name: string;
  email: string;
  phone?: string | null;
  role_description?: string | null;
  avatar_color?: string | null;
  notes?: string | null;
}

export async function getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  return dbSelect<WorkspaceMember>(
    `SELECT wm.user_id, wm.workspace_id, wm.role, wm.joined_at,
            u.name, u.email, u.phone, u.role_description, u.avatar_color, u.notes
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ?
     ORDER BY
       CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'vendedor' THEN 2 ELSE 3 END,
       u.name ASC`,
    [workspaceId],
  );
}

export async function addMember(
  workspaceId: string,
  data: AddMemberInput,
  role: Exclude<MemberRole, "owner">,
): Promise<WorkspaceMember> {
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO users (id, name, email, avatar_url, phone, role_description, avatar_color, notes, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.name.trim(),
      data.email.trim().toLowerCase(),
      data.phone ?? null,
      data.role_description ?? null,
      data.avatar_color ?? "#E8001D",
      data.notes ?? null,
      now,
    ],
  );
  await dbExecute(
    "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
    [workspaceId, userId, role, now],
  );
  return {
    user_id: userId,
    workspace_id: workspaceId,
    role,
    joined_at: now,
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    phone: data.phone ?? null,
    role_description: data.role_description ?? null,
    avatar_color: data.avatar_color ?? "#E8001D",
    notes: data.notes ?? null,
  };
}

export async function updateRole(
  workspaceId: string,
  userId: string,
  role: Exclude<MemberRole, "owner">,
): Promise<void> {
  await dbExecute(
    "UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?",
    [role, workspaceId, userId],
  );
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await dbExecute(
    "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    [workspaceId, userId],
  );
}

export const teamDb = { getMembers, addMember, updateRole, removeMember };
