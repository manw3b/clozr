/**
 * useWorkspaceLogo (I) — devuelve la URL del logo del workspace activo,
 * con fallback chain:
 *   1. Cloud workspace `logo_key` → URL pública del worker (compartido equipo)
 *   2. Local workspace `logo_path` → asset:// resuelto via resolveImageUrl
 *   3. null → caller renderea fallback (ícono industry, emoji, etc)
 *
 * Mismo patrón para banner via useWorkspaceBanner.
 */
import { useEffect, useState } from "react";
import { useCloudAuthStore } from "../store/cloudAuthStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { workspaceAssetUrl } from "./cloudAuth";
import { resolveImageUrl } from "./images";

function useAsset(kind: "logo" | "banner"): string | null {
  const cloudKey = useCloudAuthStore((s) => {
    if (!s.activeWorkspaceId) return null;
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
    if (!ws) return null;
    return kind === "logo" ? (ws.logo_key ?? null) : (ws.banner_key ?? null);
  });
  const localPath = useWorkspaceStore((s) => {
    if (kind === "banner") return null; // banner es solo cloud por ahora
    return s.activeWorkspace?.logo_path ?? null;
  });

  const [resolvedLocal, setResolvedLocal] = useState<string | null>(null);
  useEffect(() => {
    if (!localPath || cloudKey) { setResolvedLocal(null); return; }
    resolveImageUrl(localPath).then(setResolvedLocal).catch(() => setResolvedLocal(null));
  }, [localPath, cloudKey]);

  if (cloudKey) return workspaceAssetUrl(cloudKey);
  return resolvedLocal;
}

export function useWorkspaceLogo(): string | null {
  return useAsset("logo");
}

export function useWorkspaceBanner(): string | null {
  return useAsset("banner");
}
