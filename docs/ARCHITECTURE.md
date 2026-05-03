# Arquitectura — Clozr

> Última actualización: v1.0

## Stack

```
React 18  +  TypeScript 5  +  Vite 6
   |
   +-- Zustand        — UI / auth / workspace state
   +-- TanStack Query — server state (DB queries + mutations)
   +-- React Hook Form + Zod — formularios
   +-- @dnd-kit       — drag & drop (Pipeline kanban)
   +-- Inter Variable — tipografía
   +-- Lucide React   — íconos
   |
   +-- Tauri 2 (Rust) — desktop runtime
       +-- tauri-plugin-sql      — SQLite con migraciones declarativas
       +-- tauri-plugin-fs       — filesystem (logos, backups)
       +-- tauri-plugin-dialog   — diálogos nativos
       +-- tauri-plugin-opener   — abrir URLs / archivos
       +-- tauri-plugin-updater  — auto-update via GitHub Releases firmados
       +-- tauri-plugin-process  — relaunch (post-update)
```

Sin Tailwind. Estilos vía **CSS variables** (definidas en `src/tokens/tokens.css`)
+ **inline `style={{}}`** con tokens tipados desde `src/tokens/index.ts`.

---

## Layout del repositorio

```
src/
├── tokens/
│   ├── tokens.css       — Design tokens (colores, espaciado, radii…)
│   └── index.ts         — Tokens tipados (color, space, radius, text, weight, etc.)
│
├── types/
│   └── domain.ts        — Tipos UI source-of-truth (Client, Sale, Lead, ...)
│
├── lib/
│   ├── db/              — Capa de acceso a SQLite (un módulo por entidad)
│   │   ├── index.ts             — dbSelect / dbExecute
│   │   ├── customers.ts         — customers CRUD
│   │   ├── sales.ts             — sales (createSale es transaccional con cash_movements)
│   │   ├── pipeline.ts          — pipeline_items + activities
│   │   ├── cash.ts              — cash_movements
│   │   ├── cashSessions.ts      — cash_day_sessions (apertura/cierre)
│   │   ├── customerContacts.ts  — tracking de WA/llamada/email
│   │   ├── ...
│   │
│   ├── mappers.ts       — Único lugar de conversiones DB → domain
│   ├── queryKeys.ts     — Factory qk.* + invalidate.* para TanStack Query
│   ├── format.ts        — Moneda, fechas, saludos
│   ├── groupings.ts     — groupLeadsByStage, buildSalesTimeline
│   ├── exportCsv.ts     — Helper genérico de CSV
│   ├── notifications.ts — Hook de notificaciones del topbar
│   ├── logger.ts        — log.* + errorMessage()
│   ├── useGlobalShortcuts.ts
│   ├── usePersistedState.ts
│   ├── updater.ts       — wrapper del Tauri updater plugin
│   └── ...
│
├── store/               — Zustand stores
│   ├── workspaceStore.ts
│   ├── businessStore.ts
│   ├── authStore.ts
│   ├── uiStore.ts       — activeScreen, toasts, quickModal
│   └── exchangeRateStore.ts
│
├── components/          — UI primitivos (design system)
│   ├── Button, Card, Input, Badge, Tabs, Modal, Drawer,
│   │   Avatar, EmptyState, PageHeader, ErrorBoundary,
│   │   CommandPalette, ShortcutsHelp, Toaster
│   ├── data-table/      — DataTable<T> genérico + RowActions
│   └── ui/              — Custom legacy (Select, ImageUpload)
│
├── layout/
│   ├── AppShell.tsx     — sidebar + topbar + main + (drawer)
│   ├── Sidebar.tsx
│   └── Topbar.tsx       — workspace selector + Cmd+K + notif + "+ Nuevo"
│
├── pages/               — Pantallas migradas al design system
│   ├── mi-dia/          — Dashboard del día
│   ├── clientes/
│   ├── pipeline/        — Kanban con drag&drop
│   ├── ventas/
│   ├── caja/
│   ├── tareas/
│   ├── equipo/
│   ├── deudas/
│   └── reportes/
│
├── features/            — Pantallas legacy (rediseño parcial pendiente)
│   ├── catalog/         — ItemFormModal usado por Inventory
│   ├── inventory/
│   ├── onboarding/
│   ├── quickStock/
│   └── settings/
│
├── assets/              — Logos SVG + PNG
├── styles/globals.css   — entry CSS (importa fonts + tokens)
├── App.tsx              — Componente root: AppShell + ruteo por activeScreen
└── main.tsx             — bootstrap React + ErrorBoundary + QueryClient

src-tauri/
├── src/main.rs          — Entry Rust + lista de migraciones
├── migrations/          — 22 archivos SQL numerados, never edit, only append
├── capabilities/        — Permisos del runtime (sql, fs, dialog, etc.)
└── tauri.conf.json      — productName, version, updater pubkey, bundle
```

---

## Reglas de oro

### 1. Domain types como source of truth
Si el shape que ve la UI no coincide con la DB, **el mapping vive en `src/lib/mappers.ts`**, no en componentes ni hooks.
Si un campo no existe en DB, se devuelve `undefined` o un valor sensato. **No** hardcodear `0` con un TODO — agregar la columna en una migración (Fase 2 fue eso).

### 2. Schema solo crece — nunca se edita
Las migraciones en `src-tauri/migrations/` son inmutables. Cada cambio es un archivo nuevo numerado. Pegar el `Migration { version, ... }` en `main.rs`.

### 3. Query keys centralizados
Todas las keys viven en `src/lib/queryKeys.ts` como funciones `qk.*`. Para invalidar después de mutations, usar `invalidate.afterSaleChange(qc)` etc. — no pegar strings sueltos.

### 4. Toasts automáticos para errores
Las queries fallidas (en su primer fetch) y todas las mutations fallidas disparan toast automático vía `QueryCache.onError` / `MutationCache.onError` (configurado en `main.tsx`).
**No** agregar `onError: (e) => showToast(...)` manual — duplica.

### 5. Estilos vía tokens
`color.primary`, `space[4]`, `radius.md`, `text.sm`, `weight.semibold`. **No** hardcodear hex ni px (excepto cuando un design call específico lo requiere).

### 6. CI verde antes de mergear
`npm run build` + `npm test` corren en cada push a `main` y en PRs. Si rompe, no se mergea.

### 7. Testear lo que es puro
`mappers.ts`, `format.ts`, `groupings.ts` tienen suite de tests. Todo nuevo helper puro debería tenerlos.
React/UI no se testea (overhead alto, ROI bajo en este momento).

---

## Cómo agregar features sin romper nada

1. **Si necesita nuevos campos en DB**: crear `src-tauri/migrations/0XX_descripcion.sql`, agregar al `main.rs`, actualizar `src/lib/db/types.ts`, actualizar mappers.
2. **Si es una pantalla nueva**: agregarla en `src/pages/<nombre>/`, registrar el `ScreenId` en `uiStore.ts`, agregarla al sidebar (`layout/Sidebar.tsx`), añadir el case en `App.tsx renderScreen`.
3. **Si es un componente reusable**: agregarlo a `src/components/`. Si es de tabla, va en `src/components/data-table/`.
4. **Si necesita queries**: hook en `src/pages/<feature>/use<Feature>Data.ts`. Usar `qk.*` y `invalidate.*`.
5. **Si toca múltiples features**: probablemente debería estar en `src/lib/`.

---

## Auto-update

Cada `git push origin v<X.Y.Z>` dispara GitHub Actions que:
1. Compila para Windows/Mac/Linux
2. Firma con `TAURI_SIGNING_PRIVATE_KEY` (secret de repo)
3. Crea un GitHub Release con instaladores + `latest.json`
4. Las apps instaladas detectan el update al iniciar (3s después del boot) y muestran banner

**Para publicar una nueva versión:**
```bash
# 1. Bump en src-tauri/tauri.conf.json
# 2. Commit + tag
git add -A && git commit -m "feat: ..."
git tag v0.X.Y
git push && git push origin v0.X.Y
```

---

## Bottlenecks conocidos

- **Bundle JS**: ~830KB minified / ~210KB gzip — aceptable para desktop pero podría code-split por pantalla si crece más
- **Inventory legacy**: la pantalla más grande sin rediseñar; usa estilos viejos pero con tokens al día
- **No hay multi-user real**: hay tabla `workspace_members` pero no auth ni permisos enforced
- **Backup es JSON-export, no SQLite copy**: JSON pierde índices, FKs. Para backup duro hay que copiar el archivo .db
