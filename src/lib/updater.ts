import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus = "idle" | "available" | "downloading" | "done" | "error";

export interface UpdateInfo {
  version: string;
  body: string | null;
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
