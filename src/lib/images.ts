import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, mkdir, exists, remove, stat } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";

const MAX_SIZE = 5 * 1024 * 1024;

export async function selectAndSaveImage(
  category: "products" | "workspaces" | "customers",
  entityId: string,
): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Imagen", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (!selected || typeof selected !== "string") return null;

  try {
    const info = await stat(selected);
    if (info.size > MAX_SIZE) {
      throw new Error("La imagen no puede superar 5MB");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("5MB")) throw e;
    // stat failed due to scope — skip size check
  }

  const ext = selected.split(".").pop()?.toLowerCase() ?? "jpg";
  const appData = await appDataDir();
  const dirPath = await join(appData, "clozr", "images", category);

  const dirExists = await exists(dirPath);
  if (!dirExists) {
    await mkdir(dirPath, { recursive: true });
  }

  const fileName = `${entityId}.${ext}`;
  const destPath = await join(dirPath, fileName);
  await copyFile(selected, destPath);

  return `images/${category}/${fileName}`;
}

export async function resolveImageUrl(relativePath: string): Promise<string | null> {
  try {
    const appData = await appDataDir();
    const fullPath = await join(appData, "clozr", relativePath);
    const fileExists = await exists(fullPath);
    if (!fileExists) return null;
    return convertFileSrc(fullPath);
  } catch {
    return null;
  }
}

export async function deleteImage(relativePath: string): Promise<void> {
  try {
    const appData = await appDataDir();
    const fullPath = await join(appData, "clozr", relativePath);
    await remove(fullPath);
  } catch {
    // ignore if file doesn't exist
  }
}
