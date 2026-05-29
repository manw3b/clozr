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
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { assignedTaskTemplatesApi, tasksApi, type CloudAssignedTaskTemplate } from "../cloudAuth";
import { log } from "../logger";
import type { AssignedTaskTemplate, Task } from "./types";

/**
 * G/A1: dispatcher cloud↔local para assigned_task_templates. Si hay sesión
 * cloud activa con workspace, las queries van al worker. El campo
 * `is_active` no existe en cloud (no había razón funcional — se usa
 * soft-delete via `deleted_at`); lo defaulteamos a 1 al mapear.
 */
function cloudCtx(): { jwt: string; wsId: string } | null {
  const s = useCloudAuthStore.getState();
  if (!s.isLoggedIn() || !s.activeWorkspaceId) return null;
  return { jwt: s.jwt!, wsId: s.activeWorkspaceId };
}

function cloudToLocal(t: CloudAssignedTaskTemplate): AssignedTaskTemplate {
  return {
    id: t.id,
    workspace_id: t.workspace_id,
    title: t.title,
    description: t.description,
    frequency: t.frequency as "daily" | "weekly" | "monthly",
    target_time: t.target_time,
    target_count: t.target_count,
    assigned_to_user_id: t.assigned_to_user_id,
    is_active: 1,
    created_by: t.created_by,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

export async function getTemplates(
  workspaceId: string,
): Promise<AssignedTaskTemplate[]> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await assignedTaskTemplatesApi.list(ctx.jwt, ctx.wsId);
    if (res.ok) return res.data.items.map(cloudToLocal);
    log.warn("getTemplates cloud falló, fallback local", { scope: "assignedTasksDb", data: { error: res.error } });
  }
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

  const ctx = cloudCtx();
  if (ctx) {
    const res = await assignedTaskTemplatesApi.create(ctx.jwt, ctx.wsId, {
      id,
      title: data.title,
      description: data.description ?? null,
      frequency: data.frequency,
      target_time: data.target_time ?? null,
      target_count: data.target_count ?? null,
      assigned_to_user_id: data.assigned_to_user_id ?? null,
    });
    if (!res.ok) throw new Error(`No se pudo crear template en la nube: ${res.error}`);
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
  const ctx = cloudCtx();
  if (ctx) {
    // is_active no existe en cloud — lo ignoramos. Si cliente pide is_active=0
    // (soft-delete), tratamos como removeTemplate cloud.
    const { is_active, ...rest } = patch;
    if (is_active === 0) {
      await assignedTaskTemplatesApi.remove(ctx.jwt, ctx.wsId, id);
      return;
    }
    const res = await assignedTaskTemplatesApi.update(ctx.jwt, ctx.wsId, id, rest);
    if (!res.ok) throw new Error(`No se pudo actualizar template en la nube: ${res.error}`);
    return;
  }
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
  const ctx = cloudCtx();
  if (ctx) {
    const res = await assignedTaskTemplatesApi.remove(ctx.jwt, ctx.wsId, id);
    if (!res.ok) throw new Error(`No se pudo eliminar template en la nube: ${res.error}`);
    return;
  }
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
/**
 * Inicio (YYYY-MM-DD, hora local) de la ventana de recurrencia para una
 * frequency dada. La materialización crea como máximo UNA tarea por ventana:
 *   - daily   → hoy
 *   - weekly  → lunes de la semana actual
 *   - monthly → día 1 del mes actual
 *
 * Antes esto chequeaba siempre "hoy", así que las tareas semanales/mensuales
 * se re-materializaban TODOS los días — bug que rompía la frecuencia.
 */
function windowStartISO(frequency: "daily" | "weekly" | "monthly"): string {
  const d = new Date();
  if (frequency === "weekly") {
    const dow = d.getDay(); // 0=domingo..6=sábado
    const sinceMonday = (dow + 6) % 7;
    d.setDate(d.getDate() - sinceMonday);
  } else if (frequency === "monthly") {
    d.setDate(1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function materializeForToday(
  workspaceId: string,
  userId: string,
): Promise<number> {
  const ctx = cloudCtx();

  // En cloud el assigned_to_user_id es el cloud user_id (que setea
  // AssignedTasksSection cuando crea el template). El userId local que
  // pasa el caller NO matchea — reemplazamos por el cloud userId.
  const effectiveUserId = ctx
    ? (useCloudAuthStore.getState().userId ?? userId)
    : userId;

  // Cargar templates: cloud si hay sesión, local si no.
  const templates: AssignedTaskTemplate[] = ctx
    ? await (async () => {
        const res = await assignedTaskTemplatesApi.list(ctx.jwt, ctx.wsId);
        if (!res.ok) return [];
        // Filtramos por assigned_to_user_id (null = todos los vendedores
        // O matchea el user actual).
        return res.data.items
          .filter((t) => !t.assigned_to_user_id || t.assigned_to_user_id === effectiveUserId)
          .map(cloudToLocal);
      })()
    : await dbSelect<AssignedTaskTemplate>(
        `SELECT * FROM assigned_task_templates
         WHERE workspace_id = ?
           AND is_active = 1
           AND (assigned_to_user_id IS NULL OR assigned_to_user_id = ?)`,
        [workspaceId, userId],
      );

  if (templates.length === 0) return 0;

  let created = 0;

  if (ctx) {
    // Cloud path: chequear tareas existentes con un solo list + filtro
    // local (más barato que N round-trips de "exists" check). Guardamos
    // (template_id, fecha) para poder filtrar por ventana de frecuencia.
    const existingRes = await tasksApi.list(ctx.jwt, ctx.wsId);
    const existing = existingRes.ok
      ? (existingRes.data.items as unknown as Array<Record<string, unknown>>)
          .filter((t) =>
            t.template_id &&
            t.assigned_to === effectiveUserId &&
            typeof t.created_at === "string"
          )
          .map((t) => ({ tpl: String(t.template_id), date: (t.created_at as string).slice(0, 10) }))
      : [];

    for (const tpl of templates) {
      const winStart = windowStartISO(tpl.frequency);
      const already = existing.some((e) => e.tpl === tpl.id && e.date >= winStart);
      if (already) continue;
      const taskId = crypto.randomUUID();
      const res = await tasksApi.create(ctx.jwt, ctx.wsId, {
        id: taskId,
        type: "rutina",
        frequency: tpl.frequency === "daily" ? "diaria" : tpl.frequency === "weekly" ? "semanal" : "mensual",
        title: tpl.title,
        completed: 0,
        assigned_to: effectiveUserId,
        template_id: tpl.id,
        target_count: tpl.target_count,
        progress: 0,
      } as never);
      if (res.ok) created += 1;
    }
    return created;
  }

  // Local path original.
  for (const tpl of templates) {
    const winStart = windowStartISO(tpl.frequency);
    const existing = await dbSelect<{ id: string }>(
      `SELECT id FROM tasks
       WHERE workspace_id = ?
         AND template_id = ?
         AND assigned_to = ?
         AND date(created_at) >= ?`,
      [workspaceId, tpl.id, userId, winStart],
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
  const ctx = cloudCtx();
  if (ctx) {
    // Cloud path: traer la task del cloud, calcular next + completed,
    // PATCH al endpoint de tasks. Antes esta función era 100% local
    // → para Caro (vendedora cloud) NO encontraba la task y el +1
    // silenciosamente no hacía nada.
    const listRes = await tasksApi.list(ctx.jwt, ctx.wsId);
    if (!listRes.ok) return null;
    const t = (listRes.data.items as unknown as Array<Record<string, unknown>>)
      .find((x) => x.id === taskId);
    if (!t) return null;
    const max = Number(t.target_count ?? 1);
    const current = Number(t.progress ?? 0);
    const next = Math.max(0, Math.min(max, current + delta));
    const completed = next >= max ? 1 : 0;
    const completedAt = completed === 1 && Number(t.completed ?? 0) === 0
      ? new Date().toISOString()
      : (t.completed_at as string | null);
    const updRes = await tasksApi.update(ctx.jwt, ctx.wsId, taskId, {
      progress: next,
      completed,
      completed_at: completedAt,
    } as never);
    if (!updRes.ok) throw new Error(`No se pudo actualizar progreso: ${updRes.error}`);
    return {
      ...(t as unknown as Task),
      progress: next,
      completed,
      completed_at: completedAt,
    };
  }

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
