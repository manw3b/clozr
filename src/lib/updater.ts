import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdateStatus = "idle" | "available" | "downloading" | "done" | "error";

export interface UpdateInfo {
  version: string;
  body: string | null;
}

/** Versión del binario instalado (la del tauri.conf.json al buildear).
 *  Devuelve null si la API de Tauri no está disponible (dev sin runtime). */
export async function getCurrentVersion(): Promise<string | null> {
  try {
    return await getVersion();
  } catch {
    return null;
  }
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const update = await check();
    if (!update?.available) return null;
    return { version: update.version, body: update.body ?? null };
  } catch {
    return null;
  }
}

export async function downloadAndInstall(
  onProgress?: (status: UpdateStatus) => void,
): Promise<void> {
  const update = await check();
  if (!update?.available) return;

  onProgress?.("downloading");
  await update.downloadAndInstall();
  onProgress?.("done");
  await relaunch();
}
