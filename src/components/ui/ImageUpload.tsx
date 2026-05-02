import { useState, useEffect } from "react";
import { Camera, X } from "lucide-react";
import { selectAndSaveImage, resolveImageUrl, deleteImage } from "../../lib/images";

const SIZE_MAP = { sm: 48, md: 80, lg: 120 };

interface ImageUploadProps {
  category: "products" | "workspaces" | "customers";
  entityId: string;
  currentPath?: string | null;
  onImageSelected: (path: string) => void;
  onImageRemoved: () => void;
  size?: "sm" | "md" | "lg";
  shape?: "square" | "circle";
  placeholder?: string | React.ReactNode;
}

export default function ImageUpload({
  category,
  entityId,
  currentPath,
  onImageSelected,
  onImageRemoved,
  size = "md",
  shape = "square",
  placeholder,
}: ImageUploadProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);

  const px = SIZE_MAP[size];
  const borderRadius = shape === "circle" ? "50%" : 8;
  const iconSize = px < 60 ? 14 : 20;

  useEffect(() => {
    if (!currentPath) { setImageUrl(null); return; }
    resolveImageUrl(currentPath).then(setImageUrl).catch(() => setImageUrl(null));
  }, [currentPath]);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const path = await selectAndSaveImage(category, entityId);
      if (path) {
        const url = await resolveImageUrl(path);
        setImageUrl(url);
        onImageSelected(path);
      }
    } catch (e) {
      console.error("Image upload error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentPath) deleteImage(currentPath).catch(() => {});
    setImageUrl(null);
    onImageRemoved();
  };

  return (
    <div style={{ position: "relative", width: px, height: px, flexShrink: 0 }}>
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: "100%",
          height: "100%",
          borderRadius,
          background: "var(--surface-2)",
          border: "1px solid var(--border-strong)",
          overflow: "hidden",
          position: "relative",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading ? (
          <div style={{
            width: 16, height: 16,
            border: "2px solid var(--border-strong)",
            borderTopColor: "var(--text-secondary)",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }} />
        ) : imageUrl ? (
          <>
            <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {hovered && (
              <div style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius,
              }}>
                <Camera size={iconSize} color="#fff" />
              </div>
            )}
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

      {imageUrl && (
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
    </div>
  );
}
