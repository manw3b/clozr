#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_sql::Builder;

/// Event que emitimos al frontend cuando recibimos un deep link de auth.
/// El frontend (LoginScreen / authStore) escucha "auth:deep-link" y
/// parsea el URL para extraer el ?jwt= o ?reason=.
const AUTH_EVENT: &str = "auth:deep-link";

fn main() {
    // Migrations nativas DESACTIVADAS — el schema se maneja desde JS en
    // src/lib/db/ensureSchema.ts (replayer idempotente). Esto evita el error
    // "migration X was previously applied but has been modified" del plugin,
    // que aparece cuando el SHA del SQL cambia entre versiones.
    //
    // Los archivos SQL viven ahora en src-tauri/migrations-archive/ como
    // changelog histórico (ver README.md ahí mismo).
    let mut builder = tauri::Builder::default();

    // single-instance ANTES que el resto, en desktop. Cuando el SO intenta
    // abrir una segunda instancia (porque el usuario clickeó clozr:// con
    // Clozr ya abierto), este handler intercepta el launch, forwardea los
    // argv al window principal, y mata el proceso nuevo. El URL llega como
    // argv[1] y lo pasamos al deep-link plugin manualmente vía .on_open_url
    // (que ya escuchamos abajo, así que single-instance solo necesita
    // levantar la ventana).
    #[cfg(any(windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Trae la ventana al frente — si estaba minimizada, restaurar.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            // No emit acá: deep-link plugin (con feature "deep-link" en
            // single-instance) ya intercepta argv y dispara .on_open_url
            // por separado. Si en algún momento se rompe, podemos parsear
            // _argv directo y emit manualmente.
        }));
    }

    builder
        // window-state primero — debe registrarse antes del resto para
        // poder hookear los eventos de close de la ventana y guardar el
        // estado (tamaño, posición, maximizado, fullscreen) en disco.
        // Al abrir la app restaura lo que estaba guardado.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(Builder::new().build())
        .setup(|app| {
            // En dev, el scheme clozr:// NO está registrado en el OS porque
            // no pasamos por el installer NSIS. .register_all() escribe en
            // el registro de Windows (HKCU\Software\Classes\clozr) para
            // que el SO sepa dirigir clozr:// a este .exe.
            //
            // En prod (instalado vía NSIS), el installer ya lo registra,
            // pero llamar a register_all() es idempotente y barato.
            #[cfg(any(windows, target_os = "linux"))]
            if let Err(e) = app.deep_link().register_all() {
                eprintln!("[deep-link] register_all failed: {}", e);
            }

            // Listener de deep links. Dispara cuando:
            //   - App estaba cerrada y el SO la lanza con un URL clozr://
            //   - App estaba abierta y single-instance forwardea el URL
            //
            // Emitimos un único event al frontend con el URL crudo. El
            // frontend lo parsea (es más flexible para distintos paths:
            // auth-complete, auth-error, etc).
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let url_str = url.to_string();
                    // Log a stderr para diagnosticar en build dev. En prod
                    // no se ve, pero es útil al desarrollar el flow.
                    eprintln!("[deep-link] received: {}", url_str);
                    let _ = handle.emit(AUTH_EVENT, url_str);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
