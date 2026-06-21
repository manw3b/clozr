/**
 * Schema mínimo para Fase 1 (auth).
 *
 * Filosofía: CREATE TABLE IF NOT EXISTS — idempotente. Lo corremos
 * lazy (dedup en memoria del Worker) en cada cold start. SQLite acepta
 * estas DDL en milisegundos así que el costo es despreciable.
 *
 * Para ALTER TABLE ADD COLUMN no hay IF NOT EXISTS en SQLite, así que
 * los envolvemos en try/catch que ignora "duplicate column". Mismo patrón
 * que el `safe()` del frontend (src/lib/db/ensureSchema.ts).
 *
 * Cuando F2 necesite muchas migraciones, pasamos a un sistema versionado.
 */

import { tursoQuery, tursoFirst, type Env } from "./turso";

let initPromise: Promise<void> | null = null;

/**
 * D2: además del dedup in-memory por isolate (initPromise), agregamos
 * un version-check rápido contra una mini-tabla `schema_meta`. Si el
 * número de versión coincide con SCHEMA_VERSION (constante hardcoded
 * que bump cuando agregamos DDL), skipeamos las ~50 statements.
 *
 * Resultado por cold start: 1 SELECT contra schema_meta vs 50 DDL antes.
 * Cuando bump SCHEMA_VERSION, el próximo cold start corre todo de
 * nuevo (idempotente) y actualiza el version row.
 *
 * Bump cuando agregues un CREATE TABLE / ALTER TABLE / safeAddColumn.
 */
// NOTA: la Consola (migración 014) NO bumpea esta versión a propósito. Bumpear
// fuerza a TODOS los cold-starts a re-correr applySchema completo — justo lo que
// rompió prod en el intento "v12" anterior. En cambio, las tablas de la Consola
// se crean de forma lazy y auto-curativa vía ensureConsoleSchema(), que llaman
// los handlers /console/* y el canje. Para una DB fresca, el bloque 014 dentro
// de applySchema igual las crea. Sólo bumpear si agregás una migración que el
// resto del backend necesite leer en frío.
const SCHEMA_VERSION = 11;

export function ensureSchema(env: Env): Promise<void> {
  if (!initPromise) {
    initPromise = applySchemaIfNeeded(env).catch((e) => {
      // Si la migración falla, NO cacheamos el rechazo: lo reseteamos para que
      // la próxima request reintente, en vez de dejar el isolate "envenenado"
      // devolviendo 500 a todo hasta que Cloudflare lo recicle.
      initPromise = null;
      throw e;
    });
  }
  return initPromise;
}

async function applySchemaIfNeeded(env: Env): Promise<void> {
  // Mini-tabla con UNA fila (key='current') que guarda la versión aplicada.
  // CREATE IF NOT EXISTS — primera vez en la DB la crea, después es no-op.
  try {
    await tursoQuery(env, {
      sql: `CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    });
    const row = await tursoFirst(
      env,
      `SELECT version FROM schema_meta WHERE key = 'current'`,
    );
    if (row && Number(row.version) >= SCHEMA_VERSION) return;
  } catch (e) {
    // Si falla el check, caemos al applySchema completo — idempotente,
    // no rompemos nada. Loggeamos para tail diagnóstico.
    console.warn("[schema] version-check failed, falling back to full apply:", e);
  }

  await applySchema(env);

  // Marcar versión aplicada. UPSERT con ON CONFLICT.
  try {
    await tursoQuery(env, {
      sql: `INSERT INTO schema_meta (key, version, applied_at)
              VALUES ('current', ?, datetime('now'))
              ON CONFLICT(key) DO UPDATE SET
                version = excluded.version,
                applied_at = excluded.applied_at`,
      args: [SCHEMA_VERSION],
    });
  } catch (e) {
    console.warn("[schema] failed to persist schema_meta version:", e);
  }
}

async function applySchema(env: Env): Promise<void> {
  // ── DDL idempotente (CREATE IF NOT EXISTS) ─────────────────────────
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS magic_links (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        device_label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
    },
  );

  // ── Migraciones aditivas (no-idempotentes; ignoramos "duplicate") ──
  //
  // 001 — agregar code (6 dígitos) a magic_links. Permite que el user
  // abra el email en su celular y escriba el código en la PC sin quemar
  // el token. Si ya existe la columna, ignore.
  await safeAddColumn(env, "magic_links", "code", "TEXT");

  // 002 — agregar columnas faltantes a catalog_items para parity con el
  // local. Necesario para que la migración de catalogDb funcione
  // completa (R5 extended).
  await safeAddColumn(env, "catalog_items", "track_stock", "INTEGER DEFAULT 0");
  await safeAddColumn(env, "catalog_items", "stock", "INTEGER DEFAULT 0");
  await safeAddColumn(env, "catalog_items", "stock_min", "INTEGER DEFAULT 0");
  await safeAddColumn(env, "catalog_items", "active", "INTEGER DEFAULT 1");
  await safeAddColumn(env, "catalog_items", "sort_order", "INTEGER DEFAULT 0");
  await safeAddColumn(env, "catalog_items", "image_path", "TEXT");
  await safeAddColumn(env, "catalog_items", "condition", "TEXT DEFAULT 'new'");
  await safeAddColumn(env, "catalog_items", "condition_details_json", "TEXT");
  await safeAddColumn(env, "catalog_items", "custom_fields_json", "TEXT");
  await safeAddColumn(env, "catalog_items", "cost_usd", "REAL DEFAULT 0");
  // Index por (email, code) para que el lookup en verify-code sea rápido.
  // Es CREATE INDEX IF NOT EXISTS así que es idempotente sin try/catch.
  await tursoQuery(env, {
    sql: `CREATE INDEX IF NOT EXISTS idx_magic_links_email_code ON magic_links(email, code)`,
  });

  // 003 (F) — schema silencioso de monetización + multi-rubro.
  // Ver docs/ROADMAP.md para el modelo completo. Hoy son columnas vacías
  // — el paywall todavía no está activo. Pre-cableamos para que cuando
  // lance Stripe el migrate sea instantáneo.
  await safeAddColumn(env, "cloud_workspaces", "industry", "TEXT DEFAULT 'generic'");
  await safeAddColumn(env, "users", "plan", "TEXT DEFAULT 'free'");
  // owned_industries: array de slugs en JSON. SQLite no tiene array nativo
  // así que serializamos. Lookup vía json_each() o split client-side.
  // Default '[]' string para evitar nulls confusos en el frontend.
  await safeAddColumn(env, "users", "owned_industries_json", "TEXT DEFAULT '[]'");

  // 004 (G/A4) — daily goal del workspace en cloud. Antes vivía solo en
  // local. Ahora cuando el owner setea "vender USD 5000/día", Caro lo
  // ve en su Mi Día también.
  await safeAddColumn(env, "cloud_workspaces", "daily_goal", "REAL DEFAULT 0");
  await safeAddColumn(env, "cloud_workspaces", "daily_goal_currency", "TEXT DEFAULT 'USD'");
  await safeAddColumn(env, "cloud_workspaces", "daily_goal_count", "INTEGER DEFAULT 0");

  // 005 (G/A1) — assigned_task_templates en cloud. Tabla espejo del local.
  await tursoQuery(env, {
    sql: `CREATE TABLE IF NOT EXISTS assigned_task_templates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
      title TEXT NOT NULL,
      description TEXT,
      frequency TEXT NOT NULL DEFAULT 'daily',
      target_time TEXT,
      target_count INTEGER,
      assigned_to_user_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )`,
  });
  await tursoQuery(env, {
    sql: `CREATE INDEX IF NOT EXISTS idx_assigned_task_templates_ws
      ON assigned_task_templates(workspace_id, deleted_at)`,
  });

  // 006 (G/A2) — customer_contacts en cloud. Tabla del log de interacciones
  // con cada cliente (llamada, WhatsApp, visita, etc). Sin esto, "días sin
  // contacto" diverge entre PCs y un cliente puede ser llamado 2 veces.
  await tursoQuery(env, {
    sql: `CREATE TABLE IF NOT EXISTS customer_contacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
      customer_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      notes TEXT,
      contacted_by TEXT,
      contacted_by_name TEXT,
      contacted_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  });
  await tursoQuery(env, {
    sql: `CREATE INDEX IF NOT EXISTS idx_customer_contacts_ws_customer
      ON customer_contacts(workspace_id, customer_id, contacted_at DESC)`,
  });

  // 007 (I) — logo y banner del workspace en cloud. Apuntan a objects R2:
  // formato del valor = "workspaces/{wid}/logo.{ext}" o "workspaces/{wid}/banner.{ext}".
  // El worker sirve el archivo via GET /assets/{key} (proxy desde el R2
  // bucket, con cache-control). Compartido entre todo el equipo.
  await safeAddColumn(env, "cloud_workspaces", "logo_key", "TEXT");
  await safeAddColumn(env, "cloud_workspaces", "banner_key", "TEXT");

  // ── F2.1: Workspaces multi-tenant + memberships ───────────────────
  //
  // cloud_workspaces: el "negocio" en la nube. Cada uno tiene un owner.
  // El nombre "cloud_" es para no chocar con la tabla local `workspaces`
  // del SQLite si en algún momento las cruzamos para debugging.
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS cloud_workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_cloud_workspaces_owner ON cloud_workspaces(owner_user_id)`,
    },
    // memberships: linkea un user (o email pre-registrado) a un workspace
    // con un rol y status.
    //
    // user_id NULLABLE — cuando invitás un email que todavía no es user,
    // queda guardado con user_id=NULL y email=<el invitado>. Al hacer
    // login esa persona, su email matchea y completamos user_id +
    // status='active'. Mientras tanto status='invited'.
    //
    // role values: 'owner' | 'admin' | 'vendedor' | 'viewer' — mismo
    // enum que el authStore local. NO usamos CHECK constraint para que
    // futuros roles (ej: 'contador') no requieran migration.
    //
    // status values: 'invited' | 'active' | 'revoked'. 'revoked' es soft-
    // delete: lo mantenemos en DB para auditoría pero no cuenta para
    // permission checks ni listings.
    {
      sql: `CREATE TABLE IF NOT EXISTS memberships (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        user_id TEXT REFERENCES users(id),
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'invited',
        invited_at TEXT NOT NULL DEFAULT (datetime('now')),
        invited_by_user_id TEXT REFERENCES users(id),
        accepted_at TEXT,
        revoked_at TEXT
      )`,
    },
    // Lookups críticos:
    //   - GET /me: SELECT por user_id (con activación on-the-fly via email)
    //   - invite: chequear que no haya membership duplicada para (workspace, email)
    //   - members listing: SELECT por workspace_id
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, status)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id, status)`,
    },
    // Unique parcial: dentro de un workspace, un email no puede tener
    // dos memberships ACTIVAS. SQLite soporta UNIQUE con WHERE.
    {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_workspace_email_active
            ON memberships(workspace_id, email)
            WHERE status != 'revoked'`,
    },
  );

  // ── F2-B R1: Customers compartidos ────────────────────────────────
  //
  // Espejo del schema local de SQLite (src/lib/db/ensureSchema.ts).
  // Decisiones:
  //   - id: el MISMO UUID que el local. Bootstrap migration sube cada
  //     customer con su id existente; si ya existe (re-run), INSERT OR
  //     IGNORE no duplica. Esto evita un mapping table local↔cloud.
  //   - workspace_id: FK a cloud_workspaces (el cloud workspace, no el
  //     local SQLite workspace).
  //   - created_by: cloud user_id (no el string "owner" del local).
  //   - deleted_at: soft-delete. Las queries activas filtran IS NULL.
  //   - NO incluímos total_sales — es computed sobre sales.
  //   - Campos de redes sociales y avatar_path los traemos también.
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        type TEXT DEFAULT 'final',
        status TEXT DEFAULT 'potencial',
        pricing_policy_json TEXT,
        barrio TEXT,
        address TEXT,
        notes TEXT,
        avatar_path TEXT,
        instagram TEXT,
        facebook TEXT,
        tiktok TEXT,
        twitter TEXT,
        created_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    // Lookup principal: SELECT de customers activos del workspace.
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_customers_workspace
            ON customers(workspace_id, deleted_at)`,
    },
    // Búsqueda por nombre (LIKE) en lista — un index sobre name nos
    // ayuda con prefijos comunes; LIKE wildcard inicial no aprovecha
    // pero al menos para "lookup por nombre exacto" funciona.
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_customers_workspace_name
            ON customers(workspace_id, name)`,
    },
  );

  // ── F2-B R2: Pipeline compartido ──────────────────────────────────
  //
  // pipeline_stages: las columnas del kanban (Prospecto, Contactado,
  // Cobrado, etc). Configurables por workspace.
  //
  // pipeline_items: los leads. customer_id NO tiene FK estricta porque
  // a veces el customer puede no estar aún en el cloud (caso edge);
  // pero en la práctica el frontend se asegura de crear customer antes
  // de crear lead.
  //
  // Mismo patrón que customers: id igual al local, workspace_id apunta
  // al cloud_workspaces, soft-delete via deleted_at.
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS pipeline_stages (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        name TEXT NOT NULL,
        stage_order INTEGER NOT NULL DEFAULT 0,
        color TEXT DEFAULT 'gray',
        is_won INTEGER NOT NULL DEFAULT 0,
        is_lost INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_pipeline_stages_workspace
            ON pipeline_stages(workspace_id, deleted_at, stage_order)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS pipeline_items (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        customer_id TEXT NOT NULL,
        customer_name TEXT,
        stage_id TEXT NOT NULL,
        stage_name TEXT NOT NULL,
        stage_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        estimated_value REAL,
        currency TEXT DEFAULT 'ARS',
        product TEXT,
        priority TEXT,
        position INTEGER,
        next_action_at TEXT,
        next_action_label TEXT,
        owner_id TEXT,
        owner_name TEXT,
        short_note TEXT,
        lead_source TEXT,
        catalog_item_id TEXT,
        wholesale_code TEXT,
        visit_at TEXT,
        inactive_days INTEGER DEFAULT 0,
        closed_at TEXT,
        created_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_pipeline_items_workspace
            ON pipeline_items(workspace_id, deleted_at, stage_order)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_pipeline_items_customer
            ON pipeline_items(workspace_id, customer_id, deleted_at)`,
    },
  );

  // ── F2-B R3: Ventas + items + pagos ──────────────────────────────
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        customer_id TEXT,
        customer_name TEXT,
        seller_id TEXT,
        seller_name TEXT,
        subtotal REAL DEFAULT 0,
        total REAL DEFAULT 0,
        total_paid REAL DEFAULT 0,
        balance REAL DEFAULT 0,
        is_paid INTEGER DEFAULT 0,
        payment_method TEXT,
        notes TEXT,
        out_of_stock_sale INTEGER DEFAULT 0,
        regularized_at TEXT,
        regularized_by TEXT,
        sale_date TEXT,
        created_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_sales_workspace
            ON sales(workspace_id, deleted_at, sale_date)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_sales_customer
            ON sales(workspace_id, customer_id, deleted_at)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id),
        catalog_item_id TEXT,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL,
        base_price REAL,
        subtotal REAL NOT NULL,
        imei TEXT,
        from_stock INTEGER DEFAULT 0
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS sale_payments (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id),
        method TEXT NOT NULL,
        currency TEXT DEFAULT 'ARS',
        amount REAL NOT NULL,
        is_deposit INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id)`,
    },
  );

  // 008 — snapshot del costo unitario al momento de la venta. Antes Reportes
  // re-joinea el costo ACTUAL del catálogo, así que editar el costo de un
  // producto reescribía el margen histórico. Persistiendo unit_cost por ítem,
  // el margen de cada venta queda congelado. Ventas viejas quedan en 0 → el
  // cliente cae al join del catálogo como fallback (back-compat, sin backfill).
  await safeAddColumn(env, "sale_items", "unit_cost", "REAL DEFAULT 0");

  // 009 — precios por tipo de cliente. Cada producto del catálogo puede tener
  // un precio sugerido distinto por tipo de cliente (final/revendedor/
  // mayorista/empresa). En ARS (la web es ARS-only). Sin fila = sin precio
  // especial para ese tipo → la venta cae al precio base del catálogo.
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS catalog_prices (
        workspace_id TEXT NOT NULL,
        catalog_item_id TEXT NOT NULL,
        customer_type TEXT NOT NULL,
        price REAL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (catalog_item_id, customer_type)
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_catalog_prices_ws ON catalog_prices(workspace_id)`,
    },
  );

  // 010 — dedupe de payment_methods + índice único parcial. El seed del
  // desktop sembraba los métodos default con un UUID nuevo por fila desde
  // varios lugares a la vez (sin uniqueness), así que se duplicaron 2-3x y se
  // sincronizaron a la nube. Las ventas referencian el método por NOMBRE (no
  // por id), así que soft-deletear los duplicados es seguro. Orden importa:
  // primero limpiar, después crear el índice único (si no, el CREATE falla).
  await tursoQuery(
    env,
    {
      // Conservar una fila por (workspace_id, name); soft-delete del resto.
      sql: `UPDATE payment_methods
              SET deleted_at = datetime('now')
              WHERE deleted_at IS NULL
                AND id NOT IN (
                  SELECT MIN(id) FROM payment_methods
                    WHERE deleted_at IS NULL
                    GROUP BY workspace_id, name
                )`,
    },
    {
      // Único parcial: evita que se vuelvan a duplicar (INSERT OR IGNORE del
      // import desktop ahora es idempotente por nombre).
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_uniq
              ON payment_methods(workspace_id, name) WHERE deleted_at IS NULL`,
    },
  );

  // ── F2-B R4: Tareas + cash_movements + followups ─────────────────
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        type TEXT DEFAULT 'rutina',
        frequency TEXT,
        title TEXT NOT NULL,
        notes TEXT,
        due_at TEXT,
        completed INTEGER DEFAULT 0,
        completed_at TEXT,
        completed_by TEXT,
        assigned_to TEXT,
        customer_id TEXT,
        template_id TEXT,
        target_count INTEGER,
        progress INTEGER DEFAULT 0,
        created_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_tasks_workspace
            ON tasks(workspace_id, deleted_at, completed)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS cash_movements (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        kind TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'ARS',
        description TEXT,
        category TEXT,
        sale_id TEXT,
        customer_name TEXT,
        payment_method TEXT,
        moved_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_cash_movements_workspace
            ON cash_movements(workspace_id, deleted_at, moved_at)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS followups (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        business_id TEXT,
        customer_id TEXT NOT NULL,
        customer_name TEXT,
        reason TEXT,
        text TEXT NOT NULL,
        due_at TEXT NOT NULL,
        days_since_contact INTEGER,
        amount REAL,
        notes TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_followups_workspace
            ON followups(workspace_id, deleted_at, due_at)`,
    },
  );

  // ── R6: Sesiones de caja (apertura/cierre diario + arqueo) ────────
  //
  // Una sesión por día por workspace (UNIQUE parcial sobre las no-borradas).
  // Guarda los saldos de APERTURA y de CIERRE (arqueo físico contado) por
  // moneda. El "esperado" y la diferencia los calcula la UI a partir de los
  // cash_movements del día — acá sólo persistimos los balances.
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS cash_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        session_date TEXT NOT NULL,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        opened_balance_ars REAL NOT NULL DEFAULT 0,
        opened_balance_usd REAL NOT NULL DEFAULT 0,
        opened_by TEXT REFERENCES users(id),
        closed_at TEXT,
        closed_balance_ars REAL,
        closed_balance_usd REAL,
        closed_by TEXT REFERENCES users(id),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_ws_date
            ON cash_sessions(workspace_id, session_date)
            WHERE deleted_at IS NULL`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_cash_sessions_ws
            ON cash_sessions(workspace_id, deleted_at, session_date)`,
    },
  );

  // ── F2-B R5: Catálogo + payment_methods + customer_types/tags ────
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS catalog_items (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        name TEXT NOT NULL,
        category TEXT,
        subcategory TEXT,
        price REAL,
        currency TEXT DEFAULT 'ARS',
        cost REAL,
        sku TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_catalog_items_workspace
            ON catalog_items(workspace_id, deleted_at, category)`,
    },
    // catalog_imei (espejo del local) — IMEIs individuales asignados
    // a sales. Si una venta usa from_stock, sus IMEIs se marcan acá.
    {
      sql: `CREATE TABLE IF NOT EXISTS catalog_imei (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        catalog_item_id TEXT NOT NULL,
        imei TEXT NOT NULL,
        sold_at TEXT,
        sale_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_catalog_imei_workspace
            ON catalog_imei(workspace_id, catalog_item_id, sold_at)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS payment_methods (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        currency TEXT DEFAULT 'ARS',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_payment_methods_workspace
            ON payment_methods(workspace_id, deleted_at, sort_order)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS customer_types (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_customer_types_workspace
            ON customer_types(workspace_id, deleted_at)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS customer_tags (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        name TEXT NOT NULL,
        color TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_customer_tags_workspace
            ON customer_tags(workspace_id, deleted_at)`,
    },
  );

  // ── 011 (plan equipos T2) — owner_id: el vendedor ve solo lo suyo ──
  //
  // El vendedor solo ve/edita los registros que le pertenecen; owner/admin
  // ven todo el workspace. Agregamos owner_id a las 3 tablas de datos
  // operativos por-dueño (customers, sales, pipeline_items) y filtramos por
  // él en los handlers cuando el rol es 'vendedor'. Caja, stages, catálogo,
  // tareas y demás quedan COMPARTIDOS (no se scopean por dueño).
  //
  // pipeline_items YA tiene owner_id (era el "dueño/vendedor asignado" del
  // lead) — safeAddColumn skipea el duplicate y reusamos esa columna como
  // campo de alcance. customers/sales no lo tenían (usaban created_by).
  await safeAddColumn(env, "customers", "owner_id", "TEXT");
  await safeAddColumn(env, "sales", "owner_id", "TEXT");
  await safeAddColumn(env, "pipeline_items", "owner_id", "TEXT");

  // Backfill: los registros viejos sin dueño quedan asignados al owner del
  // workspace (managers ven todo igual, así que no cambia su vista; pero deja
  // los datos históricos con un dueño concreto en vez de NULL). Idempotente:
  // solo toca filas con owner_id NULL. NO-fatal: si algo falla acá, logueamos
  // pero no rompemos ensureSchema — las columnas ya están agregadas y los
  // handlers funcionan; el backfill y los índices son optimizaciones.
  try {
  await tursoQuery(
    env,
    {
      sql: `UPDATE customers SET owner_id = (
              SELECT user_id FROM memberships
                WHERE workspace_id = customers.workspace_id
                  AND role = 'owner' AND status = 'active' AND user_id IS NOT NULL
                LIMIT 1)
            WHERE owner_id IS NULL`,
    },
    {
      sql: `UPDATE sales SET owner_id = (
              SELECT user_id FROM memberships
                WHERE workspace_id = sales.workspace_id
                  AND role = 'owner' AND status = 'active' AND user_id IS NOT NULL
                LIMIT 1)
            WHERE owner_id IS NULL`,
    },
    {
      sql: `UPDATE pipeline_items SET owner_id = (
              SELECT user_id FROM memberships
                WHERE workspace_id = pipeline_items.workspace_id
                  AND role = 'owner' AND status = 'active' AND user_id IS NOT NULL
                LIMIT 1)
            WHERE owner_id IS NULL`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_customers_owner
            ON customers(workspace_id, owner_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_sales_owner
            ON sales(workspace_id, owner_id)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_pipeline_items_owner
            ON pipeline_items(workspace_id, owner_id)`,
    },
  );
  } catch (e) {
    console.error("[schema] backfill/índices owner_id fallaron (no-fatal):", e);
  }

  // ── 012 (plan equipos T3) — billing Mercado Pago + asientos ────────
  //
  // Estado de suscripción del workspace. Free = 1 asiento (invitar equipo es
  // pago). El webhook de MP es la única fuente que escribe estas columnas
  // tras un cobro/cancelación; el resto del backend solo las lee (seat-gate
  // en invite, exposición en /me).
  //   plan        : 'free' | 'pro' | 'team'
  //   seats       : asientos permitidos (free=1, pro=3, team=9999 ~ ilimitado)
  //   plan_status : 'active' | 'trialing' | 'past_due' | 'cancelled'
  //   mp_preapproval_id : id de la suscripción (preapproval) en Mercado Pago
  //
  // OJO: sin NOT NULL en el ALTER. SQLite/libSQL puede rechazar
  // `ADD COLUMN ... NOT NULL DEFAULT ...` sobre una tabla con filas; el resto
  // del schema agrega columnas siempre con DEFAULT a secas. Los defaults
  // cubren el valor inicial y el código lee con `?? 'free'` / `?? 1`.
  await safeAddColumn(env, "cloud_workspaces", "plan", "TEXT DEFAULT 'free'");
  await safeAddColumn(env, "cloud_workspaces", "seats", "INTEGER DEFAULT 1");
  await safeAddColumn(env, "cloud_workspaces", "plan_status", "TEXT DEFAULT 'active'");
  await safeAddColumn(env, "cloud_workspaces", "mp_preapproval_id", "TEXT");

  // ── 013 (plan equipos T3) — timestamp del cambio de estado de billing ──
  //
  // Marca CUÁNDO el workspace entró en 'cancelled'/'past_due'. El cron de
  // degradación (cron/planDowngrade.ts) cuenta los días de gracia desde acá —
  // no desde updated_at, que cambia por cualquier edición (logo, nombre, meta).
  // El webhook lo setea sólo en la transición a un estado no-activo y lo limpia
  // (NULL) al reactivar. NULL ⇒ sin degradación pendiente.
  await safeAddColumn(env, "cloud_workspaces", "plan_status_changed_at", "TEXT");

  // ── 014 (Consola Clozr — Fase 1) — códigos de licencia/descuento ───────
  //
  // Tablas para la Consola super-admin: códigos canjeables (licencia o
  // descuento) + log de canjes. La columna `license_expires_at` marca hasta
  // cuándo un workspace tiene un plan activado por licencia gratuita; el cron
  // de degradación lo baja a Free cuando vence (sin pisar suscripciones MP,
  // que tienen mp_preapproval_id != NULL).
  //
  // NO-FATAL: todo el bloque va en try/catch. Si algo de acá falla, NO debe
  // tumbar ensureSchema (lección del break v12 en prod) — los handlers de la
  // Consola se auto-curan llamando a ensureConsoleSchema(), que reintenta de
  // forma idempotente (CREATE IF NOT EXISTS + safeAddColumn).
  try {
    await ensureConsoleSchema(env);
  } catch (e) {
    console.error("[schema] migración 014 (consola) falló (no-fatal):", e);
  }
}

/**
 * DDL de la Consola (Fase 1). Idempotente (CREATE IF NOT EXISTS). Se aplica
 * tanto en el applySchema global como, defensivamente, al entrar a cualquier
 * handler de la Consola — así la disponibilidad de la Consola no depende de
 * que la migración global haya corrido sin error.
 *
 * console_codes.kind:
 *   'license'  → activa plan (pro/team) gratis en un workspace, con expiry.
 *   'discount' → % o monto fijo; se canjea y queda registrado (la aplicación
 *                al checkout MP es de una fase posterior).
 */
const CONSOLE_DDL: ReadonlyArray<{ sql: string }> = [
  {
    sql: `CREATE TABLE IF NOT EXISTS console_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,                 -- 'license' | 'discount'
      -- licencia:
      plan TEXT,                          -- 'pro' | 'team'
      duration_days INTEGER,              -- vigencia desde el canje (NULL = usa expires_at)
      -- descuento:
      discount_type TEXT,                 -- 'percent' | 'amount'
      discount_value INTEGER,             -- % (1-100) o monto ARS
      -- comunes:
      max_uses INTEGER,                   -- NULL = ilimitado
      uses INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,                    -- el código no se puede canjear pasada esta fecha
      note TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      disabled_at TEXT
    )`,
  },
  { sql: `CREATE INDEX IF NOT EXISTS idx_console_codes_kind ON console_codes(kind, disabled_at)` },
  {
    sql: `CREATE TABLE IF NOT EXISTS console_code_redemptions (
      id TEXT PRIMARY KEY,
      code_id TEXT NOT NULL,
      code TEXT NOT NULL,
      kind TEXT NOT NULL,
      workspace_id TEXT,
      user_id TEXT,
      redeemed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  { sql: `CREATE INDEX IF NOT EXISTS idx_console_redemptions_code ON console_code_redemptions(code_id)` },
];

let consoleSchemaReady = false;

/**
 * Garantiza las tablas de la Consola. Memoizado por isolate; reintenta si
 * falló (deja consoleSchemaReady en false). Lo llaman los handlers de la
 * Consola (y el applySchema global) — barato e idempotente.
 */
export async function ensureConsoleSchema(env: Env): Promise<void> {
  if (consoleSchemaReady) return;
  await tursoQuery(env, ...CONSOLE_DDL);
  // Columna en cloud_workspaces: hasta cuándo vale un plan activado por
  // licencia gratuita. La agregamos acá (no solo en applySchema) para que el
  // handler de canje la tenga garantizada aunque la migración global se
  // hubiese salteado. safeAddColumn es idempotente (ignora duplicate column).
  await safeAddColumn(env, "cloud_workspaces", "license_expires_at", "TEXT");
  consoleSchemaReady = true;
}

let billingSchemaReady = false;

/**
 * Columna `extra_seats` (empleados extra comprados, además de los del plan).
 * Es la AUTORIDAD de los extras: el webhook la usa para no pisar cambios de
 * empleados al renovar, y el re-pricing la lee para recalcular el monto USD.
 * Lazy + memoizada, sin bumpear SCHEMA_VERSION (mismo criterio no-fatal que
 * ensureConsoleSchema). La llaman el webhook, el endpoint de asientos y el cron.
 */
export async function ensureBillingSchema(env: Env): Promise<void> {
  if (billingSchemaReady) return;
  await safeAddColumn(env, "cloud_workspaces", "extra_seats", "INTEGER DEFAULT 0");
  billingSchemaReady = true;
}

let workspaceColsReady = false;

/**
 * Columnas extra de cloud_workspaces fuera del applySchema versionado (F3):
 *   icon — emoji/miniatura del espacio (cuando no hay logo subido).
 * Lazy + memoizada (mismo criterio no-fatal). La llaman /me y el PATCH de
 * workspace para garantizar la columna sin bumpear SCHEMA_VERSION.
 */
export async function ensureWorkspaceColumns(env: Env): Promise<void> {
  if (workspaceColsReady) return;
  await safeAddColumn(env, "cloud_workspaces", "icon", "TEXT");
  workspaceColsReady = true;
}

/**
 * Ejecuta ALTER TABLE ADD COLUMN ignorando el error si la columna ya
 * existe. Cualquier otro error sí throwa.
 *
 * Validación de identifiers: SQLite no permite parametrizar nombres de
 * tabla/columna, así que los interpolamos directo. Para que no podamos
 * meter una inyección por accidente (callsite con typo), validamos con
 * regex estricta — solo [a-zA-Z_][a-zA-Z0-9_]* en table/column. El type
 * sí queda libre porque puede traer cláusulas ("INTEGER DEFAULT 0",
 * "TEXT DEFAULT 'new'") y es siempre literal del código nuestro.
 *
 * Antes: matcheaba "duplicate column" en el mensaje en lowercase. Funciona
 * pero swalloweaba sin loguear, complicando diagnóstico cuando una migra
 * fallaba por otro motivo y la app seguía corriendo medio rota. Ahora
 * logueamos siempre que se ignora, así queda rastro en tail.
 */
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
async function safeAddColumn(env: Env, table: string, column: string, type: string): Promise<void> {
  if (!IDENTIFIER_RE.test(table) || !IDENTIFIER_RE.test(column)) {
    throw new Error(`[schema] invalid identifier: table=${table} column=${column}`);
  }
  try {
    await tursoQuery(env, {
      sql: `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // SQLite devuelve "duplicate column name: X". Validamos contra ese
    // patrón específico (no contains) para no tragar mensajes que casualmente
    // contengan el substring.
    if (/duplicate column name:\s*\w+/i.test(msg)) {
      console.warn(`[schema] safeAddColumn skip: ${table}.${column} already exists`);
      return;
    }
    console.error(`[schema] safeAddColumn FAILED: ${table}.${column}`, msg);
    throw err;
  }
}
