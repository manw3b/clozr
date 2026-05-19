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

/**
 * Resultado verboso del check — útil para la UI de "Acerca de" donde
 * queremos diferenciar entre "estás al día", "hay update" y "falló el
 * check" (a diferencia del banner silencioso que sólo distingue
 * disponible vs no-disponible).
 */
export type CheckResult =
  | { kind: "up-to-date" }
  | { kind: "available"; latest: UpdateInfo }
  | { kind: "error"; error: string };

export async function checkForUpdateVerbose(): Promise<CheckResult> {
  try {
    const update = await check();
    if (!update?.available) return { kind: "up-to-date" };
    return {
      kind: "available",
      latest: { version: update.version, body: update.body ?? null },
    };
  } catch (e) {
    return {
      kind: "error",
      error: e instanceof Error ? e.message : String(e),
    };
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
