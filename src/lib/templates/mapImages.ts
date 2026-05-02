// Maps file name fragments (lowercase, underscores) → official Apple color name
export const COLOR_MAP: Record<string, string> = {
  black: "Black",
  midnight: "Midnight",
  starlight: "Starlight",
  white: "White",
  silver: "Silver",
  gold: "Gold",
  spacegray: "Space Gray",
  space_gray: "Space Gray",
  blue: "Blue",
  pink: "Pink",
  purple: "Purple",
  red: "(PRODUCT)RED",
  product_red: "(PRODUCT)RED",
  green: "Green",
  yellow: "Yellow",
  black_titanium: "Black Titanium",
  natural_titanium: "Natural Titanium",
  white_titanium: "White Titanium",
  desert_titanium: "Desert Titanium",
  graphite: "Graphite",
  pacific_blue: "Pacific Blue",
  rosegold: "Rose Gold",
  rose_gold: "Rose Gold",
  alpine_green: "Alpine Green",
  sierra_blue: "Sierra Blue",
  deep_purple: "Deep Purple",
  midnightgreen: "Midnight Green",
  midnight_green: "Midnight Green",
  space_black: "Space Black",
  spaceblack: "Space Black",
  ultramarine: "Ultramarine",
  teal: "Teal",
  cloud_white: "Cloud White",
  sky_blue: "Sky Blue",
  light_gold: "Light Gold",
  cosmic_orange: "Cosmic Orange",
  deep_blue: "Deep Blue",
  sage: "Sage",
  lavender: "Lavender",
  mist_blue: "Mist Blue",
  coral: "Coral",
  matte_black: "Matte Black",
  jet_black: "Jet Black",
  pale_pink: "Pale Pink",
};

// Maps model name (lowercase) → possible file name fragments (longest/most specific first)
export const MODEL_MAP: Record<string, string[]> = {
  "iphone 17 pro max": ["iPhone_17_Pro_Max"],
  "iphone 17 pro":     ["iPhone_17_Pro"],
  "iphone 17 air":     ["iPhone_Air", "iPhone_17_Air"],
  "iphone 17e":        ["iPhone_17e"],
  "iphone 17":         ["iPhone_17"],
  "iphone 16 pro max": ["iPhone_16_Pro_Max"],
  "iphone 16 pro":     ["iPhone_16_Pro"],
  "iphone 16 plus":    ["iPhone_16_Plus"],
  "iphone 16e":        ["iPhone_16e"],
  "iphone 16":         ["iPhone_16"],
  "iphone 15 pro max": ["iPhone_15_Pro_Max"],
  "iphone 15 pro":     ["iPhone_15_Pro"],
  "iphone 15 plus":    ["iPhone_15_Plus"],
  "iphone 15":         ["iPhone_15"],
  "iphone 14 pro max": ["iPhone_14_Pro_Max"],
  "iphone 14 pro":     ["iPhone_14_Pro"],
  "iphone 14 plus":    ["iPhone_14_Plus"],
  "iphone 14":         ["iPhone_14"],
  "iphone 13 pro max": ["iPhone_13_Pro_Max"],
  "iphone 13 pro":     ["iPhone_13_Pro"],
  "iphone 13 mini":    ["iPhone_13_Mini"],
  "iphone 13":         ["iPhone_13"],
  "iphone 12 pro max": ["iPhone_12_Pro_Max"],
  "iphone 12 pro":     ["iPhone_12_Pro"],
  "iphone 12 mini":    ["iPhone_12_Mini"],
  "iphone 12":         ["iPhone_12"],
  "iphone 11 pro max": ["iPhone_11_Pro_Max"],
  "iphone 11 pro":     ["iPhone_11_Pro"],
  "iphone 11":         ["iPhone_11"],
  "iphone se (3rd":    ["iPhone_SE_3rd_Gen"],
  "iphone se (2nd":    ["iPhone_SE_2nd_Gen"],
  "iphone se 3ra":     ["iPhone_SE_3rd_Gen"],
  "iphone se 2da":     ["iPhone_SE_2nd_Gen"],
  "iphone xs max":     ["iPhone_XS_Max"],
  "iphone xs":         ["iPhone_XS"],
  "iphone xr":         ["iPhone_XR"],
  "iphone x":          ["iPhone_X"],
  "iphone 8 plus":     ["iPhone_8_Plus"],
  "iphone 8":          ["iPhone_8"],
  "iphone 7 plus":     ["iPhone_7_Plus"],
  "iphone 7":          ["iPhone_7"],
  "ipad pro 13":       ["iPad_Pro_13", "iPad_Pro_13_M"],
  "ipad pro 11":       ["iPad_Pro_11", "iPad_Pro_11_M"],
  "ipad air 13":       ["iPad_Air_13"],
  "ipad air 11":       ["iPad_Air_11"],
  "ipad mini":         ["iPad_Mini", "iPad_Mini_A17"],
  "ipad":              ["iPad_11th", "iPad_A16"],
};

export function matchImageToTemplate(
  templateName: string,
  color: string,
  availableFiles: string[],
): string | null {
  const nameLower = templateName.toLowerCase();
  const colorLower = color.toLowerCase();

  // Find the most specific model key that matches
  const modelKey = Object.keys(MODEL_MAP)
    .sort((a, b) => b.length - a.length)
    .find((k) => nameLower.includes(k));
  if (!modelKey) return null;

  const modelKeywords = MODEL_MAP[modelKey];

  // Find the file-name key for this color (most specific first)
  const colorFileKey = Object.entries(COLOR_MAP)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([, officialName]) =>
      colorLower === officialName.toLowerCase() ||
      colorLower.includes(officialName.toLowerCase()),
    )?.[0];

  const match = availableFiles.find((file) => {
    const fileLower = file.toLowerCase().replace(/\.(jpg|png)$/, "");
    const modelMatch = modelKeywords.some((kw) => fileLower.includes(kw.toLowerCase()));
    if (!modelMatch) return false;
    if (colorFileKey) {
      return fileLower.includes(colorFileKey);
    }
    return true;
  });

  return match ?? null;
}
