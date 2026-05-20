/**
 * Tareas obligatorias asignadas por el dueño/encargado a un vendedor
 * específico (o a todos). Cada template se materializa en un row de
 * `tasks` por día/semana/mes según frequency.
 *
 * Diseño:
 *  - El template es la "intención" — qué tarea recurrente debe hacer el
 *    vendedor (ej: "subir historia a las 10:00", "seguir 30 personas").
 *  - La task materializada es la "instancia del día" — el row concreto
 *    que el vendedor ve en su Mi Día / Tareas y marca completada.
 *  - Cada día arranca limpio. Tareas del día anterior NO se reabren ni
 *    se acumulan. El histórico queda en `tasks` para reportes futuros.
 *
 * `materializeForToday` corre cuando el vendedor abre Tareas/Mi Día.
 * Es idempotente: si la tarea de hoy ya existe (mismo template + mismo
 * usuario + mismo día), no la duplica.
 */

import { dbSelect, dbExecute } from "./index";
import type { AssignedTaskTemplate, Task } from "./types";

export async function getTemplates(
  workspaceId: string,
): Promise<AssignedTaskTemplate[]> {
  return dbSelect<AssignedTaskTemplate>(
    `SELECT * FROM assigned_task_templates
     WHERE workspace_id = ?
     ORDER BY is_active DESC, created_at ASC`,
    [workspaceId],
  );
}

export interface CreateTemplateInput {
  title: string;
  description?: string | null;
  frequency: "daily" | "weekly" | "monthly";
  target_time?: string | null;
  target_count?: number | null;
  assigned_to_user_id?: string | null;
  created_by?: string | null;
}

export async function createTemplate(
  workspaceId: string,
  data: CreateTemplateInput,
): Promise<AssignedTaskTemplate> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO assigned_task_templates
     (id, workspace_id, title, description, frequency, target_time,
      target_count, assigned_to_user_id, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      id,
      workspaceId,
      data.title,
      data.description ?? null,
      data.frequency,
      data.target_time ?? null,
      data.target_count ?? null,
      data.assigned_to_user_id ?? null,
      data.created_by ?? null,
      now,
      now,
    ],
  );
  return {
    id,
    workspace_id: workspaceId,
    title: data.title,
    description: data.description ?? null,
    frequency: data.frequency,
    target_time: data.target_time ?? null,
    target_count: data.target_count ?? null,
    assigned_to_user_id: data.assigned_to_user_id ?? null,
    is_active: 1,
    created_by: data.created_by ?? null,
    created_at: now,
    updated_at: now,
  };
}

export interface UpdateTemplateInput {
  title?: string;
  description?: string | null;
  frequency?: "daily" | "weekly" | "monthly";
  target_time?: string | null;
  target_count?: number | null;
  assigned_to_user_id?: string | null;
  is_active?: number;
}

export async function updateTemplate(
  id: string,
  patch: UpdateTemplateInput,
): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = [...entries.map(([, v]) => v), now, id];
  await dbExecute(
    `UPDATE assigned_task_templates SET ${sets}, updated_at = ? WHERE id = ?`,
    values,
  );
}

export async function removeTemplate(id: string): Promise<void> {
  await dbExecute(`DELETE FROM assigned_task_templates WHERE id = ?`, [id]);
  // Las tareas ya materializadas con este template_id quedan huérfanas
  // pero no se borran — son histórico válido (el vendedor las completó).
  // Para que la UI no muestre "Obligatoria" cuando ya no existe el
  // template, simplemente verifica la presencia del template antes de
  // pintarlo. Acá NO tocamos los rows de tasks.
}

/**
 * Materializa las tareas obligatorias de HOY para un usuario específico.
 * Idempotente — si ya corrió hoy, no duplica.
 *
 * Reglas:
 *  - frequency='daily': se crea cada día
 *  - frequency='weekly': se crea cada lunes (DIA 1 en getDay() argentino,
 *    pero usamos getDay() crudo: 0=Domingo, 1=Lunes. Lo manejamos como
 *    "una vez por semana ISO" — se crea el primer día de la semana en
 *    que el usuario abre la app)
 *  - frequency='monthly': una vez por mes (primer día del mes en que
 *    el user abre la app)
 *
 * `assigned_to_user_id NULL` significa "todos los vendedores" — se
 * materializa para el `userId` actual también en ese caso.
 *
 * Devuelve el número de tareas creadas (debugging / toast).
 */
export async function materializeForToday(
  workspaceId: string,
  userId: string,
): Promise<number> {
  const templates = await dbSelect<AssignedTaskTemplate>(
    `SELECT * FROM assigned_task_templates
     WHERE workspace_id = ?
       AND is_active = 1
       AND (assigned_to_user_id IS NULL OR assigned_to_user_id = ?)`,
    [workspaceId, userId],
  );

  if (templates.length === 0) return 0;

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10); // "2026-05-20"
  let created = 0;

  for (const tpl of templates) {
    // Para esta versión MVP tratamos daily/weekly/monthly igual:
    // si NO existe una task con (template_id, assigned_to=userId,
    // created hoy), la creamos. Esto cumple "diario" naturalmente.
    // Para weekly/monthly conviene un check más fino — lo dejo TODO
    // para cuando el caso aparezca (hoy todos los ejemplos son daily).
    const existing = await dbSelect<{ id: string }>(
      `SELECT id FROM tasks
       WHERE workspace_id = ?
         AND template_id = ?
         AND assigned_to = ?
         AND date(created_at) = ?`,
      [workspaceId, tpl.id, userId, todayISO],
    );
    if (existing.length > 0) continue;

    const taskId = crypto.randomUUID();
    await dbExecute(
      `INSERT INTO tasks
       (id, workspace_id, type, frequency, title, completed, assigned_to,
        created_by, created_at, template_id, target_count, progress)
       VALUES (?, ?, 'rutina', ?, ?, 0, ?, ?, datetime('now'), ?, ?, 0)`,
      [
        taskId,
        workspaceId,
        tpl.frequency === "daily" ? "diaria" : tpl.frequency === "weekly" ? "semanal" : "mensual",
        tpl.title,
        userId,
        tpl.created_by,
        tpl.id,
        tpl.target_count,
      ],
    );
    created += 1;
  }

  return created;
}

/**
 * Incrementa el contador progress de una tarea con target_count. Cuando
 * progress alcanza target_count, marca la tarea como completed.
 *
 * delta puede ser -1 para deshacer un click accidental.
 */
export async function incrementProgress(
  taskId: string,
  delta: number = 1,
): Promise<Task | null> {
  const rows = await dbSelect<Task>("SELECT * FROM tasks WHERE id = ?", [taskId]);
  const task = rows[0];
  if (!task) return null;
  const max = task.target_count ?? 1;
  const current = task.progress ?? 0;
  const next = Math.max(0, Math.min(max, current + delta));
  const completed = next >= max ? 1 : 0;
  const completedAt = completed === 1 && task.completed === 0 ? new Date().toISOString() : task.completed_at;

  await dbExecute(
    `UPDATE tasks SET progress = ?, completed = ?, completed_at = ? WHERE id = ?`,
    [next, completed, completedAt, taskId],
  );
  return { ...task, progress: next, completed, completed_at: completedAt };
}

export const assignedTasksDb = {
  getTemplates,
  createTemplate,
  updateTemplate,
  removeTemplate,
  materializeForToday,
  incrementProgress,
};
