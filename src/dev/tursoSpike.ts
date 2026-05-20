/**
 * Spike Fase 0 — helpers para invocar los comandos Rust de Turso desde
 * la consola del browser en dev mode.
 *
 * Uso:
 *   1. `npm run tauri dev`
 *   2. Abrir DevTools (F12) en la ventana de Clozr
 *   3. En la consola correr:
 *        await window.__tursoSpike.ping()
 *        await window.__tursoSpike.roundtrip()
 *
 * Resultado esperado:
 *   ping:       { ok: true, value: 2, elapsed_ms: ~400 }  ← HTTP a Turso
 *   roundtrip:  { ok: true, rows_after_insert: 1+, elapsed_ms: ~500-1500 }
 *                ← réplica local + sync push al cloud
 *
 * Si ambos devuelven ok=true: ✅ Fase 0 PASS — seguimos a Fase 1 (backend
 * de auth) y Fase 2 (reemplazo de tauri-plugin-sql por libsql en toda la
 * app).
 *
 * Si falla: el `error` del result tiene el motivo. Lo más probable es
 * que el token expiró o la URL está mal. Regenerar el token desde Turso
 * dashboard y reintentar.
 *
 * ⚠️  Solo se monta en development. En production no expone nada.
 */

import { invoke } from '@tauri-apps/api/core';

// Pegados acá para el spike — vienen de .env.local. NO los commitees
// si los cambiás por unos tuyos.
const SPIKE_URL = 'libsql://clozr-spike-manw3b.aws-us-east-1.turso.io';
const SPIKE_TOKEN =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzkyMzc1NjYsImlkIjoiMDE5ZTQyZDItN2QwMS03ZTMxLWI0YjEtMzMwNjY4OTRkOWU2IiwicmlkIjoiMzc3ODk4NmEtNmQyMS00MTcwLWE4NTUtZmM2MGVlYzMxNzhkIn0.mL6pg5-AWHTmpXuIc5nfgfECs0ubA_hGthmTBBtF2IxEqiE8HVqKCVFBNuxPImYTRSxAPX9B8Bbf2dntTE2WBw';

interface PingResult {
  ok: boolean;
  value: number | null;
  error: string | null;
  elapsed_ms: number;
}

interface RoundtripResult {
  ok: boolean;
  rows_after_insert: number | null;
  error: string | null;
  elapsed_ms: number;
}

export const tursoSpike = {
  async ping(): Promise<PingResult> {
    const res = await invoke<PingResult>('turso_ping', {
      url: SPIKE_URL,
      token: SPIKE_TOKEN,
    });
    console.log('[turso ping]', res);
    return res;
  },

  async roundtrip(): Promise<RoundtripResult> {
    // Path local para la réplica. En producción usaremos appDataDir.
    // Para el spike, un path fijo en %TEMP% alcanza.
    const localPath = 'clozr-spike-replica.db';
    const res = await invoke<RoundtripResult>('turso_roundtrip', {
      url: SPIKE_URL,
      token: SPIKE_TOKEN,
      localPath,
    });
    console.log('[turso roundtrip]', res);
    return res;
  },
};

// Expose to window for console testing in dev. En production esto NO
// se monta (App.tsx solo importa este módulo bajo import.meta.env.DEV).
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__tursoSpike = tursoSpike;
}
