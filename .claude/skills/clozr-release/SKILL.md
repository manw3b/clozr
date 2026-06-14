---
name: clozr-release
description: Corre el ciclo de release de Clozr — bump de versión (npm run release), entrada en CHANGELOG.md, y deploy del Cloudflare Worker (wrangler deploy) cuando hubo cambios de backend. Usar cuando el usuario pida "release", "sacar versión", "publicar", "deployar el worker", o "shippear".
---

# clozr-release — ciclo de release + deploy

Clozr shippea seguido. Este skill ordena el release de la app desktop y, si corresponde, el deploy del Worker.

## 0. Pre-flight

- Confirmá rama limpia: `git status -s`. Si hay cambios sin commitear, mostralos y preguntá.
- Mirá qué cambió desde el último tag: `git log $(git describe --tags --abbrev=0)..HEAD --oneline`.
- Decidí el tipo de bump (preguntá si no está claro): `patch` (fix), `minor` (feature), `major` (breaking).

## 1. Worker (solo si hubo cambios en `cf-worker/`)

Si el diff desde el último release toca `cf-worker/`:
1. Corré primero el skill **clozr-multitenant-audit**. Si hay 🔴, frená y avisá.
2. Si faltan secrets nuevos, recordáselos al usuario (es interactivo, lo hace él):
   `cd cf-worker && npx wrangler secret put NOMBRE`.
3. Deploy: `cd cf-worker && npx wrangler deploy`.
4. Verificá que la ruta tocada responde en prod (`https://clozr-auth.pyter-import.workers.dev/...`).

> El frontend `clozr-web` auto-deploya por push a Vercel — no necesita paso manual acá.

## 2. CHANGELOG

- Agregá una entrada nueva al tope de `CHANGELOG.md` con la versión que vas a publicar y la fecha de hoy.
- Agrupá los cambios en Added / Fixed / Changed. Tono claro, orientado a usuario, en español.

## 3. Bump + tag + push (desktop)

- Usá el script existente: `npm run release <patch|minor|major|X.Y.Z>`.
  - Bumpea `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
  - Crea commit + tag y pushea → GitHub Actions (`.github/workflows/build.yml`) compila Win/Mac/Linux.
- Verificación en seco disponible: `npm run release patch -- --dry-run`. Usala si el usuario duda.

## 4. Cerrar

- Confirmá: tag creado, push hecho, (si aplicó) worker deployado y verificado.
- Pasá el link al run de GitHub Actions si el usuario lo quiere seguir.
- NO toques el versionado a mano: el bump es responsabilidad del script.
