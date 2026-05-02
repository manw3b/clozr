import { dbSelect, dbExecute } from "./index";
import type { CatalogFieldTemplate, CreateCatalogFieldTemplateInput } from "./types";

export async function getTemplates(
  workspaceId: string,
  category?: string | null,
): Promise<CatalogFieldTemplate[]> {
  if (category) {
    return dbSelect<CatalogFieldTemplate>(
      "SELECT * FROM catalog_field_templates WHERE workspace_id = ? AND (category = ? OR category IS NULL) ORDER BY sort_order ASC",
      [workspaceId, category],
    );
  }
  return dbSelect<CatalogFieldTemplate>(
    "SELECT * FROM catalog_field_templates WHERE workspace_id = ? ORDER BY category ASC, sort_order ASC",
    [workspaceId],
  );
}

export async function saveTemplates(
  workspaceId: string,
  templates: CatalogFieldTemplate[],
): Promise<void> {
  await dbExecute(
    "DELETE FROM catalog_field_templates WHERE workspace_id = ?",
    [workspaceId],
  );
  for (const t of templates) {
    await dbExecute(
      `INSERT INTO catalog_field_templates
        (id, workspace_id, category, field_key, field_label, field_type, options_json, required, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id, workspaceId, t.category ?? null,
        t.field_key, t.field_label, t.field_type,
        t.options_json ?? null, t.required ? 1 : 0, t.sort_order,
      ],
    );
  }
}

export async function createTemplate(
  workspaceId: string,
  data: CreateCatalogFieldTemplateInput,
): Promise<CatalogFieldTemplate> {
  const id = crypto.randomUUID();
  await dbExecute(
    `INSERT INTO catalog_field_templates
      (id, workspace_id, category, field_key, field_label, field_type, options_json, required, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, workspaceId, data.category ?? null,
      data.field_key, data.field_label, data.field_type,
      data.options_json ?? null, data.required ? 1 : 0, data.sort_order ?? 0,
    ],
  );
  return {
    id,
    workspace_id: workspaceId,
    category: data.category ?? null,
    field_key: data.field_key,
    field_label: data.field_label,
    field_type: data.field_type,
    options_json: data.options_json ?? null,
    required: data.required ? 1 : 0,
    sort_order: data.sort_order ?? 0,
  };
}

export async function deleteTemplate(id: string): Promise<void> {
  await dbExecute("DELETE FROM catalog_field_templates WHERE id = ?", [id]);
}

export const catalogFieldsDb = {
  getTemplates,
  saveTemplates,
  createTemplate,
  deleteTemplate,
};
