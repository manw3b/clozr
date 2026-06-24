# Billing go-live — Mercado Pago (suscripciones)

El **código de billing ya está completo y verificado** (checkout con preapproval,
webhook con validación de firma, límite de asientos, dunning, re-pricing). Lo
único que falta para cobrar de verdad es **config de producción**: setear los
secrets de MP, registrar el webhook en el dashboard de MP y deployar.

Este doc es el runbook reproducible. Todos los comandos `npm run …` se corren
**desde `cf-worker/`**.

---

## TL;DR (camino feliz)

```bash
cd cf-worker

# 1. Secrets de MP (pegás el valor cuando lo pida)
npm run secret:mp-token      # → MP_ACCESS_TOKEN  (APP_USR-… de producción)
npm run secret:mp-webhook    # → MP_WEBHOOK_SECRET (el secret que genera el dashboard)

# 2. Deploy
npm run deploy

# 3. Verificar que MP quedó bien cableado
curl -s -H "x-admin-secret: $ADMIN_SECRET" \
  https://clozr-auth.pyter-import.workers.dev/admin/billing-status | jq
```

Y en el **dashboard de Mercado Pago** → *Tus integraciones → Webhooks*: apuntar a
`https://clozr-auth.pyter-import.workers.dev/billing/webhook` y suscribir los
eventos **Suscripciones (preapproval)** y **Pagos (payment)**. Ese paso es
**obligatorio**: el preapproval no manda `notification_url` propio, así que las
suscripciones se activan **solo** si el webhook está configurado ahí.

---

## Datos del entorno

| Cosa | Valor |
|---|---|
| Worker | `clozr-auth` |
| URL pública | `https://clozr-auth.pyter-import.workers.dev` |
| Webhook MP | `https://clozr-auth.pyter-import.workers.dev/billing/webhook` |
| Diagnóstico | `GET /admin/billing-status` (header `x-admin-secret`) |
| Secrets | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` |
| `back_url` post-pago | `https://clozr.online/app` *(confirmá que es tu web app real)* |

**Pricing (fuente de verdad: `src/routes/billing.ts` → `PLAN_CONFIG`)**

| Plan | USD/mes | Asientos base |
|---|---|---|
| Pro | 20 | 2 |
| Team | 45 | 5 |

Empleado extra: **+USD 5/mes** · Espacio/sucursal extra: **+USD 10/mes** ·
Anual: **×10** (2 meses gratis) · Trial: **14 días**. Se cobra en **ARS** al dólar
blue del momento (`src/dolar.ts`).

---

## Paso a paso

### 1. Cuenta y credenciales de MP

1. En [Mercado Pago Developers](https://www.mercadopago.com.ar/developers) → tu
   aplicación (o creá una de tipo **Suscripciones / Checkout**).
2. Copiá el **Access Token de producción** (`APP_USR-…`). El de TEST sirve para
   probar (ver más abajo); el de prod es el que cobra plata real.

### 2. Webhook en el dashboard de MP  ⚠️ obligatorio

*Tus integraciones → Webhooks → Configurar notificaciones (modo producción):*

- **URL:** `https://clozr-auth.pyter-import.workers.dev/billing/webhook`
- **Eventos:** **Suscripciones (preapproval)** y **Pagos (payment)**.
- Guardar → MP genera una **clave secreta**. Esa clave es el `MP_WEBHOOK_SECRET`.

> Por qué importa: el checkout crea el preapproval sin `notification_url`, así que
> MP avisa los cambios de estado usando **este** webhook del dashboard. Si no está,
> el pago se procesa pero el workspace **nunca pasa a `active`**.

### 3. Setear los secrets en el Worker

```bash
cd cf-worker
npm run secret:mp-token      # pegás el APP_USR-… de producción
npm run secret:mp-webhook    # pegás la clave secreta del webhook
```

(Equivale a `npx wrangler secret put MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET`.)

### 4. Deploy

```bash
npm run deploy
```

### 5. Verificar la config

```bash
curl -s -H "x-admin-secret: <ADMIN_SECRET o JWT_SECRET>" \
  https://clozr-auth.pyter-import.workers.dev/admin/billing-status | jq
```

Esperado:

```json
{
  "mp_access_token_set": true,
  "mp_webhook_secret_set": true,
  "mp_token_valid": true,
  "mp_account": "<tu-nickname-de-MP>",
  "blue_rate": 1234.5,
  "errors": []
}
```

Si `mp_token_valid` es `false` o hay `errors`, el token está mal o vencido.

---

## Probar end-to-end (antes de cobrar plata real)

Usá **credenciales de TEST** primero (Access Token de un *test user* vendedor). El
`init_point` que devuelve el checkout lleva al checkout de prueba; pagás con un
*test user* comprador + [tarjeta de prueba de MP](https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/your-integrations/test/cards).

1. **Checkout** — desde la app, como **owner**: *Ajustes → Plan → Mejorar a Pro*.
   Debe redirigir a Mercado Pago. (Directo por API:)
   ```bash
   curl -X POST https://clozr-auth.pyter-import.workers.dev/workspaces/<WID>/billing/checkout \
     -H "authorization: Bearer <SESSION_JWT>" -H "content-type: application/json" \
     -d '{"plan":"pro","interval":"monthly"}'
   # → { "init_point": "https://www.mercadopago...", "preapproval_id": "..." }
   ```
2. **Pagar** en el `init_point` con la tarjeta de prueba (nombre `APRO` = aprobado).
3. **Webhook** — MP pega a `/billing/webhook`. Verificá que el workspace quedó en
   Pro: `plan='pro'`, `plan_status='active'`, `seats=2`. (En la app se refleja al
   instante vía `/me`.) En *Webhooks → entregas* del dashboard tenés que ver
   respuestas **200**.
4. **Límite de asientos** — invitá miembros hasta `seats`; la siguiente invitación
   devuelve **402 `seat_limit`** y la UI de *Equipo* muestra el CTA "Mejorá tu plan".
5. Cuando todo esto pasa en TEST → cambiá `MP_ACCESS_TOKEN` al de **producción**
   (`npm run secret:mp-token`), `npm run deploy`, y hacé un último smoke test con
   una tarjeta real.

---

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| Checkout devuelve `503 billing_unavailable` | `MP_ACCESS_TOKEN` no seteado | `npm run secret:mp-token` + deploy |
| Checkout devuelve `503 exchange_unavailable` | la API del dólar blue no respondió | reintentar; ver `src/dolar.ts` |
| Checkout devuelve `502 billing_upstream` | MP rechazó el preapproval | mirar logs (`npm run tail`); token inválido o payload rechazado |
| Pago OK pero el plan **no** se activa | webhook del dashboard sin configurar | Paso 2 (eventos preapproval + payment) |
| Webhook responde `401 invalid_signature` | `MP_WEBHOOK_SECRET` no coincide con el del dashboard | re-copiar la clave y `npm run secret:mp-webhook` |
| Cambio de asientos devuelve `409 needs_recheckout` | MP pide re-autorización del pagador para subir el monto | el front ofrece re-suscribir (esperado) |

Logs en vivo: `cd cf-worker && npm run tail`.

---

## Referencia: lo que se verificó contra la API viva de MP

- **Firma del webhook** (`verifyMpSignature`): manifest
  `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` → HMAC-SHA256 con
  `MP_WEBHOOK_SECRET`, comparación en tiempo constante. ✔ coincide con MP.
- **Preapproval** (`handleBillingCheckout`): `reason`, `external_reference`
  (`wid:plan:extraSeats:interval`), `payer_email`, `back_url` (singular),
  `auto_recurring { frequency, frequency_type, transaction_amount, currency_id,
  free_trial { frequency, frequency_type } }`, `status:"pending"` → respuesta con
  `init_point` + `id`. ✔ coincide con MP.
- El webhook es la **única** fuente que escribe el estado de billing (el checkout
  no muta el workspace). Idempotente. Degradación a Free tras la gracia la maneja
  el cron `planDowngrade` (corre diario, junto con dunning y re-pricing).

Rutas de billing (todas en `src/routes/billing.ts`, registradas en `src/index.ts`):
`POST /workspaces/:wid/billing/checkout` · `…/billing/seats` · `…/cover` ·
`…/uncover` · `…/catalog/checkout` · `…/ai/checkout` · `POST /billing/webhook`.
