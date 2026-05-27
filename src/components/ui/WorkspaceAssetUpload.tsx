/**
 * WorkspaceAssetUpload (I) — sube logo o banner del workspace activo.
 *
 * Diferencias vs ImageUpload genérico:
 *  - Cuando hay sesión CLOUD: sube a R2 vía worker (compartido equipo).
 *  - Cuando NO hay cloud: fallback al FS local (legacy comportamiento
 *    de ImageUpload).
 *
 * Visualmente igual al ImageUpload — botón clickeable con preview de la
 * imagen actual + remove (X), placeholder cuando vacío.
 */
import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Camera, X } from "lucide-react";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { useWorkspaceLogo, useWorkspaceBanner } from "../../lib/useWorkspaceLogo";
import {
  uploadWorkspaceAsset,
  deleteWorkspaceAsset,
} from "../../lib/cloudAuth";
import { selectAndSaveImage } from "../../lib/images";

const SIZE_MAP = { sm: 48, md: 80, lg: 120 };

/**
 * Lee las dimensiones reales (width × height) de un Blob de imagen.
 * Usa URL.createObjectURL + Image() — funciona en WebView2 sin permisos
 * extra. Si falla (formato exótico), devuelve null y el warning no se
 * muestra (failure open).
 */
function readImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

interface Props {
  kind: "logo" | "banner";
  /** Solo se usa en local mode (sin cloud). En cloud el wid sale del store. */
  localEntityId?: string;
  /** Callback opcional al cambiar — útil para que el caller cierre algún UI. */
  onChange?: () => void;
  size?: "sm" | "md" | "lg";
  shape?: "square" | "circle";
  placeholder?: string | React.ReactNode;
  /** Local-only fallback path setter (mantiene compat con Settings). */
  onLocalPathChange?: (path: string | null) => void;
  /**
   * Resolución recomendada. Si la imagen subida es menor a ~70% de esta
   * resolución, se muestra un warning soft (no bloqueante) al user.
   */
  recommendedWidth?: number;
  recommendedHeight?: number;
}

export default function WorkspaceAssetUpload({
  kind,
  localEntityId,
  onChange,
  size = "md",
  shape = "square",
  placeholder,
  onLocalPathChange,
  recommendedWidth,
  recommendedHeight,
}: Props) {
  // Warning soft cuando la imagen subida es muy chica. Se setea en la
  // pasada del upload — se borra al subir una imagen de buen tamaño.
  const [lowResWarning, setLowResWarning] = useState<string | null>(null);
  const cloudJwt = useCloudAuthStore((s) => s.jwt);
  const cloudWsId = useCloudAuthStore((s) => s.activeWorkspaceId);
  const isCloud = useCloudAuthStore((s) => s.isLoggedIn() && !!s.activeWorkspaceId);
  const upsertWorkspace = useCloudAuthStore((s) => s.upsertWorkspace);
  const workspaces = useCloudAuthStore((s) => s.workspaces);

  const logoUrl = useWorkspaceLogo();
  const bannerUrl = useWorkspaceBanner();
  const currentUrl = kind === "logo" ? logoUrl : bannerUrl;

  const [loading, setLoading] = useState(false);
  const [optimisticUrl, setOptimisticUrl] = useState<string | null>(null);

  // Mostrar optimistic mientras sube — visible inmediato sin esperar al
  // refresh del store.
  const displayUrl = optimisticUrl ?? currentUrl;

  // Limpiar optimistic cuando el store actualizó.
  useEffect(() => {
    if (!loading && optimisticUrl && currentUrl) setOptimisticUrl(null);
  }, [loading, optimisticUrl, currentUrl]);

  const px = SIZE_MAP[size];
  const borderRadius = shape === "circle" ? "50%" : 8;
  const iconSize = px < 60 ? 14 : 20;

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      if (isCloud && cloudWsId) {
        // Pick file via Tauri dialog, leer bytes, upload al worker.
        const selected = await open({
          multiple: false,
          filters: [{ name: "Imagen", extensions: ["png", "jpg", "jpeg", "webp"] }],
        });
        if (!selected || typeof selected !== "string") return;
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(selected);
        const ext = selected.split(".").pop()?.toLowerCase() ?? "jpg";
        const mime =
          ext === "png" ? "image/png" :
          ext === "webp" ? "image/webp" :
          "image/jpeg";
        const blob = new Blob([bytes as BlobPart], { type: mime });

        // Chequear resolución contra el recomendado. Warning soft —
        // dejamos subir igual porque el user puede preferir su logo
        // 80×80 aunque no sea ideal.
        if (recommendedWidth && recommendedHeight) {
          const dims = await readImageDimensions(blob);
          if (dims && (dims.width < recommendedWidth * 0.7 || dims.height < recommendedHeight * 0.7)) {
            setLowResWarning(
              `Imagen de ${dims.width}×${dims.height}. Para verse nítida en pantallas grandes, recomendamos ${recommendedWidth}×${recommendedHeight}.`,
            );
          } else {
            setLowResWarning(null);
          }
        }

        // Mostrar optimistic local mientras sube.
        const tempUrl = URL.createObjectURL(blob);
        setOptimisticUrl(tempUrl);

        const res = await uploadWorkspaceAsset(cloudJwt, cloudWsId, kind, blob);
        if (!res.ok) {
          setOptimisticUrl(null);
          URL.revokeObjectURL(tempUrl);
          // No throw — el caller suele mostrar toasts; acá log y damos error visual.
          // eslint-disable-next-line no-console
          console.error("Upload falló:", res.error);
          return;
        }
        // Actualizar el cloud workspace en el store con la key nueva,
        // para que useWorkspaceLogo refresque sin esperar al próximo /me.
        const current = workspaces.find((w) => w.id === cloudWsId);
        if (current) {
          upsertWorkspace({
            ...current,
            [kind === "logo" ? "logo_key" : "banner_key"]: res.key,
          });
        }
        URL.revokeObjectURL(tempUrl);
        setOptimisticUrl(null);
        onChange?.();
        return;
      }

      // Local mode (sin cloud) — flujo original del ImageUpload.
      if (kind === "banner") {
        // Banner no se soporta local-only por ahora — solo cloud.
        return;
      }
      const wid = localEntityId ?? "";
      if (!wid) return;
      const path = await selectAndSaveImage("workspaces", wid);
      if (path) {
        onLocalPathChange?.(path);
        onChange?.();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      if (isCloud && cloudWsId) {
        const res = await deleteWorkspaceAsset(cloudJwt, cloudWsId, kind);
        if (res.ok) {
          const current = workspaces.find((w) => w.id === cloudWsId);
          if (current) {
            upsertWorkspace({
              ...current,
              [kind === "logo" ? "logo_key" : "banner_key"]: null,
            });
          }
          onChange?.();
        }
      } else if (kind === "logo") {
        onLocalPathChange?.(null);
        onChange?.();
      }
      setLowResWarning(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "relative", width: kind === "banner" ? "100%" : px, height: px, flexShrink: 0 }}>
      <button
        type="button"
        onClick={handleClick}
        className="image-upload-trigger"
        style={{
          width: "100%",
          height: "100%",
          borderRadius: kind === "banner" ? 8 : borderRadius,
          background: "var(--surface-2)",
          border: "1px solid var(--border-strong)",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && !displayUrl ? (
          <div style={{
            width: 16, height: 16,
            border: "2px solid var(--border-strong)",
            borderTopColor: "var(--text-secondary)",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }} />
        ) : displayUrl ? (
          <>
            <img
              src={displayUrl}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: kind === "banner" ? "cover" : "cover",
                opacity: loading ? 0.6 : 1,
              }}
            />
            <div className="image-upload-overlay" style={{ borderRadius }}>
              <Camera size={iconSize} color="#fff" />
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {placeholder ? (
              <span style={{ fontSize: size === "lg" ? 28 : size === "md" ? 22 : 16, lineHeight: 1 }}>
                {placeholder}
              </span>
            ) : (
              <Camera size={iconSize} color="var(--text-tertiary)" />
            )}
          </div>
        )}
      </button>

      {displayUrl && !loading && (
        <button
          type="button"
          onClick={handleRemove}
          title="Quitar imagen"
          style={{
            position: "absolute", top: -6, right: -6,
            width: 18, height: 18, borderRadius: "50%",
            background: "var(--surface-3)",
            border: "1px solid var(--border-strong)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", zIndex: 1,
          }}
        >
          <X size={10} color="var(--text-secondary)" />
        </button>
      )}

      {/* Warning soft de baja resolución — no bloqueante, solo informa
          al user que la imagen puede verse pixelada. */}
      {lowResWarning && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: kind === "banner" ? 0 : undefined,
            minWidth: kind === "banner" ? undefined : 220,
            maxWidth: 320,
            padding: "6px 10px",
            background: "var(--warning-bg, rgba(251, 191, 36, 0.08))",
            border: "1px solid rgba(251, 191, 36, 0.3)",
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.4,
            color: "var(--warning, #f59e0b)",
            zIndex: 2,
          }}
        >
          ⚠️ {lowResWarning}
        </div>
      )}
    </div>
  );
}
