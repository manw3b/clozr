// Build-time resolution of all product image URLs via Vite glob
const iphoneUrls  = import.meta.glob<string>("/src/assets/products/iphones/*.jpg",  { eager: true, query: "?url", import: "default" });
const ipadUrls    = import.meta.glob<string>("/src/assets/products/ipads/*.jpg",    { eager: true, query: "?url", import: "default" });
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

export function categoryEmoji(category: string | null | undefined): string {
  const c = category?.toLowerCase() ?? "";
  if (c === "iphone")                       return "📱";
  if (c === "ipad")                         return "🖥";
  if (c.includes("watch"))                  return "⌚";
  if (c === "mac" || c.includes("macbook")) return "💻";
  if (c.includes("airpods"))                return "🎧";
  return "📦";
}
