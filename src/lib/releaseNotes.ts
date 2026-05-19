/**
 * Helpers para consumir las release notes que GitHub publica para cada
 * tag. El workflow build.yml genera un body con los commits del rango
 * y lo guarda como el "release body" — exponemos eso al cliente vía
 * la API pública de GitHub (no requiere auth para repos públicos).
 *
 * Endpoints usados:
 *   https://api.github.com/repos/manw3b/clozr/releases/tags/v1.3.13
 *   https://api.github.com/repos/manw3b/clozr/releases?per_page=10
 *
 * Si la API rate-limitea, dejamos un best-effort con manejo de error.
 */

const REPO = "manw3b/clozr";

export interface ReleaseInfo {
  /** Tag sin la "v" prefix — ej: "1.3.13". */
  version: string;
  /** Markdown body del release (changelog generado del workflow). */
  body: string;
  /** ISO timestamp cuando se publicó. */
  publishedAt: string;
  /** URL HTML al release de GitHub. */
  url: string;
}

interface RawRelease {
  tag_name: string;
  body: string | null;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

function toReleaseInfo(raw: RawRelease): ReleaseInfo {
  return {
    version: raw.tag_name.replace(/^v/, ""),
    body: raw.body ?? "",
    publishedAt: raw.published_at,
    url: raw.html_url,
  };
}

/**
 * Trae las release notes de UNA versión específica.
 * Devuelve null si el tag no existe o si la API falla.
 */
export async function fetchReleaseNotes(version: string): Promise<ReleaseInfo | null> {
  const tag = version.startsWith("v") ? version : `v${version}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as RawRelease;
    return toReleaseInfo(raw);
  } catch {
    return null;
  }
}

/**
 * Trae las últimas N releases (excluye drafts pero incluye prereleases
 * por si el usuario quiere ver historial completo). Útil para la sección
 * "Historial de versiones" en Ajustes → Acerca de.
 */
export async function fetchRecentReleases(limit = 10): Promise<ReleaseInfo[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=${limit}`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return [];
    const raws = (await res.json()) as RawRelease[];
    return raws.filter((r) => !r.draft).map(toReleaseInfo);
  } catch {
    return [];
  }
}

/**
 * Parsea un body de release (markdown del workflow) en líneas de cambio
 * limpias para mostrar como lista. El formato esperado:
 *
 *   ## Clozr v1.3.13
 *
 *   ### Cambios desde v1.3.12
 *
 *   - chore: ...
 *   - feat: ...
 *
 * Devuelve sólo los bullet points (- ...).
 */
export function parseChangeBullets(body: string): string[] {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const bullets: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") && !trimmed.startsWith("- (")) {
      bullets.push(trimmed.slice(2).trim());
    }
  }
  return bullets;
}
