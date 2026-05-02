import { dbSelect, dbExecute } from "../db/index";
import { matchImageToTemplate } from "./mapImages";

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  color: string | null;
}

// Resolved at build time by Vite
const iphoneGlob = import.meta.glob<string>("/src/assets/products/iphones/*.jpg", { eager: true, query: "?url", import: "default" });
const ipadGlob   = import.meta.glob<string>("/src/assets/products/ipads/*.jpg",   { eager: true, query: "?url", import: "default" });

const iphoneFiles = Object.keys(iphoneGlob).map((p) => p.split("/").pop()!);
const ipadFiles   = Object.keys(ipadGlob).map((p) => p.split("/").pop()!);

const ALL_FILES = [...iphoneFiles, ...ipadFiles];

function folderForCategory(category: string): "iphones" | "ipads" {
  return category === "iPad" ? "ipads" : "iphones";
}

export async function applyImagesToTemplates(): Promise<{ matched: number; unmatched: number }> {
  const pending = await dbSelect<{ count: number }>(
    "SELECT COUNT(*) as count FROM product_templates WHERE is_builtin = 1 AND image_path IS NULL",
    [],
  );
  if ((pending[0]?.count ?? 0) === 0) return { matched: 0, unmatched: 0 };

  const templates = await dbSelect<TemplateRow>(
    "SELECT id, name, category, subcategory, color FROM product_templates WHERE is_builtin = 1",
    [],
  );

  let matched = 0;
  let unmatched = 0;

  for (const tpl of templates) {
    const fileName = matchImageToTemplate(tpl.name, tpl.color ?? "", ALL_FILES);
    if (fileName) {
      const folder = folderForCategory(tpl.category);
      await dbExecute(
        "UPDATE product_templates SET image_path = ? WHERE id = ?",
        [`/src/assets/products/${folder}/${fileName}`, tpl.id],
      );
      matched++;
      console.log(`[images] ✅ ${tpl.name} → ${fileName}`);
    } else {
      unmatched++;
      console.log(`[images] ❌ No match: ${tpl.name}`);
    }
  }

  console.log(`[images] done — matched: ${matched}, unmatched: ${unmatched}`);
  return { matched, unmatched };
}
