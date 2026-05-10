/**
 * Hook React Query para cotizaciones del dólar AR.
 *
 * - Lee del cache SQLite primero (instantáneo, sirve offline).
 * - Refresca contra dolarapi.com cada 30 minutos (staleTime).
 * - Si la red falla, devuelve el snapshot local; si nunca se cargó, []
 *
 * El "tipo activo" (cuál se usa para conversiones) vive en
 * workspace_settings (KV) bajo la key `active_dolar_kind`. Default 'blue'
 * porque es el referente real para el reseller informal de iPhones.
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAllRates, type DolarRate } from '../lib/dolaresAr';
import { dolaresArDb } from '../lib/db/dolaresAr';
import { workspaceSettings } from '../lib/db/workspaceSettings';
import { useWorkspaceStore } from './workspaceStore';
import { useExchangeRateStore } from './exchangeRateStore';

const ACTIVE_KIND_KEY = 'active_dolar_kind';
const DEFAULT_ACTIVE: string = 'blue';

const STALE_MS = 30 * 60 * 1000; // 30 minutos
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/** Trae todas las cotizaciones — combina cache + remote. */
export function useDolaresAr() {
  return useQuery({
    queryKey: ['dolaresAr'],
    queryFn: async (): Promise<DolarRate[]> => {
      try {
        const fresh = await fetchAllRates();
        await dolaresArDb.saveSnapshot(fresh);
        return fresh;
      } catch (e) {
        // Caída de red / API: devolvemos el snapshot local. El badge
        // "Actualizado hace X" en la UI deja claro que está stale.
        const cached = await dolaresArDb.getAll();
        if (cached.length > 0) return cached;
        throw e;
      }
    },
    staleTime: STALE_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
}

/** Timestamp del último fetch exitoso (sirve para "Actualizado hace X"). */
export function useDolaresLastFetched() {
  return useQuery({
    queryKey: ['dolaresAr', 'lastFetched'],
    queryFn: () => dolaresArDb.getLastFetchedAt(),
    refetchInterval: 60_000, // refrescar cada minuto para que el "hace X" se mueva
  });
}

/** Tipo de dólar activo para el workspace (cuál se usa en conversiones). */
export function useActiveDolarKind() {
  const wid = useWorkspaceStore((s) => s.activeWorkspace?.id ?? '');
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['active-dolar-kind', wid],
    queryFn: async () => {
      if (!wid) return DEFAULT_ACTIVE;
      const v = await workspaceSettings.get(wid, ACTIVE_KIND_KEY);
      return v ?? DEFAULT_ACTIVE;
    },
    enabled: !!wid,
  });
  const setMut = useMutation({
    mutationFn: async (kind: string) => {
      if (!wid) return;
      await workspaceSettings.set(wid, ACTIVE_KIND_KEY, kind);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-dolar-kind', wid] });
    },
  });
  return {
    activeKind: q.data ?? DEFAULT_ACTIVE,
    setActiveKind: (kind: string) => setMut.mutateAsync(kind),
    isLoading: q.isLoading,
  };
}

/**
 * Sync: cuando cambia el tipo activo o las cotizaciones, escribe el venta
 * del tipo activo al store legacy `exchangeRateStore` para que TODA la app
 * (que ya lee `usdToArs`) funcione sin tener que reescribir cada caller.
 *
 * Este hook se monta una vez en App.tsx y mantiene en sync los dos sistemas.
 */
export function useSyncActiveDolarToExchangeRate() {
  const { data: rates } = useDolaresAr();
  const { activeKind } = useActiveDolarKind();
  const wid = useWorkspaceStore((s) => s.activeWorkspace?.id ?? '');
  const setRate = useExchangeRateStore((s) => s.setRate);

  useEffect(() => {
    if (!rates || rates.length === 0 || !wid) return;
    const active = rates.find((r) => r.kind === activeKind);
    if (!active || !active.venta) return;
    // Sólo escribimos si el valor cambia — evita un INSERT innecesario
    // por cada render.
    const current = useExchangeRateStore.getState().usdToArs;
    if (Math.abs(current - active.venta) < 0.01) return;
    setRate(wid, active.venta).catch(() => {
      /* best-effort: si falla seguimos con el rate anterior */
    });
  }, [rates, activeKind, wid, setRate]);
}
