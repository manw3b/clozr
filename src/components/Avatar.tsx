import { useState, useEffect } from "react";
import { resolveImageUrl } from "../lib/images";

const COLORS = [
  "#E8001D", "#0A84FF", "#30D158", "#FFD60A", "#BF5AF2",
  "#FF9F0A", "#FF375F", "#5E5CE6", "#64D2FF", "#32D74B",
];

function pickColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

interface AvatarProps {
  name: string;
  size?: number;
  imagePath?: string | null;
}

export default function Avatar({ name, size = 36, imagePath }: AvatarProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) { setImageUrl(null); return; }
    resolveImageUrl(imagePath).then(setImageUrl).catch(() => setImageUrl(null));
  }, [imagePath]);

  if (imageUrl) {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        <img src={imageUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: pickColor(name),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.34,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
        letterSpacing: "-0.5px",
        userSelect: "none",
      }}
    >
      {initials(name)}
    </div>
  );
}
