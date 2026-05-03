#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::Builder;

fn main() {
    // Migrations nativas DESACTIVADAS — el schema se maneja desde JS en
    // src/lib/db/ensureSchema.ts (replayer idempotente de las 25 migraciones
    // originales). Esto evita el error "migration X was previously applied but
    // has been modified" que aparece cuando el SHA del SQL cambia entre versiones.
    //
    // Los archivos en src-tauri/migrations/ quedan como referencia histórica.
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
