# Changelog

Toda mejora que rompa schema o cambie comportamiento user-facing se documenta acá.
Versionado [SemVer](https://semver.org/lang/es/) — minor para nuevas features, patch para fixes.

## [v1.0.0]

Primer release estable. App completa funcionalmente sobre la base sólida de las
fases 0-5. Desde acá, los próximos commits agregan features sin romper la base.

### Higiene final pre-1.0
- Knip configurado (`knip.json`) — detecta archivos / exports / deps huérfanos
- Eliminados 23 archivos huérfanos (legacy `pages/*Page.tsx`, `features/catalog/*` no usados, etc.)
- ESLint configurado con reglas estrictas reales
- `console.log` placeholders en UI reemplazados por handlers reales o toasts informativos
- Documentación: `docs/ARCHITECTURE.md` + este `CHANGELOG.md`

## [v0.10.0] — Quality of life

- Keyboard shortcuts globales: `V/C/M/T/L` para crear, `1-9` para navegar
- Modal de ayuda con todos los atajos (tecla `?`)
- Helper `exportCsv` reutilizable + export en Ventas / Deudas / Clientes
- `usePersistedState` (localStorage) para filtros que sobreviven al cierre
  - Aplicado a Clientes / Ventas / Tareas

## [v0.9.0] — Features que faltaban

- Notificaciones reales en topbar (badge con count + dropdown clickeable)
- Búsqueda global con `Cmd/Ctrl+K` (clientes / ventas / leads + shortcuts)
- Pantalla **Deudas** consolidada (cross-cliente con bulk cobrar)
- Pantalla **Reportes** (4 metric cards + bar chart 6 meses + top clientes/vendedores)
- Sidebar reorganizado: General / Operaciones / Análisis / Configuración

## [v0.8.0] — Migración visual completa

- Onboarding rediseñado
- Equipo full migrado al diseño nuevo (DataTable + drawer + modal)
- Tareas full migradas (DataTable + checkbox optimista + filtros + modal)
- Ajustes con shell refinado
- Rename masivo de tokens viejos en 16 archivos legacy (`features/*`)

## [v0.7.0] — Schema gaps

- Migration 019: `customer_contacts` (tracking real WhatsApp/Call/Email)
- Migration 020: `cash_day_sessions` (apertura/cierre de caja)
- Migration 021: `pipeline_items` extendida (product, next_action, owner, position)
- Migration 022: `sales.payment_method` denormalizado (con backfill)
- Hooks: `useRecordContact`, `cashSessionsDb.ensureForDay`, etc.

## [v0.6.0] — Foundation reforzada

- `src/lib/mappers.ts` — único lugar para conversiones DB ↔ domain
- `src/lib/queryKeys.ts` — `qk.*` factory + `invalidate.*` helpers
- `ErrorBoundary` global + toast automático en query/mutation errors
- `src/lib/logger.ts` con namespacing
- Vitest + 63 tests unitarios (mappers, format, groupings)
- CI ahora corre tests en cada push

## [v0.5.0] — Estabilización funcional

- NewSaleModal funcional (crea ventas reales con auto-cash-movement)
- Crear/editar cliente con modal
- Dropdown "+ Nuevo" en topbar (Cliente / Venta / Lead / Tarea / Movimiento)
- Bulk delete + export CSV en Clientes
- CI workflow `verify.yml` corre en cada push
- Eliminado `src/mock/` entero

## [v0.4.0] — Pantallas conectadas a SQLite

- Mi Día / Clientes / Pipeline / Ventas / Caja consultan DB real
- Mappers + queries + mutations con TanStack Query

## [v0.3.0] — Migración al design system

- Tokens nuevos (dark only, brand `#E11D48`)
- Inter Variable
- Componentes base nuevos: Button / Card / Tabs / Badge / Input / Modal / Drawer / DataTable / Avatar / EmptyState / PageHeader
- Layout AppShell + Sidebar colapsable + Topbar con Cmd+K trigger
- Logos SVG oficiales

## [v0.2.0] — Auto-update

- `tauri-plugin-updater` configurado con firma
- GitHub Actions firma instaladores con `TAURI_SIGNING_PRIVATE_KEY`
- App detecta updates 3s después del boot

## [v0.1.x]

- Setup inicial: Tauri 2 + React + TS + SQLite (18 migraciones iniciales)
