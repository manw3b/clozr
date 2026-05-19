import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  useDolaresAr,
  useDolaresLastFetched,
  useActiveDolarKind,
} from '../../store/useDolaresAr';
import { DOLAR_KIND_LABELS } from '../../lib/dolaresAr';
import { useUIStore } from '../../store/uiStore';
import { formatMoney } from '../../lib/format';
import { qk } from '../../lib/queryKeys';

const cardStyle: React.CSSProperties = {
  padding: 14,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  cursor: 'pointer',
  transition: 'all 140ms cubic-bezier(0.22, 1, 0.36, 1)',
  position: 'relative',
};

/**
 * Sección "Cotizaciones del dólar" en Ajustes.
 *
 * Muestra los 7 tipos que devuelve dolarapi.com como cards seleccionables.
 * El que el usuario marca como "activo" es el que se usa en toda la app
 * para conversiones USD↔ARS. Botón de refresh manual + timestamp del
 * último fetch.
 */
export function DolaresArSection() {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const { data: rates = [], isLoading, isFetching, error, refetch } = useDolaresAr();
  const { data: lastFetched } = useDolaresLastFetched();
  const { activeKind, setActiveKind } = useActiveDolarKind();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: qk.dolaresAr.rates() });
      await refetch();
      showToast('Cotizaciones actualizadas', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.2, margin: 0 }}>
            Cotizaciones del dólar
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4, marginBottom: 0 }}>
            Datos de <a href="https://dolarapi.com" target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>dolarapi.com</a> · se refrescan automáticamente cada 30 minutos.
            Marcá cuál usar como referencia para convertir USD ↔ ARS en la app.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || isFetching}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
            cursor: refreshing || isFetching ? 'not-allowed' : 'pointer',
            opacity: refreshing || isFetching ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          <RefreshCw
            size={13}
            style={{
              animation: refreshing || isFetching ? 'clozr-spin 0.8s linear infinite' : undefined,
            }}
          />
          Actualizar ahora
        </button>
      </div>

      {/* Banner de estado */}
      <StatusBanner lastFetched={lastFetched ?? null} isError={!!error && rates.length === 0} />

      {/* Grid de cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
          maxWidth: 900,
        }}
      >
        {isLoading && rates.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Cargando cotizaciones…</div>
        ) : (
          rates.map((r) => {
            const isActive = activeKind === r.kind;
            return (
              <div
                key={r.kind}
                onClick={() => setActiveKind(r.kind)}
                style={{
                  ...cardStyle,
                  background: isActive ? 'rgba(232,0,29,0.06)' : 'var(--surface-2)',
                  border: isActive
                    ? '1px solid var(--primary)'
                    : '1px solid var(--border)',
                  boxShadow: isActive ? '0 0 0 3px rgba(232,0,29,0.12)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                    }}
                  >
                    {DOLAR_KIND_LABELS[r.kind] ?? r.nombre}
                  </span>
                  {isActive && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <CheckCircle2 size={12} /> Activo
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                    {formatMoney(r.venta)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>= US$ 1</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.compra !== null && r.compra > 0 && (
                    <span>
                      Compra: <strong style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.compra)}</strong>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes clozr-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatusBanner({ lastFetched, isError }: { lastFetched: string | null; isError: boolean }) {
  if (isError) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: 'rgba(232,0,29,0.06)',
          border: '1px solid rgba(232,0,29,0.25)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--danger)',
          marginBottom: 16,
        }}
      >
        <AlertTriangle size={14} />
        No pudimos contactar dolarapi.com. Mostrando última cotización guardada.
      </div>
    );
  }
  if (!lastFetched) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
        Sin cotización cargada — apretá "Actualizar ahora".
      </div>
    );
  }
  const ms = Date.now() - new Date(lastFetched).getTime();
  const min = Math.floor(ms / 60_000);
  const ago = min < 1 ? 'hace instantes' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h`;
  return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
      Actualizado {ago} · próximo refresh automático en ≤ 30 min
    </div>
  );
}
