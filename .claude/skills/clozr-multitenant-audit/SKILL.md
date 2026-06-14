---
name: clozr-multitenant-audit
description: Audita el aislamiento multi-tenant del Cloudflare Worker de Clozr — verifica que cada handler valide auth + membership y que TODA query filtre por workspace_id, antes de un deploy. Usar cuando el usuario pida "auditar seguridad", "revisar aislamiento de inquilinos", "chequear el worker antes de deployar", o tras tocar rutas en cf-worker/src/routes/.
---

# clozr-multitenant-audit — auditoría de aislamiento multi-tenant

El riesgo #1 de Clozr es una fuga entre workspaces: que un usuario lea/escriba datos de otro
inquilino. Este skill verifica que NO pase. Aplicalo al diff actual o a un archivo de rutas.

## Alcance

Por defecto audita el **diff** (`git diff` + staged) dentro de `cf-worker/`. Si el usuario nombra
un archivo (ej. `cf-worker/src/routes/sales.ts`), audita ese archivo completo.

## Checklist por cada handler de dominio

Para CADA función `handle*` que toque datos de un workspace, verificá y reportá ✅/❌:

1. **Auth:** llama `requireAuth(req, env)` y retorna 401 si es null.
2. **Membership:** llama `getMembershipRole(env, workspaceId, auth.userId)` y retorna 403 si no hay role o el role no está en el set permitido.
3. **Role correcto:** lectura usa un set de lectura (`ROLES_READ`); escritura/borrado usa el set de escritura adecuado y consistente con `src/lib/permissions.ts` (`can(role, perm)`).
4. **Filtro de tenant:** **TODA** sentencia SQL (SELECT/UPDATE/DELETE/INSERT join) incluye `workspace_id = ?` con el `workspaceId` del path. Marcá como ❌ CRÍTICO cualquier query sin él.
5. **Soft-delete:** lecturas filtran `deleted_at IS NULL`; DELETE setea `deleted_at` en vez de borrar (salvo que el recurso sea hard-delete por diseño explícito).
6. **No confiar en el body:** el `workspace_id` viene del path (`/workspaces/:wid/...`), nunca del cuerpo del request. Si un INSERT/UPDATE toma `workspace_id` del body, es ❌.
7. **Whitelist de columnas:** PATCH/UPDATE limita las columnas editables (no spread crudo del body a SQL).
8. **IDs cruzados:** si el handler recibe un id hijo (customerId, itemId, etc.), la query verifica que ese id pertenezca al `workspace_id` (no solo que exista).
9. **CORS:** la respuesta pasa por `cors(req, env, ...)` como las demás rutas.

## Verificación adicional

- Cruzá `index.ts`: cada match de ruta `/workspaces/:wid/...` despacha a un handler que recibe `wsId` del path (no hardcodeado, no del body).
- Buscá queries "sueltas": `grep` por `tursoQuery`/`tursoFirst`/`SELECT`/`UPDATE`/`DELETE` en los archivos auditados y confirmá que cada una tiene su `workspace_id`.

## Salida

Reportá una tabla por handler con el resultado de los 9 puntos, y al final una lista priorizada:
- 🔴 **CRÍTICO** — queries sin `workspace_id`, auth/membership faltante, tenant tomado del body.
- 🟡 **Revisar** — soft-delete inconsistente, role set dudoso, falta whitelist.
- 🟢 **OK**.

Si encontrás un 🔴, NO declares el worker listo para deploy. Ofrecé el fix.
