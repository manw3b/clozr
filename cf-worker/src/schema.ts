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
const SCHEMA_VERSION = 4;

export function ensureSchema(env: Env): Promise<void> {
  if (!initPromise) initPromise = applySchemaIfNeeded(env);
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
