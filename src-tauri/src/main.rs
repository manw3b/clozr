#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::Builder;

mod turso_spike;

fn main() {
    // Migrations nativas DESACTIVADAS — el schema se maneja desde JS en
    // src/lib/db/ensureSchema.ts (replayer idempotente). Esto evita el error
    // "migration X was previously applied but has been modified" del plugin,
    // que aparece cuando el SHA del SQL cambia entre versiones.
    //
    // Los archivos SQL viven ahora en src-tauri/migrations-archive/ como
    // changelog histórico (ver README.md ahí mismo).
    tauri::Builder::default()
        // window-state primero — debe registrarse antes del resto para
        // poder hookear los eventos de close de la ventana y guardar el
        // estado (tamaño, posición, maximizado, fullscreen) en disco.
        // Al abrir la app restaura lo que estaba guardado.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(Builder::new().build())
        // Spike Fase 0 — comandos para validar libsql + Turso. Solo
        // expuestos en build de desarrollo. Si la validación es exitosa
        // los borramos y replicamos el patrón en un módulo definitivo.
        .invoke_handler(tauri::generate_handler![
            turso_spike::turso_ping,
            turso_spike::turso_roundtrip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
