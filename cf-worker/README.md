# clozr-auth — Cloudflare Worker

Backend stateless de Clozr. Frontea Turso (libSQL) y maneja:
- Magic-link auth + códigos 6 dígitos
- JWT issuance (HS256, in-house con SubtleCrypto)
- Workspaces multi-tenant + memberships con roles
- CRUD sobre tablas compartidas (customers, sales, pipeline, etc)
- Telemetría de errores del cliente

Stack: TypeScript estricto, sin framework — fetch handler nativo de Workers.

---

## Endpoints

### Auth

| Método | Path | Auth | Descripción |
|---|---|---|---|
| `GET` | `/` | — | Health check |
| `POST` | `/auth/request` | rate-limit | Manda magic-link al email (Resend) |
| `GET` | `/auth/verify?token=...` | — | Valida token, redirige a `clozr://auth-complete?jwt=...` |
| `POST` | `/auth/verify-code` | rate-limit | Verifica código 6 dígitos, devuelve JWT |

### Identity

| Método | Path | Auth | Descripción |
|---|---|---|---|
| `GET` | `/me` | JWT | Devuelve user + workspaces con role |
| `POST` | `/workspaces` | JWT | Crea workspace (auto-membership owner) |

### Team

| Método | Path | Auth | Descripción |
|---|---|---|---|
| `GET` | `/workspaces/:wid/members` | JWT | Lista miembros |
| `POST` | `/workspaces/:wid/invite` | JWT (owner/admin) | Invita por email |
| `PATCH` | `/workspaces/:wid/members/:mid` | JWT (owner/admin) | Cambia rol |
| `DELETE` | `/workspaces/:wid/members/:mid` | JWT (owner/admin) | Expulsa (soft) |
| `POST` | `/workspaces/:wid/members/:mid/access-code` | JWT (owner/admin) | Genera código 6 dígitos para que el miembro entre sin email (workaround para Resend sandbox) |

### Data CRUD (R1-R5)

Patrón común: `/workspaces/:wid/<resource>`

- `customers`, `sales`, `pipeline/stages`, `pipeline/items`
- `tasks`, `cash`, `followups`
- `catalog`, `payment-methods`, `customer-types`, `customer-tags`

Métodos: `GET` (list), `POST` (create), `PATCH /:id` (update), `DELETE /:id` (soft delete), `POST /import` (bootstrap bulk).

Algunos extras:
- `GET /sales/:sid` — devuelve sale + items + payments en una respuesta
- `POST /sales/:sid/payments` — agregar pago a venta existente
- `POST /catalog/:id/decrement-stock` — UPDATE atómico de stock
- `POST /sales` con `cash_movements` + `stock_decrements` opcionales — todo en una transacción (E1)

### Admin / observability

| Método | Path | Auth | Descripción |
|---|---|---|---|
| `POST` | `/admin/migrations` | `x-admin-secret: <JWT_SECRET>` | Trigger explícito de `ensureSchema` después de un deploy |
| `POST` | `/errors` | rate-limit | Recibe errores del frontend (`log.error`), persiste en `client_errors` |

---

## Bindings

### Secrets (set con `wrangler secret put NOMBRE`)

| Secret | Para qué |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://clozr-prod-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | JWT Turso (read+write scope) |
| `RESEND_API_KEY` | `re_xxx` para enviar emails magic-link |
| `JWT_SECRET` | Random fuerte ≥32 chars (firma sessions + protege `/admin/*`) |

### Vars (`wrangler.toml`)

```toml
RESEND_FROM = "Clozr <onboarding@resend.dev>"
MAGIC_LINK_TTL_MIN = "15"
SESSION_TTL_DAYS = "30"
DEEP_LINK_SCHEME = "clozr"
```

---

## Resiliencia / perf

- **Rate limit** in-memory por IP en endpoints sensibles (`/auth/request`, `/auth/verify-code`, `/errors`).
- **Session cache** in-memory (30s TTL) en `requireAuth` — reduce ~98% del tráfico Turso de auth-checks.
- **`tursoQuery` timeout** 15s via AbortController.
- **`ensureSchema` version-check** — skipea 50 DDL statements en cold start si la versión ya está aplicada (tabla `schema_meta`).
- **`tursoTransaction`** — BEGIN/COMMIT/ROLLBACK para operaciones multi-statement atómicas (sales: sale + items + payments + cash + stock todo-o-nada).
- **CORS** abierto — el WebView2 de Tauri 2 a veces manda `origin: null`. CORS reflejo (no whitelist).

---

## Desarrollo local

```bash
npm install
# secrets en .dev.vars (gitignored)
cat > .dev.vars <<EOF
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=eyJ...
RESEND_API_KEY=re_...
JWT_SECRET=mi-secret-random
EOF
npm run dev   # corre en localhost:8787
```

Apuntar el frontend al worker local con `VITE_AUTH_WORKER_URL=http://localhost:8787`.

## Deploy

```bash
# necesita CLOUDFLARE_API_TOKEN en env
npx wrangler deploy
```

Ver `npx wrangler tail` para logs en tiempo real.

## Schema

`src/schema.ts` define todas las tablas. Pattern:
- `CREATE TABLE IF NOT EXISTS` (idempotente)
- `safeAddColumn()` para ALTER TABLE (catchea "duplicate column")
- Bump `SCHEMA_VERSION` cuando agregás DDL — el version-check de cold start así re-aplica.

Para forzar re-apply post-deploy:
```bash
curl -X POST -H "x-admin-secret: <JWT_SECRET>" \
  https://clozr-auth.pyter-import.workers.dev/admin/migrations
```
