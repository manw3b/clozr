//! Spike Fase 0 — PIVOT 2: HTTP directo a Turso vía reqwest.
//!
//! Por qué no libsql SDK: ver comentario en Cargo.toml. Resumen: el SDK
//! de libsql tiene problemas de build en Windows (libsql-ffi requiere
//! prereqs no documentados, libsql-sys usa API Unix-only). Fuimos
//! pragmáticos y validamos el transport HTTP puro contra Turso.
//!
//! Endpoint usado: `POST {dbUrl}/v2/pipeline`
//! Auth: `Authorization: Bearer <token>`
//! Body: `{ "requests": [{ "type": "execute", "stmt": {"sql": "..."}}, {"type":"close"}] }`
//!
//! Dos comandos Tauri:
//!   - `turso_ping(url, token)` → SELECT 1+1 y extrae el `2` de la
//!     primera fila.
//!   - `turso_roundtrip(url, token, local_path)` → CREATE TABLE + INSERT
//!     + COUNT en una sola request multi-statement. Valida que el flow
//!     completo de schema + writes + reads funciona end-to-end.
//!
//! El parámetro `local_path` se mantiene en la firma de roundtrip para
//! que cuando volvamos a embedded replica (Fase 2) no tengamos que
//! cambiar el contrato del comando — se ignora por ahora.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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

/// Convierte una URL `libsql://host` → `https://host` para hablarle al
/// endpoint HTTP. Si ya viene https/http la deja igual.
fn to_http_url(url: &str) -> String {
    if let Some(rest) = url.strip_prefix("libsql://") {
        format!("https://{rest}")
    } else {
        url.to_string()
    }
}

/// Manda una pipeline a Turso y devuelve el JSON `results` como Value.
/// Cada statement va dentro de un objeto execute; opcionalmente se
/// agrega un close al final para liberar el baton (no estamos
/// reutilizando la conexión, así que cerramos siempre).
async fn execute_pipeline(
    base_url: &str,
    token: &str,
    statements: Vec<&str>,
) -> Result<Value, String> {
    let http = to_http_url(base_url);
    let url = format!("{http}/v2/pipeline");

    let mut requests: Vec<Value> = statements
        .iter()
        .map(|sql| json!({ "type": "execute", "stmt": { "sql": sql } }))
        .collect();
    requests.push(json!({ "type": "close" }));

    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .bearer_auth(token)
        .json(&json!({ "requests": requests }))
        .send()
        .await
        .map_err(|e| format!("send: {e}"))?;

    let status = res.status();
    let body: Value = res
        .json()
        .await
        .map_err(|e| format!("decode: {e}"))?;

    if !status.is_success() {
        return Err(format!("HTTP {status}: {body}"));
    }

    Ok(body)
}

#[derive(Deserialize)]
struct CellValue {
    #[serde(rename = "type")]
    kind: String,
    value: Value,
}

/// Extrae un i64 de `body.results[stmt_idx].response.result.rows[0][0]`.
/// Si Turso devuelve los enteros como string ("2"), lo parseamos.
fn extract_first_int(body: &Value, stmt_idx: usize) -> Result<i64, String> {
    let cell = body
        .pointer(&format!("/results/{stmt_idx}/response/result/rows/0/0"))
        .ok_or_else(|| format!("no cell at stmt {stmt_idx}: {body}"))?;
    let cell: CellValue =
        serde_json::from_value(cell.clone()).map_err(|e| format!("cell shape: {e}"))?;
    if cell.kind != "integer" {
        return Err(format!("expected integer, got {}: {:?}", cell.kind, cell.value));
    }
    match cell.value {
        Value::String(s) => s.parse::<i64>().map_err(|e| format!("parse: {e}")),
        Value::Number(n) => n.as_i64().ok_or_else(|| "not i64".to_string()),
        _ => Err(format!("unexpected value: {:?}", cell.value)),
    }
}

#[tauri::command]
pub async fn turso_ping(url: String, token: String) -> Result<PingResult, String> {
    let start = std::time::Instant::now();
    let result = execute_pipeline(&url, &token, vec!["SELECT 1+1 as result"])
        .await
        .and_then(|body| extract_first_int(&body, 0));
    let elapsed_ms = start.elapsed().as_millis();
    Ok(match result {
        Ok(value) => PingResult {
            ok: true,
            value: Some(value),
            error: None,
            elapsed_ms,
        },
        Err(error) => PingResult {
            ok: false,
            value: None,
            error: Some(error),
            elapsed_ms,
        },
    })
}

#[tauri::command]
pub async fn turso_roundtrip(
    url: String,
    token: String,
    local_path: String,
) -> Result<RoundtripResult, String> {
    let _ = local_path; // ignorado en remote-only
    let start = std::time::Instant::now();

    let result = execute_pipeline(
        &url,
        &token,
        vec![
            "CREATE TABLE IF NOT EXISTS spike_test (id INTEGER PRIMARY KEY AUTOINCREMENT, msg TEXT, at TEXT DEFAULT (datetime('now')))",
            "INSERT INTO spike_test (msg) VALUES ('roundtrip from clozr tauri (HTTP)')",
            "SELECT COUNT(*) FROM spike_test",
        ],
    )
    .await
    .and_then(|body| extract_first_int(&body, 2));

    let elapsed_ms = start.elapsed().as_millis();
    Ok(match result {
        Ok(count) => RoundtripResult {
            ok: true,
            rows_after_insert: Some(count),
            error: None,
            elapsed_ms,
        },
        Err(error) => RoundtripResult {
            ok: false,
            rows_after_insert: None,
            error: Some(error),
            elapsed_ms,
        },
    })
}
