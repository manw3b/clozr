/**
 * Iconos brand-correctos de redes sociales. SVG inline, `fill=currentColor`
 * por default para que tomen el color del CSS.
 *
 * Por qué inline y no lucide-react: el set de lucide tiene "Instagram"
 * como un cuadrado-cámara genérico y NO tiene TikTok ni X (brand-X).
 * Para el form y el drawer del cliente queremos los logos reales, así
 * el usuario reconoce visualmente cada red.
 *
 * Los paths son los oficiales (SimpleIcons / brand kits). Usar con
 * `color` prop (default currentColor) — útil cuando rendereás un chip
 * blanco/negro y querés mantener neutralidad, o querés colorearlo con
 * el brand (`color="#E1306C"` para Instagram).
 */

interface IconProps {
  size?: number;
  color?: string;
}

function svgProps(size: number, color: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: color,
    'aria-hidden': true as const,
  };
}

export function InstagramIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

export function FacebookIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

export function TikTokIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z" />
    </svg>
  );
}

/** Logo de X (ex-Twitter) — el nuevo brand. */
export function XIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg {...svgProps(size, color)}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Colores brand para usar como acento si quieren chips coloreados. */
export const SOCIAL_BRAND_COLORS = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  tiktok: '#000000',
  twitter: '#000000', // X es negro ahora
} as const;
