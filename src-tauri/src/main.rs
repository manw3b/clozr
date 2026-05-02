#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::{Builder, Migration, MigrationKind};

fn main() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "catalog_stock_min",
            sql: include_str!("../migrations/002_catalog.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "pipeline_stages",
            sql: include_str!("../migrations/003_pipeline_stages.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "customer_types",
            sql: include_str!("../migrations/004_customer_types.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "catalog_categories",
            sql: include_str!("../migrations/005_catalog_categories.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "tasks_custom_days",
            sql: include_str!("../migrations/006_tasks_custom_days.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "catalog_custom_fields",
            sql: include_str!("../migrations/007_catalog_custom_fields.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "users_extended",
            sql: include_str!("../migrations/008_users_extended.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "images",
            sql: include_str!("../migrations/009_images.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "product_condition",
            sql: include_str!("../migrations/010_product_condition.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "businesses",
            sql: include_str!("../migrations/011_businesses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "cash_followups",
            sql: include_str!("../migrations/012_cash_followups.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "exchange_rate",
            sql: include_str!("../migrations/013_exchange_rate.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "product_templates",
            sql: include_str!("../migrations/014_product_templates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "product_templates_image",
            sql: include_str!("../migrations/015_product_templates_image.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "quick_stock",
            sql: include_str!("../migrations/016_quick_stock.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "stock_sold_to",
            sql: include_str!("../migrations/017_stock_sold_to.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "airpods_variants",
            sql: include_str!("../migrations/018_airpods_variants.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            Builder::new()
                .add_migrations("sqlite:clozr.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
