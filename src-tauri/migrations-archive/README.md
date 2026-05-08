# Migrations archive

Estos archivos `.sql` son **referencia histórica**. Las migraciones nativas
del plugin `tauri-plugin-sql` están **desactivadas** desde el cambio
documentado en `src-tauri/src/main.rs`.

## Por qué desactivadas

`tauri-plugin-sql` calcula un SHA del contenido de cada migración la
primera vez que corre y lo guarda en una tabla interna. Si después tocás
una migración para arreglar un typo o ajustar un default, el SHA cambia
y el plugin tira:

```
migration X was previously applied but has been modified
```

…lo cual rompe el arranque para todos los usuarios que ya tenían la app
instalada. La opción del plugin es no tocar nunca una migración aplicada
— en la práctica, durante desarrollo activo, eso no es realista.

## Cómo se maneja el schema ahora

Toda la lógica de schema vive en
[`src/lib/db/ensureSchema.ts`](../../src/lib/db/ensureSchema.ts). Es un
**replayer idempotente** que corre cada vez que se abre la DB y aplica
todas las definiciones de tablas/columnas/índices con `CREATE TABLE IF
NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` y `safe()` para los `ALTER
TABLE ADD COLUMN` (SQLite tira "duplicate column" cuando ya existe — se
ignora).

Cuando se agrega una migración nueva:
1. Editar `ensureSchema.ts` agregando un bloque numerado al final.
2. (Opcional) Tirar el `.sql` equivalente en este folder como changelog.

## Changelog histórico

| # | Archivo | Resumen |
|---|---|---|
| 001 | `001_initial.sql` | workspaces, users, workspace_members, customers, pipeline, sales, tasks, audit_log |
| 002 | `002_catalog.sql` | catalog_items.stock_min |
| 003 | `003_pipeline_stages.sql` | pipeline_stages + member roles backfill |
| 004 | `004_customer_types.sql` | customer_types |
| 005 | `005_catalog_categories.sql` | catalog_categories |
| 006 | `006_tasks_custom_days.sql` | tasks.custom_days |
| 007 | `007_catalog_custom_fields.sql` | catalog_field_templates |
| 008 | `008_users_extended.sql` | users: phone, role_description, avatar_color, notes |
| 009 | `009_images.sql` | image_path en catalog/customers/workspaces |
| 010 | `010_product_condition.sql` | catalog_items: condition + condition_details_json |
| 011 | `011_businesses.sql` | businesses + sales.business_id |
| 012 | `012_cash_followups.sql` | cash_movements + followups |
| 013 | `013_exchange_rate.sql` | exchange_rates + workspace.daily_goal |
| 014 | `014_product_templates.sql` | product_templates (ya jubilado, sin uso) |
| 015 | `015_product_templates_image.sql` | product_templates.image_path |
| 016 | `016_quick_stock.sql` | product_categories/families/models/variants/stock_items |
| 017 | `017_stock_sold_to.sql` | stock_items.sold_to |
| 018 | `018_airpods_variants.sql` | seeds de variantes AirPods |
| 019 | `019_customer_contacts.sql` | customer_contacts |
| 020 | `020_cash_day_sessions.sql` | cash_day_sessions |
| 021 | `021_pipeline_extended.sql` | pipeline_items: product, next_action, owner, priority, position |
| 022 | `022_sales_payment_method.sql` | sales.payment_method denormalizado |
| 023 | `023_payment_methods.sql` | payment_methods (configurables por workspace) |
| 024 | `024_catalog_pricing.sql` | catalog_prices (por customer_type) + cost_usd |
| 025 | `025_stock_pricing.sql` | stock_item_prices + sales.out_of_stock_sale |
| 026 | (sin SQL — solo en ensureSchema) | workspace_featured_models |
| 027 | `027_user_auth.sql` | users.pin_hash + users.last_login_at |
| 028 | (sin SQL — solo en ensureSchema) | índices compuestos para queries frecuentes |

## Si querés rehabilitar migrations nativas

Hay que decidir entre:
- **Plugin nativo + nunca tocar archivos viejos** — disciplina estricta,
  todo cambio = migration nueva.
- **Replayer JS (lo que tenemos)** — flexibilidad total, costo de boot
  marginal porque `IF NOT EXISTS` es O(1) si la tabla ya existe.

Para nuestro caso (single-user desktop, sin downtime real), el replayer
gana. Si alguna vez vamos a un sync de muchas instancias y queremos
versioning estricto, conviene rehabilitar el plugin.
