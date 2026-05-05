import { appDataDir, join } from "@tauri-apps/api/path";
import { copyFile, exists, mkdir, readDir, remove, stat } from "@tauri-apps/plugin-fs";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Backup nativo del archivo SQLite (clozr.db) — copia binaria del archivo
 * completo, no JSON parcial.
 *
 * Ubicación de los backups: <appDataDir>/backups/clozr-backup-<timestamp>.db
 *
 * Capacidades necesarias en src-tauri/capabilities/default.json:
 *   fs:allow-exists, fs:allow-mkdir, fs:allow-copy-file, fs:allow-remove,
 *   fs:allow-stat, fs:allow-read-dir, fs:scope-appdata-recursive
 *   dialog:allow-open, process:allow-restart
 */

const DB_FILENAME = "clozr.db";
const BACKUPS_DIR = "backups";
const AUTO_BACKUP_FLAG_KEY = "clozr.lastAutoBackupDate";

export interface BackupFile {
  /** Nombre del archivo (ej: "clozr-backup-2025-04-19-14-30.db") */
  name: string;
  /** Path absoluto */
  path: string;
  /** Tamaño en bytes */
  size: number;
  /** Fecha de creación / modificación (ISO) */
  modifiedAt: string;
}

export async function getDbPath(): Promise<string> {
  const dir = await appDataDir();
  return join(dir, DB_FILENAME);
}

export async function getBackupsDir(): Promise<string> {
  const dir = await appDataDir();
  const path = await join(dir, BACKUPS_DIR);
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
  }
  return path;
}

/** Crea una copia del clozr.db actual con timestamp y devuelve el path nuevo. */
export async function createBackup(): Promise<BackupFile> {
  const src = await getDbPath();
  const dir = await getBackupsDir();
  const ts = timestampForFilename();
  const name = `clozr-backup-${ts}.db`;
  const dest = await join(dir, name);
  await copyFile(src, dest);
  const info = await stat(dest);
  return {
    name,
    path: dest,
    size: info.size ?? 0,
    modifiedAt: info.mtime ? new Date(info.mtime).toISOString() : new Date().toISOString(),
  };
}

/** Lista todos los backups ordenados del más reciente al más viejo. */
export async function listBackups(): Promise<BackupFile[]> {
  const dir = await getBackupsDir();
  let entries: Array<{ name: string; isDirectory?: boolean }> = [];
  try {
    entries = (await readDir(dir)) as Array<{ name: string }>;
  } catch {
    return [];
  }
  const out: BackupFile[] = [];
  for (const e of entries) {
    if (!e.name.endsWith(".db")) continue;
    const path = await join(dir, e.name);
    try {
      const info = await stat(path);
      out.push({
        name: e.name,
        path,
        size: info.size ?? 0,
        modifiedAt: info.mtime ? new Date(info.mtime).toISOString() : new Date().toISOString(),
      });
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/** Elimina un backup específico. */
export async function deleteBackup(filePath: string): Promise<void> {
  await remove(filePath);
}

/**
 * Restaura desde un .db elegido por el usuario:
 * 1. Pide selección via dialog
 * 2. Crea backup del estado actual ("safety net")
 * 3. Copia el .db elegido sobre clozr.db
 * 4. Reinicia la app para que tome la nueva DB
 *
 * Devuelve el path elegido (null si canceló).
 */
export async function restoreFromDialog(): Promise<string | null> {
  const selected = await openDialog({
    multiple: false,
    filters: [{ name: "Backup Clozr (.db)", extensions: ["db"] }],
  });
  if (!selected || typeof selected !== "string") return null;
  await restoreFromPath(selected);
  return selected;
}

/** Restaura desde un path conocido (usado tanto por el dialog como por la lista). */
export async function restoreFromPath(srcPath: string): Promise<void> {
  // Safety net: backup del estado actual antes de pisar
  try {
    await createBackup();
  } catch {
    /* si falla el backup, no abortamos — el restore es lo importante */
  }
  const dst = await getDbPath();
  await copyFile(srcPath, dst);
  // La conexión SQLite ya tiene la DB vieja en memoria/cache. La forma más
  // segura de tomar el archivo nuevo es relanzar la app.
  await relaunch();
}

/**
 * Si hoy todavía no se hizo backup automático, lo crea. Idempotente —
 * usa localStorage como marcador del día.
 */
export async function autoBackupIfDue(): Promise<BackupFile | null> {
  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem(AUTO_BACKUP_FLAG_KEY);
  if (last === today) return null;
  try {
    const b = await createBackup();
    localStorage.setItem(AUTO_BACKUP_FLAG_KEY, today);
    // Limpieza: mantener solo los últimos 14 backups para no inflar el disco
    await pruneOldBackups(14);
    return b;
  } catch {
    return null;
  }
}

/** Borra backups antiguos manteniendo `keep` más recientes. */
export async function pruneOldBackups(keep: number): Promise<number> {
  const all = await listBackups();
  if (all.length <= keep) return 0;
  const toDelete = all.slice(keep);
  let deleted = 0;
  for (const b of toDelete) {
    try {
      await deleteBackup(b.path);
      deleted++;
    } catch {
      /* skip */
    }
  }
  return deleted;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timestampForFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
