# Onboarding — Clozr

Guía rápida para que un dev nuevo pueda levantar Clozr y entender la
arquitectura sin tener que leer todo el repo.

> **Si solo querés usar la app:** descargá el instalador del último release
> en https://github.com/manw3b/clozr/releases/latest. No necesitás nada
> de este doc.

---

## 1. Prerequisitos

- **Node 20+** y npm
- **Rust stable** + tooling Tauri 2 — seguí
  [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)
- **Windows**: Visual Studio Build Tools con workload C++ + Windows SDK
- (Opcional, solo para cloud) **Wrangler** — `npm i -g wrangler` y `wrangler login`

Verificar:

```bash
node --version    # >= 20
cargo --version
rustc --version
```

---

## 2. Clonar y levantar (local-only)

```bash
git clone https://github.com/manw3b/clozr
cd clozr
npm install
npm run tauri dev
```

La primera vez compila Rust (~3-5 min). Después arranca en ~20s.

La app abre con SQLite local en `%APPDATA%\com.clozr.app\clozr.db`
(Windows) o equivalente en macOS/Linux. Crea workspace + business desde
el onboarding y listo.

---

## 3. Layout del repo

```
clozr/
├── src/                    # Frontend React (Vite)
│   ├── pages/             # Pantallas (lazy-loaded por route)
│   ├── components/        # Componentes compartidos
│   ├── features/          # Features cross-page (auth, settings, onboarding)
│   ├── lib/
│   │   ├── db/           # Capa SQLite/Turso (dispatchers cloud)
│   │   ├── cloudAuth.ts  # Cliente HTTP del Worker
│   │   ├── permissions.ts # Matriz rol → permisos (compartida con worker)
│   │   ├── logger.ts     # Telemetría errores → /errors endpoint
│   │   └── ...
│   ├── store/             # Zustand stores
│   └── types/domain.ts    # Tipos UI (mapper a db/types.ts)
├── src-tauri/             # Rust (Tauri 2 wrapper)
├── cf-worker/             # Cloudflare Worker — backend auth + cloud data
│   └── src/
│       ├── index.ts      # Router principal
│       ├── routes/       # Handlers por feature
│       ├── auth.ts       # requireAuth + session cache
│       ├── schema.ts     # DDL Turso (idempotente, version-checked)
│       └── turso.ts      # Cliente libSQL HTTP
└── docs/ARCHITECTURE.md   # Reglas de oro + cómo agregar features
```

---

## 4. Variables de entorno

### Frontend

Solo una variable, opcional:

```bash
# .env.local (gitignored)
VITE_AUTH_WORKER_URL=http://localhost:8787  # default: prod worker
```

Si no la seteás, el frontend usa el worker de prod.

### Worker (cf-worker/)

Los **vars** públicos están en `cf-worker/wrangler.toml` (commiteados).

Los **secrets** se setean con `wrangler secret put NOMBRE`:

| Secret | Para qué |
|---|---|
| `TURSO_DATABASE_URL` | URL libSQL — `libsql://clozr-prod-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | JWT Turso con permisos read+write |
| `RESEND_API_KEY` | API key de Resend para enviar magic-link emails |
| `JWT_SECRET` | String random fuerte para firmar sessions (mín 32 chars) |

Scripts disponibles en `cf-worker/package.json`:
```bash
npm run secret:turso-url
npm run secret:turso-token
npm run secret:resend
npm run secret:jwt
```

---

## 5. Levantar el worker localmente

Solo si vas a tocar backend cloud:

```bash
cd cf-worker
npm install
# secrets se levantan de un .dev.vars file (gitignored)
echo "TURSO_DATABASE_URL=..." > .dev.vars
echo "TURSO_AUTH_TOKEN=..." >> .dev.vars
echo "RESEND_API_KEY=re_xxx" >> .dev.vars
echo "JWT_SECRET=cualquier-string-random" >> .dev.vars
npm run dev  # corre en localhost:8787
```

Después en el frontend: `VITE_AUTH_WORKER_URL=http://localhost:8787 npm run tauri dev`.

---

## 6. Conceptos clave

### Two-layer types

- `src/types/domain.ts` = shape UI (lo que ve el componente)
- `src/lib/db/types.ts` = shape RAW DB (columnas SQL)
- `src/lib/mappers.ts` = bridge entre ambos

Algunos tipos (`Sale`, `Task`, `CashMovement`) están definidos en AMBOS
files con shapes distintos. Es intencional.

### Local ↔ cloud dispatcher

Cada `src/lib/db/<feature>.ts` tiene un helper:

```ts
function cloudCtx() {
  const s = useCloudAuthStore.getState();
  if (!s.isCloudModeFor("customers")) return null;
  return { jwt: s.jwt, wsId: s.activeWorkspaceId };
}
```

Cada función pública (`getAll`, `create`, etc) hace:

```ts
const ctx = cloudCtx();
if (ctx) {
  // hablar al worker
  return await someCloudApi(ctx.jwt, ctx.wsId, ...);
}
// fallback local SQLite
return dbSelect(...);
```

### Polling

`useCloudQueryConfig(feature)` devuelve `{refetchInterval, staleTime}`:
- Cloud mode + user activo: 5s / 4.5s
- Cloud mode + user idle (>2min sin input): 30s / 29.5s
- Local mode: false / Infinity

### Permisos

```ts
import { can } from "../../lib/permissions";

if (!can(userRole, "createSale")) { /* esconder botón */ }
```

Mismo archivo importado por el Worker:
```ts
// cf-worker/src/routes/...
import { can } from "../../../src/lib/permissions";
```

---

## 7. Workflow de cambios

### Code change

```bash
git checkout -b feat/foo
npm run dev          # o tauri dev
# editar
npm test             # vitest unit tests
npm run build        # verificar TS compila
git commit -m "feat: ..."
git push
```

### Release

Tag → CI corre el build → GitHub Releases.

```bash
npm run release patch   # bump v1.3.X → v1.3.X+1, tag, push
```

El workflow `build.yml` compila Windows/macOS/Linux, firma con
`TAURI_SIGNING_PRIVATE_KEY` (secret de repo), y publica.

Las apps instaladas detectan el update en arranque (throttle 24h) y
muestran banner.

### Deploy worker

```bash
cd cf-worker
set -a && source ../.env.local && set +a   # carga CLOUDFLARE_API_TOKEN
npx wrangler deploy
```

---

## 8. Postmortems

Errores del frontend van a `client_errors` table en Turso (vía
`log.error` → endpoint POST /errors). Para investigar:

```bash
turso db shell clozr-prod
> SELECT occurred_at, message, scope, app_version
    FROM client_errors
    WHERE occurred_at > datetime('now', '-1 day')
    ORDER BY occurred_at DESC
    LIMIT 50;
```

Worker logs ephemeral via `wrangler tail`:
```bash
cd cf-worker && npx wrangler tail
```

---

## 9. Dudas frecuentes

**¿Por qué `console.warn` con `eslint-disable` aparece en algunos archivos?**
Históricos pre-logger. Si modificás un file, migrá al módulo `log` y
sacá el eslint-disable.

**¿Por qué hay 2 interfaces `Sale`?**
Ver "Two-layer types" arriba. UI vs DB-row.

**¿Cómo agrego una feature nueva al cloud?**
Ver `docs/ARCHITECTURE.md` sección "Agregar una feature al cloud".

**¿Cómo testeo cambios al schema cloud?**
1. Edit `cf-worker/src/schema.ts`
2. Bump `SCHEMA_VERSION`
3. Deploy worker
4. POST a `/admin/migrations` con header `x-admin-secret: <JWT_SECRET>` para
   forzar el re-apply (o esperar a que llegue una request real).
