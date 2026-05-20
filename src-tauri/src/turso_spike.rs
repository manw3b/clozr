//! Spike Fase 0 — validar libsql + Turso en Tauri 2 (Windows / WebView2).
//!
//! Dos comandos Tauri expuestos:
//!
//!   - `turso_ping(url, token)` → conecta remoto puro vía libsql HTTP y
//!     ejecuta `SELECT 1+1 as result`. Si responde "2" sabemos que la
//!     transport layer básica anda. Esto NO valida la réplica local.
//!
//!   - `turso_roundtrip(url, token, local_path)` → crea una réplica
//!     embedded en `local_path`, hace un CREATE TABLE + INSERT + SELECT,
//!     fuerza sync, devuelve cuántas filas leyó. Esto SÍ valida el modelo
//!     que usaremos en producción (lee local, escribe local + sync a
//!     cloud).
//!
//! Llamados desde JS con `invoke('turso_ping', { url, token })`. La UI
//! del spike está en src/dev/TursoSpike.tsx (montado condicionalmente
//! en dev mode).

use serde::Serialize;

#[derive(Serialize)]
pub struct PingResult {
    pub ok: bool,
    pub value: Option<i64>,
    pub error: Option<String>,
    pub elapsed_ms: u128,
}

#[derive(Serialize)]
pub struct RoundtripResult {
    pub ok: bool,
    pub rows_after_insert: Option<i64>,
    pub error: Option<String>,
    pub elapsed_ms: u128,
}

/// Conexión remota pura — no usa storage local. Sirve para validar que
/// el binario buildea con libsql y que las creds funcionan en runtime.
#[tauri::command]
pub async fn turso_ping(url: String, token: String) -> Result<PingResult, String> {
    let start = std::time::Instant::now();

    let result = (|| async {
        let db = libsql::Builder::new_remote(url, token)
            .build()
            .await
            .map_err(|e| format!("build: {e}"))?;
        let conn = db.connect().map_err(|e| format!("connect: {e}"))?;
        let mut rows = conn
            .query("SELECT 1+1 as result", ())
            .await
            .map_err(|e| format!("query: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| format!("next: {e}"))?
            .ok_or_else(|| "no row returned".to_string())?;
        let value: i64 = row.get(0).map_err(|e| format!("get: {e}"))?;
        Ok::<i64, String>(value)
    })()
    .await;

    let elapsed_ms = start.elapsed().as_millis();
    match result {
        Ok(value) => Ok(PingResult {
            ok: true,
            value: Some(value),
            error: None,
            elapsed_ms,
        }),
        Err(e) => Ok(PingResult {
            ok: false,
            value: None,
            error: Some(e),
            elapsed_ms,
        }),
    }
}

/// Réplica embedded — el modelo real que usaríamos en producción.
///
/// Crea un archivo SQLite local en `local_path`, le configura sync con
/// el Turso remoto, hace un CREATE TABLE + INSERT + sync push, lee la
/// cantidad de filas locales.
///
/// Si esto anda: reads son 0ms (local), writes son 0ms local + N ms
/// asíncrono al sync. La UX es como tener SQLite puro pero todo se
/// replica al cloud.
#[tauri::command]
pub async fn turso_roundtrip(
    url: String,
    token: String,
    local_path: String,
) -> Result<RoundtripResult, String> {
    let start = std::time::Instant::now();

    let result = (|| async {
        let db = libsql::Builder::new_remote_replica(local_path, url, token)
            .build()
            .await
            .map_err(|e| format!("build: {e}"))?;

        // Pull cualquier cosa que esté en remoto antes de empezar.
        db.sync().await.map_err(|e| format!("sync pre: {e}"))?;

        let conn = db.connect().map_err(|e| format!("connect: {e}"))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS spike_test (id INTEGER PRIMARY KEY AUTOINCREMENT, msg TEXT, at TEXT DEFAULT (datetime('now')))",
            (),
        )
        .await
        .map_err(|e| format!("create: {e}"))?;

        conn.execute(
            "INSERT INTO spike_test (msg) VALUES (?)",
            libsql::params!["roundtrip from clozr tauri"],
        )
        .await
        .map_err(|e| format!("insert: {e}"))?;

        // Push del INSERT al remoto.
        db.sync().await.map_err(|e| format!("sync post: {e}"))?;

        let mut rows = conn
            .query("SELECT COUNT(*) FROM spike_test", ())
            .await
            .map_err(|e| format!("count: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| format!("count next: {e}"))?
            .ok_or_else(|| "no count row".to_string())?;
        let count: i64 = row.get(0).map_err(|e| format!("count get: {e}"))?;

        Ok::<i64, String>(count)
    })()
    .await;

    let elapsed_ms = start.elapsed().as_millis();
    match result {
        Ok(count) => Ok(RoundtripResult {
            ok: true,
            rows_after_insert: Some(count),
            error: None,
            elapsed_ms,
        }),
        Err(e) => Ok(RoundtripResult {
            ok: false,
            rows_after_insert: None,
            error: Some(e),
            elapsed_ms,
        }),
    }
}
