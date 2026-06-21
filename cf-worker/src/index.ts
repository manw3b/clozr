/**
 * Clozr — auth Worker
 *
 * Endpoints:
 *   GET  /                 → health
 *   POST /auth/request     → manda magic link al email (F1.3)
 *   GET  /auth/verify      → valida token, redirige a clozr://auth (F1.4)
 *
 * Stack:
 *   - Cloudflare Workers (fetch handler nativo, sin framework por ahora)
 *   - Turso vía HTTP /v2/pipeline (mismo patrón que validamos en spike)
 *   - Resend para email
 *   - HS256 JWT firmado con SubtleCrypto (no necesitamos lib externa)
 *
 * Cuando este file crezca lo splittemos en routes/ + lib/.
 */

export interface Env {
  // secrets
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  RESEND_API_KEY: string;
  JWT_SECRET: string;
  // vars
  RESEND_FROM: string;
  MAGIC_LINK_TTL_MIN: string;
  SESSION_TTL_DAYS: string;
  DEEP_LINK_SCHEME: string;
  ALLOWED_ORIGINS: string;
  // Consola Clozr: lista de emails super-admin (separada por comas). Gate
  // server-side de las rutas /console/*. Ver superadmin.ts.
  SUPERADMIN_EMAILS: string;
  // Google OAuth (F: login con Google). client_id puede ser var; el secret
  // se setea con `wrangler secret put GOOGLE_CLIENT_SECRET`.
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  // AI Triage (PoC): key de la API de Claude para el cron matutino que
  // redacta follow-ups de leads estancados. Se setea con
  // `wrangler secret put ANTHROPIC_API_KEY`. Si falta, el cron hace skip.
  ANTHROPIC_API_KEY: string;
  // Billing (T3) — Mercado Pago suscripciones (preapproval). Se setean con
  // `wrangler secret put MP_ACCESS_TOKEN` y `wrangler secret put
  // MP_WEBHOOK_SECRET`. Si MP_ACCESS_TOKEN falta, /billing/checkout devuelve
  // 503. MP_WEBHOOK_SECRET valida la firma del webhook (si falta, se loguea
  // y se procesa igual — solo recomendado para dev).
  MP_ACCESS_TOKEN: string;
  MP_WEBHOOK_SECRET: string;
  // R2 bucket binding (I) — para logos/banners del workspace.
  ASSETS: R2Bucket;
}

import { handleAuthRequest } from "./routes/request";
import { handleAuthVerify } from "./routes/verify";
import { handleAuthVerifyCode } from "./routes/verify-code";
import { handleGoogleStart, handleGoogleCallback } from "./routes/google";
import { handleMe, handleUpdateMe } from "./routes/me";
import { ensureSchema } from "./schema";
import {
  handleCreateWorkspace,
  handleUpdateWorkspace,
  handleListMembers,
  handleInviteMember,
  handlePatchMember,
  handleRevokeMember,
  handleIssueAccessCode,
} from "./routes/workspaces";
import {
  handleListAssignedTaskTemplates, handleCreateAssignedTaskTemplate,
  handleUpdateAssignedTaskTemplate, handleDeleteAssignedTaskTemplate,
} from "./routes/assigned-tasks";
import {
  handleListCustomerContacts, handleCreateCustomerContact,
  handleLastContactByCustomer,
} from "./routes/customer-contacts";
import {
  handleUploadLogo, handleDeleteLogo,
  handleUploadBanner, handleDeleteBanner,
  handleAssetProxy,
} from "./routes/workspace-assets";
import {
  handleListCustomers,
  handleCreateCustomer,
  handleUpdateCustomer,
  handleDeleteCustomer,
  handleImportCustomers,
} from "./routes/customers";
import {
  handleListStages, handleCreateStage, handleUpdateStage, handleDeleteStage, handleImportStages,
  handleListItems, handleCreateItem, handleUpdateItem, handleDeleteItem, handleImportItems,
} from "./routes/pipeline";
import {
  handleListSales, handleGetSale, handleCreateSale, handleUpdateSale,
  handleDeleteSale, handleAddPayment, handleImportSales, handleListSaleItems,
} from "./routes/sales";
import { handleListCatalogPrices, handleSetCatalogPrice } from "./routes/catalogPrices";
import {
  handleGenericList, handleGenericCreate, handleGenericUpdate,
  handleGenericDelete, handleGenericImport,
} from "./routes/_generic";
import { SIMPLE_TABLE_SPECS } from "./routes/simpleTables";
import { handleDecrementStock } from "./routes/catalog-stock";
import {
  handleListCashSessions,
  handleOpenCashSession,
  handleCloseCashSession,
} from "./routes/cash-sessions";
import { handleClientError } from "./routes/errors";
import { handleBillingCheckout, handleBillingWebhook } from "./routes/billing";
import {
  handleListCodes, handleCreateCode, handleUpdateCode, handleRedeemCode,
} from "./routes/console";
import { runAiTriage } from "./cron/aiTriage";
import { runPlanDowngrade } from "./cron/planDowngrade";

export default {
  // ── Cron: AI Triage matutino (PoC) ───────────────────────────────────
  // Lo dispara Cloudflare según wrangler.toml [triggers]. ctx.waitUntil
  // mantiene vivo el isolate hasta que termina el barrido de workspaces.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Dos jobs independientes en el mismo trigger diario. Cada uno con su catch
    // para que un fallo (o un reject) de uno no impida el otro.
    ctx.waitUntil(runAiTriage(env).catch((e) => console.error("[cron] ai-triage:", e)));
    ctx.waitUntil(runPlanDowngrade(env).catch((e) => console.error("[cron] plan-downgrade:", e)));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight — la app Tauri pega como un browser normal.
    if (req.method === "OPTIONS") {
      return cors(req, env, new Response(null, { status: 204 }));
    }

    try {
      const route = `${req.method} ${url.pathname}`;

      // ── Rate limit en endpoints sensibles ─────────────────────────
      // /auth/request y /auth/verify-code son los únicos puntos donde
      // un attacker no autenticado puede pegar libremente — el resto
      // requiere JWT válido. Limit por IP (CF-Connecting-IP es trusted
      // en Workers). Memoria del isolate: se reparte entre las pocas
      // instancias que CF spinea para esta zona (~1-2 con nuestro tráfico),
      // así que en la práctica es ~per-Worker.
      if (route === "POST /auth/request") {
        if (!checkRate(req, "request", 5, 10 * 60_000)) {
          return cors(req, env, json({ error: "rate_limited" }, 429));
        }
      }
      if (route === "POST /auth/verify-code") {
        if (!checkRate(req, "verify-code", 10, 10 * 60_000)) {
          return cors(req, env, json({ error: "rate_limited" }, 429));
        }
      }
      // E2: telemetría — endpoint para que el frontend nos avise de
      // errores. Rate limit alto (20/min/IP) — un user con la app rota
      // podría flood, pero queremos capturar bursts cuando un release
      // sale roto en producción.
      if (route === "POST /errors") {
        if (!checkRate(req, "errors", 20, 60_000)) {
          return cors(req, env, json({ error: "rate_limited" }, 429));
        }
        return cors(req, env, await handleClientError(req, env));
      }

      // ── Admin: trigger migraciones explícitamente ──────────────────
      // Útil después de un deploy con cambios de schema — antes había
      // que esperar la primera request real para que `ensureSchema`
      // (que es lazy) corriera. Ahora podemos pegarle desde wrangler
      // tail o postman y confirmar. Protegido con header shared-secret
      // (reusamos JWT_SECRET — no es perfecto pero es lo único que ya
      // tenemos como secret arbitrario en el entorno).
      if (route === "POST /admin/migrations") {
        const provided = req.headers.get("x-admin-secret");
        if (!provided || provided !== env.JWT_SECRET) {
          return cors(req, env, json({ error: "unauthorized" }, 401));
        }
        // Reset del initPromise no se expone — pero sí podemos forzar
        // re-correr llamando directo. ensureSchema es idempotente, OK.
        await ensureSchema(env);
        return cors(req, env, json({ ok: true, ranAt: new Date().toISOString() }));
      }

      // ── Admin: disparar el AI Triage a mano (PoC) ──────────────────
      // Para testear en prod sin esperar al cron. Mismo gate shared-secret
      // que /admin/migrations (x-admin-secret == JWT_SECRET).
      if (route === "POST /admin/ai-triage") {
        const provided = req.headers.get("x-admin-secret");
        if (!provided || provided !== env.JWT_SECRET) {
          return cors(req, env, json({ error: "unauthorized" }, 401));
        }
        const result = await runAiTriage(env);
        return cors(req, env, json({ ok: true, ...result }));
      }

      // ── Admin: disparar la degradación de plan a mano (testeo) ─────
      // Baja a Free los workspaces con la gracia vencida. Mismo gate
      // shared-secret (x-admin-secret == JWT_SECRET) que /admin/ai-triage.
      if (route === "POST /admin/plan-downgrade") {
        const provided = req.headers.get("x-admin-secret");
        if (!provided || provided !== env.JWT_SECRET) {
          return cors(req, env, json({ error: "unauthorized" }, 401));
        }
        const result = await runPlanDowngrade(env);
        return cors(req, env, json({ ok: true, ...result }));
      }

      // ── Consola Clozr (super-admin) — códigos canjeables ──────────
      // GET/POST /console/codes ; PATCH /console/codes/:id. El gate
      // super-admin (por email) se chequea dentro de cada handler.
      const consoleCodeMatch = url.pathname.match(/^\/console\/codes(?:\/([^/]+))?\/?$/);
      if (consoleCodeMatch) {
        const codeId = consoleCodeMatch[1];
        if (!codeId && req.method === "GET")   return cors(req, env, await handleListCodes(req, env));
        if (!codeId && req.method === "POST")  return cors(req, env, await handleCreateCode(req, env));
        if (codeId && req.method === "PATCH")  return cors(req, env, await handleUpdateCode(codeId, req, env));
      }

      // ── Rutas con path dinámico (/workspaces/:id/...) ─────────────
      const wsAccessCodeMatch = url.pathname.match(
        /^\/workspaces\/([^/]+)\/members\/([^/]+)\/access-code\/?$/,
      );
      const wsMembersMatch = url.pathname.match(
        /^\/workspaces\/([^/]+)\/members(?:\/([^/]+))?\/?$/,
      );
      const wsInviteMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/invite\/?$/);

      // Customers paths (F2-B R1):
      //   GET    /workspaces/:wid/customers
      //   POST   /workspaces/:wid/customers
      //   POST   /workspaces/:wid/customers/import
      //   PATCH  /workspaces/:wid/customers/:cid
      //   DELETE /workspaces/:wid/customers/:cid
      const wsCustomersImportMatch = url.pathname.match(
        /^\/workspaces\/([^/]+)\/customers\/import\/?$/,
      );
      const wsCustomerMatch = url.pathname.match(
        /^\/workspaces\/([^/]+)\/customers(?:\/([^/]+))?\/?$/,
      );

      if (wsCustomersImportMatch && req.method === "POST") {
        const wsId = wsCustomersImportMatch[1]!;
        return cors(req, env, await handleImportCustomers(wsId, req, env));
      }
      if (wsCustomerMatch) {
        const wsId = wsCustomerMatch[1]!;
        const cId = wsCustomerMatch[2];
        if (!cId && req.method === "GET")    return cors(req, env, await handleListCustomers(wsId, req, env));
        if (!cId && req.method === "POST")   return cors(req, env, await handleCreateCustomer(wsId, req, env));
        if (cId && req.method === "PATCH")   return cors(req, env, await handleUpdateCustomer(wsId, cId, req, env));
        if (cId && req.method === "DELETE")  return cors(req, env, await handleDeleteCustomer(wsId, cId, req, env));
      }

      // Pipeline paths (F2-B R2):
      //   GET/POST            /workspaces/:wid/pipeline/stages
      //   PATCH/DELETE        /workspaces/:wid/pipeline/stages/:sid
      //   POST                /workspaces/:wid/pipeline/stages/import
      //   GET/POST            /workspaces/:wid/pipeline/items
      //   PATCH/DELETE        /workspaces/:wid/pipeline/items/:iid
      //   POST                /workspaces/:wid/pipeline/items/import
      const wsStagesImportMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/pipeline\/stages\/import\/?$/);
      const wsItemsImportMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/pipeline\/items\/import\/?$/);
      const wsStageMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/pipeline\/stages(?:\/([^/]+))?\/?$/);
      const wsItemMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/pipeline\/items(?:\/([^/]+))?\/?$/);

      if (wsStagesImportMatch && req.method === "POST") {
        const wsId = wsStagesImportMatch[1]!;
        return cors(req, env, await handleImportStages(wsId, req, env));
      }
      if (wsItemsImportMatch && req.method === "POST") {
        const wsId = wsItemsImportMatch[1]!;
        return cors(req, env, await handleImportItems(wsId, req, env));
      }
      if (wsStageMatch) {
        const wsId = wsStageMatch[1]!;
        const sId = wsStageMatch[2];
        if (!sId && req.method === "GET")    return cors(req, env, await handleListStages(wsId, req, env));
        if (!sId && req.method === "POST")   return cors(req, env, await handleCreateStage(wsId, req, env));
        if (sId && req.method === "PATCH")   return cors(req, env, await handleUpdateStage(wsId, sId, req, env));
        if (sId && req.method === "DELETE")  return cors(req, env, await handleDeleteStage(wsId, sId, req, env));
      }
      if (wsItemMatch) {
        const wsId = wsItemMatch[1]!;
        const iId = wsItemMatch[2];
        if (!iId && req.method === "GET")    return cors(req, env, await handleListItems(wsId, req, env));
        if (!iId && req.method === "POST")   return cors(req, env, await handleCreateItem(wsId, req, env));
        if (iId && req.method === "PATCH")   return cors(req, env, await handleUpdateItem(wsId, iId, req, env));
        if (iId && req.method === "DELETE")  return cors(req, env, await handleDeleteItem(wsId, iId, req, env));
      }

      // Sales paths (R3):
      //   GET/POST              /workspaces/:wid/sales
      //   GET/PATCH/DELETE      /workspaces/:wid/sales/:sid
      //   POST                  /workspaces/:wid/sales/:sid/payments
      //   POST                  /workspaces/:wid/sales/import
      // Bulk de ítems de venta (para Reportes v2). Va antes de las rutas de
      // sales; no colisiona ('sale-items' no matchea la regex de 'sales').
      const wsSaleItemsMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/sale-items\/?$/);
      if (wsSaleItemsMatch && req.method === "GET") {
        return cors(req, env, await handleListSaleItems(wsSaleItemsMatch[1]!, req, env));
      }

      // Precios por tipo de cliente (catalog_prices). PK compuesta → ruta propia
      // (no entra en el dispatcher genérico). Va antes del loop genérico.
      const wsCatalogPricesMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/catalog-prices\/?$/);
      if (wsCatalogPricesMatch) {
        const wsId = wsCatalogPricesMatch[1]!;
        if (req.method === "GET") return cors(req, env, await handleListCatalogPrices(wsId, req, env));
        if (req.method === "PUT") return cors(req, env, await handleSetCatalogPrice(wsId, req, env));
      }
      const wsSalesImportMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/sales\/import\/?$/);
      const wsSalePaymentMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/sales\/([^/]+)\/payments\/?$/);
      const wsSaleMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/sales(?:\/([^/]+))?\/?$/);

      if (wsSalesImportMatch && req.method === "POST") {
        return cors(req, env, await handleImportSales(wsSalesImportMatch[1]!, req, env));
      }
      if (wsSalePaymentMatch && req.method === "POST") {
        return cors(req, env, await handleAddPayment(wsSalePaymentMatch[1]!, wsSalePaymentMatch[2]!, req, env));
      }
      if (wsSaleMatch) {
        const wsId = wsSaleMatch[1]!;
        const sId = wsSaleMatch[2];
        if (!sId && req.method === "GET")    return cors(req, env, await handleListSales(wsId, req, env));
        if (!sId && req.method === "POST")   return cors(req, env, await handleCreateSale(wsId, req, env));
        if (sId && req.method === "GET")     return cors(req, env, await handleGetSale(wsId, sId, req, env));
        if (sId && req.method === "PATCH")   return cors(req, env, await handleUpdateSale(wsId, sId, req, env));
        if (sId && req.method === "DELETE")  return cors(req, env, await handleDeleteSale(wsId, sId, req, env));
      }

      // T3 — Billing checkout (crea preapproval MP). Va antes del PATCH
      // workspace genérico; su path es más específico (.../billing/checkout).
      const wsBillingCheckoutMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/billing\/checkout\/?$/);
      if (wsBillingCheckoutMatch && req.method === "POST") {
        return cors(req, env, await handleBillingCheckout(wsBillingCheckoutMatch[1]!, req, env));
      }

      // Consola Clozr — canje de código (lo pega el owner del workspace).
      const wsRedeemMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/redeem-code\/?$/);
      if (wsRedeemMatch && req.method === "POST") {
        return cors(req, env, await handleRedeemCode(wsRedeemMatch[1]!, req, env));
      }

      // G/A4 — PATCH workspace (daily_goal, industry, name, etc).
      // Match exacto sin /members ni /invite etc — esos van después.
      const wsPatchMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/?$/);
      if (wsPatchMatch && req.method === "PATCH") {
        return cors(req, env, await handleUpdateWorkspace(wsPatchMatch[1]!, req, env));
      }

      // I — workspace assets (logo + banner) en R2.
      // GET /assets/{key+} es el proxy público; va PRIMERO porque su path
      // empieza distinto.
      if (url.pathname.startsWith("/assets/") && req.method === "GET") {
        const key = decodeURIComponent(url.pathname.slice("/assets/".length));
        return cors(req, env, await handleAssetProxy(key, env));
      }
      const wsLogoMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/logo\/?$/);
      const wsBannerMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/banner\/?$/);
      if (wsLogoMatch) {
        if (req.method === "POST")   return cors(req, env, await handleUploadLogo(wsLogoMatch[1]!, req, env));
        if (req.method === "DELETE") return cors(req, env, await handleDeleteLogo(wsLogoMatch[1]!, req, env));
      }
      if (wsBannerMatch) {
        if (req.method === "POST")   return cors(req, env, await handleUploadBanner(wsBannerMatch[1]!, req, env));
        if (req.method === "DELETE") return cors(req, env, await handleDeleteBanner(wsBannerMatch[1]!, req, env));
      }

      // G/A1 — assigned_task_templates
      const wsAtImportMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/assigned-task-templates\/?$/);
      const wsAtIdMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/assigned-task-templates\/([^/]+)\/?$/);
      if (wsAtImportMatch) {
        if (req.method === "GET")  return cors(req, env, await handleListAssignedTaskTemplates(wsAtImportMatch[1]!, req, env));
        if (req.method === "POST") return cors(req, env, await handleCreateAssignedTaskTemplate(wsAtImportMatch[1]!, req, env));
      }
      if (wsAtIdMatch) {
        if (req.method === "PATCH")  return cors(req, env, await handleUpdateAssignedTaskTemplate(wsAtIdMatch[1]!, wsAtIdMatch[2]!, req, env));
        if (req.method === "DELETE") return cors(req, env, await handleDeleteAssignedTaskTemplate(wsAtIdMatch[1]!, wsAtIdMatch[2]!, req, env));
      }

      // G/A2 — customer_contacts
      const wsLastContactMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/customer-contacts\/last-by-customer\/?$/);
      if (wsLastContactMatch && req.method === "GET") {
        return cors(req, env, await handleLastContactByCustomer(wsLastContactMatch[1]!, req, env));
      }
      const wsCustomerContactsMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/customers\/([^/]+)\/contacts\/?$/);
      if (wsCustomerContactsMatch) {
        if (req.method === "GET")  return cors(req, env, await handleListCustomerContacts(wsCustomerContactsMatch[1]!, wsCustomerContactsMatch[2]!, req, env));
        if (req.method === "POST") return cors(req, env, await handleCreateCustomerContact(wsCustomerContactsMatch[1]!, wsCustomerContactsMatch[2]!, req, env));
      }

      // Decrement stock atómico (C1) — DEBE ir antes del loop generic
      // porque sino /catalog/:id/decrement-stock matchearía como un
      // /catalog/:id PATCH inválido o algo raro.
      const wsDecrementStockMatch = url.pathname.match(
        /^\/workspaces\/([^/]+)\/catalog\/([^/]+)\/decrement-stock\/?$/,
      );
      if (wsDecrementStockMatch && req.method === "POST") {
        return cors(req, env, await handleDecrementStock(
          wsDecrementStockMatch[1]!, wsDecrementStockMatch[2]!, req, env,
        ));
      }

      // R6 — Sesiones de caja (open/close/list). DEBE ir antes del loop generic
      // (no hay spec 'cash-sessions', pero registramos explícito por claridad).
      const wsCashOpenMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/cash-sessions\/open\/?$/);
      if (wsCashOpenMatch && req.method === "POST") {
        return cors(req, env, await handleOpenCashSession(wsCashOpenMatch[1]!, req, env));
      }
      const wsCashCloseMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/cash-sessions\/([^/]+)\/close\/?$/);
      if (wsCashCloseMatch && req.method === "POST") {
        return cors(req, env, await handleCloseCashSession(wsCashCloseMatch[1]!, wsCashCloseMatch[2]!, req, env));
      }
      const wsCashSessionsMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/cash-sessions\/?$/);
      if (wsCashSessionsMatch && req.method === "GET") {
        return cors(req, env, await handleListCashSessions(wsCashSessionsMatch[1]!, req, env));
      }

      // Simple tables (R4+R5) — usan generic dispatcher.
      //   tasks, cash, followups, catalog, payment-methods, customer-types, customer-tags
      //   GET/POST       /workspaces/:wid/<table>
      //   PATCH/DELETE   /workspaces/:wid/<table>/:id
      //   POST           /workspaces/:wid/<table>/import
      //
      // CACHE: para tablas casi-estáticas (payment-methods, customer-types,
      // customer-tags), agregamos Cache-Control para que CF las cachee
      // en el edge 30s. Reduce ~95% del tráfico de polling sobre esas
      // tablas (tienen ~0 mutations por hora pero los miembros pollean
      // cada 5s).
      const CACHEABLE_FOR_30S = new Set(["payment-methods", "customer-types", "customer-tags"]);
      for (const [seg, spec] of Object.entries(SIMPLE_TABLE_SPECS)) {
        const importMatch = url.pathname.match(new RegExp(`^/workspaces/([^/]+)/${seg}/import/?$`));
        const recMatch = url.pathname.match(new RegExp(`^/workspaces/([^/]+)/${seg}(?:/([^/]+))?/?$`));
        if (importMatch && req.method === "POST") {
          return cors(req, env, await handleGenericImport(spec, importMatch[1]!, req, env));
        }
        if (recMatch) {
          const wsId = recMatch[1]!;
          const rId = recMatch[2];
          if (!rId && req.method === "GET") {
            const res = await handleGenericList(spec, wsId, req, env);
            // Headers de cache para tablas estables. El frontend tiene
            // polling 5s pero el edge sirve el cached para 30s — el cliente
            // ni siquiera nota la diferencia (los datos no cambian más
            // rápido que eso en config tables).
            if (CACHEABLE_FOR_30S.has(seg)) {
              const headers = new Headers(res.headers);
              headers.set("cache-control", "private, max-age=30");
              return cors(req, env, new Response(res.body, { status: res.status, headers }));
            }
            return cors(req, env, res);
          }
          if (!rId && req.method === "POST")   return cors(req, env, await handleGenericCreate(spec, wsId, req, env));
          if (rId && req.method === "PATCH")   return cors(req, env, await handleGenericUpdate(spec, wsId, rId, req, env));
          if (rId && req.method === "DELETE")  return cors(req, env, await handleGenericDelete(spec, wsId, rId, req, env));
        }
      }

      // access-code va ANTES que /members/:mid porque su path es más
      // específico (/members/:mid/access-code matches both regex).
      if (wsAccessCodeMatch && req.method === "POST") {
        const wsId = wsAccessCodeMatch[1]!;
        const mId = wsAccessCodeMatch[2]!;
        return cors(req, env, await handleIssueAccessCode(wsId, mId, req, env));
      }
      if (wsMembersMatch) {
        const wsId = wsMembersMatch[1]!;
        const mId = wsMembersMatch[2];
        if (!mId && req.method === "GET") {
          return cors(req, env, await handleListMembers(wsId, req, env));
        }
        if (mId && req.method === "PATCH") {
          return cors(req, env, await handlePatchMember(wsId, mId, req, env));
        }
        if (mId && req.method === "DELETE") {
          return cors(req, env, await handleRevokeMember(wsId, mId, req, env));
        }
      }
      if (wsInviteMatch && req.method === "POST") {
        const wsId = wsInviteMatch[1]!;
        return cors(req, env, await handleInviteMember(wsId, req, env));
      }

      switch (route) {
        case "GET /":
          return cors(req, env, json({ ok: true, service: "clozr-auth", version: "0.1.0" }));

        case "POST /auth/request":
          return cors(req, env, await handleAuthRequest(req, env));

        case "POST /auth/verify-code":
          return cors(req, env, await handleAuthVerifyCode(req, env));

        case "GET /auth/verify":
          // No CORS: este endpoint lo abre el USUARIO desde su email,
          // navega directo, no es una request cross-origin del app.
          return handleAuthVerify(req, env);

        // Google OAuth — navegaciones del browser (302), sin CORS.
        case "GET /auth/google/start":
          return handleGoogleStart(req, env);

        case "GET /auth/google/callback":
          return handleGoogleCallback(req, env);

        // T3 — Webhook de Mercado Pago. Público (sin auth de sesión): MP lo
        // llama server-to-server. La firma se valida dentro del handler.
        case "POST /billing/webhook":
          return cors(req, env, await handleBillingWebhook(req, env));

        case "GET /me":
          return cors(req, env, await handleMe(req, env));

        case "PATCH /me":
          return cors(req, env, await handleUpdateMe(req, env));

        case "POST /workspaces":
          return cors(req, env, await handleCreateWorkspace(req, env));

        default:
          return cors(req, env, json({ error: "not_found", route }, 404));
      }
    } catch (err) {
      // Nunca devolver stack traces. Log a tail solo.
      console.error("[worker] uncaught", err);
      return cors(req, env, json({ error: "internal" }, 500));
    }
  },
};

/* ── helpers ─────────────────────────────────────────────────────────── */

/**
 * Rate limiter token-bucket simplificado. Estado en memoria del isolate
 * (Map<key, {count, resetAt}>) — CF puede tener 1+ isolates simultáneos
 * por región, así que el límite efectivo es N_isolates * limit. Para
 * nuestro use-case (defensa contra abuse accidental + spam de retries)
 * es suficiente. Si en el futuro necesitamos un cap más estricto,
 * migramos a Durable Object o KV.
 *
 * Cleanup: si el Map crece sin límite, lo reseteamos cuando llega a
 * 5000 entries. En la práctica nunca llega — la auth la usan ~5 personas.
 */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRate(req: Request, key: string, limit: number, windowMs: number): boolean {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    if (rateBuckets.size > 5000) {
      // GC paranoia — borramos los expirados de un saque.
      for (const [k, v] of rateBuckets) {
        if (v.resetAt < now) rateBuckets.delete(k);
      }
    }
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

/**
 * matchPath — pattern matcher con `:param` syntax para routes nuevas (C4).
 * Reemplaza el patrón `url.pathname.match(/regex/)` por algo declarativo.
 *
 * Uso:
 *   const m = matchPath("/workspaces/:wid/catalog/:id/decrement-stock", url.pathname);
 *   if (m) { const { wid, id } = m; ... }
 *
 * El refactor de las ~30 rutas existentes a este helper queda como
 * trabajo incremental — cuando se modifica/agrega una ruta, se adopta.
 * No migramos todas de golpe porque las regex actuales son seguras y
 * un refactor masivo es riesgoso para 0 ganancia funcional.
 */
function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  // Convertimos "/workspaces/:wid/sales/:sid" → regex
  // "^/workspaces/([^/]+)/sales/([^/]+)/?$" y guardamos los nombres.
  const paramNames: string[] = [];
  const re = pattern.replace(/:([a-zA-Z_]+)/g, (_, name: string) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  const match = pathname.match(new RegExp(`^${re}/?$`));
  if (!match) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < paramNames.length; i++) {
    const v = match[i + 1];
    if (v) params[paramNames[i]!] = v;
  }
  return params;
}
void matchPath; // export-less; usable from este file. TS no warning.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * CORS abierto para los endpoints de auth.
 *
 * Razonamiento: estos endpoints son intencionalmente públicos
 *   - POST /auth/request: pide un email; manda magic link. Si un sitio
 *     malicioso lo invoca, lo único que logra es mandarle un email al
 *     dueño legítimo de ese email — no se filtra info, no hay efecto
 *     sobre el receptor a menos que CLICKEE el link.
 *   - POST /auth/verify-code: pide email + código. El código está SOLO
 *     en el email del user — un attacker tendría que tener acceso al
 *     email para guessearlo. Si lo tiene, ya ganó.
 *   - GET /: health.
 *
 * No usamos `*` con credentials (browser lo rechaza), pero como NO
 * mandamos cookies, no necesitamos credentials. Reflejamos el origin
 * que venga (incluyendo "null" cuando algunos Tauri/WebView mandan eso).
 *
 * Antes lista de origins explícita (tauri://localhost, https://tauri.localhost,
 * http://localhost:1420) pero Tauri 2 Windows usa "http://tauri.localhost"
 * con el slash final y a veces "null" — la lista era frágil y rompía
 * con "Failed to fetch" desde el WebView2.
 */
function cors(req: Request, env: Env, res: Response): Response {
  // env.ALLOWED_ORIGINS queda para diagnostico; ya no lo usamos en runtime.
  void env;
  const origin = req.headers.get("origin");
  const headers = new Headers(res.headers);
  headers.set("access-control-allow-origin", origin ?? "*");
  headers.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin");
  return new Response(res.body, { status: res.status, headers });
}
