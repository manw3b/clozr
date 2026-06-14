---
name: clozr-feature
description: Scaffold de una feature full-stack en la app desktop Clozr siguiendo los golden rules — tipo domain + DB, mapper con su test, namespace en queryKeys (qk.* + invalidate.*), y permiso en permissions.ts (can(role, perm)). Usar cuando el usuario quiera "agregar una feature", "una entidad/tabla nueva en la desktop", o un módulo nuevo del CRM.
---

# clozr-feature — feature full-stack en la desktop (golden rules)

Aplica los patrones obligatorios de Clozr para que una feature nueva quede consistente con el resto.
Trabajá en el repo `clozr` (app Tauri + React + TanStack Query, SQLite local + Worker/Turso opcional).

## Golden rules (no negociables)

1. **Dos capas de tipos + mapper.** Definí el tipo de dominio (camelCase, para la UI) y el tipo DB raw
   (snake_case). El puente va en `src/lib/mappers.ts` como función pura (sin queries): `dbXToDomain(r: DbX): X`.
   Agregá su `mappers` test (`.test.ts`) — todo mapper nuevo lleva test.

2. **Schema idempotente.** Agregá la tabla/columna en `src/lib/db/ensureSchema.ts` con
   `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, y `ALTER TABLE ADD COLUMN` envuelto en `safe()`.
   El schema **solo crece**, nunca se modifica retroactivamente.

3. **Acceso a datos centralizado.** Usá `dbSelect`/`dbExecute`/`getDb` — no toques `plugin-sql` directo
   (solo 2 archivos lo hacen y así debe seguir). Para cloud, respetá `isCloudModeFor(feature)`.

4. **Query keys.** Agregá un namespace en `src/lib/queryKeys.ts` con tuplas `as const`
   (`qk.miFeature.all()`, `qk.miFeature.byX(...)`) y, si corresponde, sumá la invalidación cruzada
   en el helper `invalidate.*` (ej. si afecta ventas/caja/clientes, encadená esos `invalidateQueries`).

5. **Permisos.** Si la feature tiene acciones con control de acceso, agregá el permiso a la matriz
   `PERMISSIONS` de `src/lib/permissions.ts` (zero-deps, compartido con el Worker) y chequealo con
   `can(role, permission)`. Si el endpoint del Worker también lo necesita, usá el role-check del worker.

6. **Estilos.** Solo tokens CSS — nunca hex/px hardcodeados.

7. **Errores.** NO agregues try/catch redundante: `QueryCache`/`MutationCache` ya manejan errores global.

## Orden sugerido

1. Schema (`ensureSchema.ts`) → 2. Tipos domain + DB → 3. Mapper + test →
4. Funciones de data (`dbSelect`/`dbExecute`) → 5. queryKeys + invalidate →
6. Permisos (si aplica) → 7. Hooks (useQuery/useMutation) → 8. UI con tokens.

## Si la feature necesita backend cloud

La capa de datos ya está centralizada y existe `isCloudModeFor(feature)` + permisos compartidos.
Para exponer la entidad en el Worker (webapp), usá el skill **clozr-endpoint** (en el repo `clozr-web`).

## Cerrar

- Corré los tests de mappers.
- Para publicar, usá el skill **clozr-release**.
