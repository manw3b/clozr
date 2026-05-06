// Build-time resolution of all product image URLs via Vite glob
const iphoneUrls  = import.meta.glob<string>("/src/assets/products/iphones/*.jpg",  { eager: true, query: "?url", import: "default" });
const ipadUrls    = import.meta.glob<string>("/src/assets/products/ipads/*.{jpg,png}", { eager: true, query: "?url", import: "default" });
const watchUrls   = import.meta.glob<string>("/src/assets/products/watch/*.jpg",    { eager: true, query: "?url", import: "default" });
const macUrls     = import.meta.glob<string>("/src/assets/products/mac/*.jpg",      { eager: true, query: "?url", import: "default" });
const airpodsUrls = import.meta.glob<string>("/src/assets/products/airpods/*.{jpg,png}", { eager: true, query: "?url", import: "default" });

// Map: full Vite src path → resolved URL
const urlMap: Record<string, string> = { ...iphoneUrls, ...ipadUrls, ...watchUrls, ...macUrls, ...airpodsUrls };

export const allProductImages: Record<string, string> = urlMap;

export function getTemplateImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  return urlMap[imagePath] ?? null;
}

/**
 * Construye el path color-aware para un modelo + color y devuelve la URL si
 * existe en el bundle. Convención: `/src/assets/products/<cat>/<Model>_<Color>.jpg`
 * con espacios reemplazados por guion bajo.
 *
 * Cae al fallback (modelImagePath) si no encuentra el variant-specific.
 */
export function resolveColorImage(
  category: string | undefined,
  modelName: string,
  color: string | undefined,
  fallbackModelPath?: string | null,
): string | null {
  const fallback = getTemplateImageUrl(fallbackModelPath);
  if (!color) return fallback;

  const folder = inferFolder(category, modelName);
  if (!folder) return fallback;

  const safeModel = modelName.replace(/\s+/g, "_");
  const safeColor = color.replace(/\s+/g, "_");

  // Probamos varios sufijos (.jpg | .png) y nombres de carpeta
  const candidates = [
    `/src/assets/products/${folder}/${safeModel}_${safeColor}.jpg`,
    `/src/assets/products/${folder}/${safeModel}_${safeColor}.png`,
  ];
  for (const c of candidates) {
    if (urlMap[c]) return urlMap[c];
  }
  return fallback;
}

function inferFolder(category: string | undefined, modelName: string): string | null {
  const c = (category ?? "").toLowerCase();
  const m = modelName.toLowerCase();
  if (c === "iphone" || m.includes("iphone")) return "iphones";
  if (c === "ipad" || m.includes("ipad")) return "ipads";
  if (c.includes("watch") || m.includes("watch")) return "watch";
  if (c === "mac" || m.includes("mac")) return "mac";
  if (c.includes("airpod") || m.includes("airpod")) return "airpods";
  return null;
}

export function categoryEmoji(category: string | null | undefined): string {
  const c = category?.toLowerCase() ?? "";
  if (c === "iphone")                       return "📱";
  if (c === "ipad")                         return "🖥";
  if (c.includes("watch"))                  return "⌚";
  if (c === "mac" || c.includes("macbook")) return "💻";
  if (c.includes("airpods"))                return "🎧";
  return "📦";
}
