---
name: clozr-ai-triage
description: Trabajá sobre el AI Triage matutino de Clozr — el cron del Worker que detecta leads estancados y redacta follow-ups con una llamada a Claude Haiku. Usar cuando el usuario quiera testear, deployar, ajustar el horario/criterios, o extender la feature "Clozr trabaja de noche por vos" (cron + llamada a la API de Claude, NO Managed Agents).
---

# clozr-ai-triage — el CRM que trabaja de noche (PoC)

Feature: cada mañana el Worker barre los workspaces, junta los **leads estancados**
(oportunidades `open` sin movimiento hace N días) y, con **una sola llamada a Claude Haiku**,
redacta el follow-up sugerido por lead. Crea una `task` tipo `followup` por cada uno.

**Decisión de arquitectura (no re-discutir):** esto es **Cron Trigger de Cloudflare + 1 llamada
a la API de Claude**, NO Managed Agents. Managed Agents (contenedor/sesión/tools por run) es caro
y overkill para "resumir y redactar"; las unit economics no cierran para PyMEs LATAM. Solo
considerar Managed Agents si el agente necesitara encadenar herramientas de forma autónoma.

## Piezas (todas en el repo `clozr`, carpeta `cf-worker`)

- `src/cron/aiTriage.ts` — la lógica: `runAiTriage(env)`. Constantes arriba del archivo:
  `STALE_DAYS` (días sin update = estancado), `MAX_LEADS_PER_WS` (cap de costo), `MODEL`
  (`claude-haiku-4-5-20251001`), `TRIAGE_TAG` (`ai-triage`, marca + idempotencia).
- `src/index.ts` — handler `scheduled(...)` (lo dispara el cron vía `ctx.waitUntil`) y trigger
  manual `POST /admin/ai-triage` (gate `x-admin-secret == JWT_SECRET`, mismo patrón que `/admin/migrations`).
- `wrangler.toml` — `[triggers] crons = ["0 11 * * *"]` (11 UTC = 8am ART).
- Env: `ANTHROPIC_API_KEY` (secret). Si falta, el cron hace skip limpio.

## Invariantes que hay que respetar

1. **Multi-tenant:** toda query filtra por `workspace_id`; el loop procesa un workspace por vez
   y nunca cruza datos. Antes de deployar cambios, corré el skill **clozr-multitenant-audit**.
2. **Idempotente:** no recrea una task de `ai-triage` para el mismo `customer_id` el mismo día
   (cláusula `NOT EXISTS` sobre `tasks`). Correrlo dos veces no duplica.
3. **Costo acotado:** `MAX_LEADS_PER_WS` capea los leads por workspace por corrida; una sola
   llamada al modelo por workspace. Usar Haiku salvo razón fuerte.
4. **Tolerante a fallos:** un workspace que falla se loguea y NO tumba al resto.
5. **FK:** `tasks.created_by REFERENCES users(id)` — el cron inserta `created_by = NULL`
   (no hay user humano). No pongas un string arbitrario ahí.
6. **Parseo defensivo:** la respuesta del modelo se parsea extrayendo el primer array JSON; si
   no parsea, ese workspace crea 0 tasks (no rompe).

## Testear

**Local:**
```
cd cf-worker
npx wrangler dev --test-scheduled
# en otra terminal, disparar el cron:
curl "http://localhost:8787/__scheduled?cron=0+11+*+*+*"
```
Para datos reales necesitás `ANTHROPIC_API_KEY` en un `.dev.vars` (NO commitearlo):
```
ANTHROPIC_API_KEY=sk-ant-...
```

**Prod (sin esperar al cron):**
```
curl -X POST https://clozr-auth.pyter-import.workers.dev/admin/ai-triage \
  -H "x-admin-secret: $JWT_SECRET_DEL_WORKER"
```
Devuelve `{ ok, workspaces, tasksCreated }`. Mirá logs con `npx wrangler tail`.

## Deployar

1. `cd cf-worker && npx wrangler secret put ANTHROPIC_API_KEY` (si no está).
2. Corré **clozr-multitenant-audit** si tocaste queries.
3. `npx wrangler deploy` (o usá el skill **clozr-release**). El cron queda activo automáticamente.
4. Verificá `upcoming` del cron en el dashboard de Cloudflare → Workers → Triggers.

## Ideas de extensión (cuando haya tracción)

- Mostrar las tasks de IA con un badge "sugerido por Clozr" en la webapp (filtro `template_id = 'ai-triage'`).
- Resumen ejecutivo por email al owner (reusar `src/email.ts` + Resend).
- Hacer el horario/criterios configurables por workspace (tabla settings).
- Distinto follow-up según `stage_name` o `lead_source`.
