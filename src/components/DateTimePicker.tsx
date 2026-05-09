import { useEffect, useRef, useState } from 'react';
import { Calendar, Clock, X } from 'lucide-react';
import { Button } from './Button';
import { color, radius, space, text, weight, duration, ease } from '../tokens';

/**
 * DateTimePicker — popover propio con presets + tiempo + confirm.
 *
 * Reemplaza el `<input type="datetime-local">` nativo del browser, que en
 * webview2/Tauri no tiene botón de confirmar y obliga al usuario a hacer
 * click fuera para cerrar — UX mala.
 *
 * Patrón: trigger estilo Input → click abre popover. Popover tiene:
 *   - Presets relativos (Hoy / Mañana / En 3 días / En 1 semana)
 *   - Selector de fecha exacta (input type=date, sólo fecha)
 *   - Selector de hora (HH:MM)
 *   - Botones Borrar / Confirmar
 *
 * Emite ISO string en formato `YYYY-MM-DDTHH:MM` (compatible con
 * datetime-local existente — drop-in replacement).
 */

interface DateTimePickerProps {
  value: string; // ISO "YYYY-MM-DDTHH:MM" o ""
  onChange: (next: string) => void;
  placeholder?: string;
  /** Hora por defecto cuando elegís un preset y no había hora seteada. */
  defaultHour?: number; // 0-23, default 10
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Programar',
  defaultHour = 10,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(''); // YYYY-MM-DD
  const [draftHour, setDraftHour] = useState(defaultHour);
  const [draftMinute, setDraftMinute] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sincronizar drafts cuando se abre el popover
  useEffect(() => {
    if (!open) return;
    if (value) {
      const [d, t] = value.split('T');
      setDraftDate(d ?? '');
      const [h, m] = (t ?? '').split(':');
      setDraftHour(parseInt(h ?? String(defaultHour), 10) || defaultHour);
      setDraftMinute(parseInt(m ?? '0', 10) || 0);
    } else {
      setDraftDate('');
      setDraftHour(defaultHour);
      setDraftMinute(0);
    }
  }, [open, value, defaultHour]);

  // Click outside / Esc cierra
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function applyPreset(daysFromNow: number) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setDraftDate(toIsoDate(d));
  }

  function commit() {
    if (!draftDate) {
      onChange('');
      setOpen(false);
      return;
    }
    const hh = String(draftHour).padStart(2, '0');
    const mm = String(draftMinute).padStart(2, '0');
    onChange(`${draftDate}T${hh}:${mm}`);
    setOpen(false);
  }

  function clear() {
    onChange('');
    setOpen(false);
  }

  // Display label
  const displayLabel = value ? formatDisplay(value) : placeholder;
  const hasValue = !!value;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger — estilo Input */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          height: 36,
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
          padding: `0 ${space[3]}`,
          background: color.surface2,
          border: `1px solid ${open ? color.primary : color.border}`,
          borderRadius: radius.md,
          color: hasValue ? color.text : color.textDim,
          fontSize: text.base,
          textAlign: 'left',
          cursor: 'pointer',
          boxShadow: open ? 'var(--shadow-focus)' : 'none',
          transition: `border-color ${duration.fast} ${ease}, box-shadow ${duration.fast} ${ease}`,
        }}
      >
        <Calendar size={14} color={color.textDim} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayLabel}
        </span>
        {hasValue && (
          <span
            role="button"
            aria-label="Limpiar fecha"
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: 2,
              borderRadius: radius.sm,
              color: color.textDim,
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          role="dialog"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 60,
            width: 320,
            background: color.surface,
            border: `1px solid ${color.borderStrong}`,
            borderRadius: radius.md,
            boxShadow: 'var(--shadow-lg)',
            padding: space[4],
            display: 'flex',
            flexDirection: 'column',
            gap: space[3],
          }}
        >
          {/* Presets */}
          <div>
            <SectionLabel>Atajos</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <PresetChip label="Hoy" onClick={() => applyPreset(0)} />
              <PresetChip label="Mañana" onClick={() => applyPreset(1)} />
              <PresetChip label="En 3 días" onClick={() => applyPreset(3)} />
              <PresetChip label="En 1 semana" onClick={() => applyPreset(7)} />
              <PresetChip label="En 2 semanas" onClick={() => applyPreset(14)} />
            </div>
          </div>

          {/* Fecha */}
          <div>
            <SectionLabel>Fecha</SectionLabel>
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              style={{
                width: '100%',
                marginTop: 6,
                height: 36,
                padding: `0 ${space[3]}`,
                background: color.surface2,
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
                color: color.text,
                fontSize: text.base,
                outline: 'none',
              }}
            />
          </div>

          {/* Hora */}
          <div>
            <SectionLabel>
              <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Hora
            </SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <NumStepper
                value={draftHour}
                min={0}
                max={23}
                onChange={setDraftHour}
                ariaLabel="Hora"
              />
              <span style={{ color: color.textDim, fontWeight: weight.bold }}>:</span>
              <NumStepper
                value={draftMinute}
                min={0}
                max={59}
                step={5}
                onChange={setDraftMinute}
                ariaLabel="Minuto"
              />
              <div style={{ flex: 1 }} />
              <TimeShortcut label="9:00" onClick={() => { setDraftHour(9); setDraftMinute(0); }} />
              <TimeShortcut label="14:00" onClick={() => { setDraftHour(14); setDraftMinute(0); }} />
              <TimeShortcut label="18:00" onClick={() => { setDraftHour(18); setDraftMinute(0); }} />
            </div>
          </div>

          {/* Footer — botones */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: space[2],
              paddingTop: space[3],
              borderTop: `1px solid ${color.border}`,
            }}
          >
            <Button variant="ghost" size="sm" onClick={clear}>
              Borrar
            </Button>
            <div style={{ display: 'flex', gap: space[2] }}>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" size="sm" onClick={commit} disabled={!draftDate}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: text.xs,
        fontWeight: weight.semibold,
        color: color.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
      }}
    >
      {children}
    </div>
  );
}

function PresetChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: `5px ${space[3]}`,
        fontSize: text.xs,
        fontWeight: weight.semibold,
        color: color.text,
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.full,
        cursor: 'pointer',
        transition: 'all 100ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color.primary;
        e.currentTarget.style.color = color.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = color.border;
        e.currentTarget.style.color = color.text;
      }}
    >
      {label}
    </button>
  );
}

function TimeShortcut({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: `2px 6px`,
        fontSize: text.xs,
        fontWeight: weight.medium,
        color: color.textMuted,
        background: 'transparent',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = color.text)}
      onMouseLeave={(e) => (e.currentTarget.style.color = color.textMuted)}
    >
      {label}
    </button>
  );
}

function NumStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      value={String(value).padStart(2, '0')}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      style={{
        width: 56,
        height: 32,
        textAlign: 'center',
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.sm,
        color: color.text,
        fontSize: text.base,
        fontWeight: weight.semibold,
        outline: 'none',
      }}
    />
  );
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Formato amigable: "Hoy 14:30", "Mañana 09:00", "Vie 16/5 14:30" */
function formatDisplay(iso: string): string {
  const [d, t] = iso.split('T');
  if (!d) return iso;
  const date = new Date(`${d}T${t || '00:00'}`);
  if (Number.isNaN(date.getTime())) return iso;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (diffDays === 0) return `Hoy ${time}`;
  if (diffDays === 1) return `Mañana ${time}`;
  if (diffDays === -1) return `Ayer ${time}`;
  if (diffDays >= 2 && diffDays <= 6) {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${dayNames[date.getDay()]} ${time}`;
  }
  // Fecha completa para algo más lejano
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm} ${time}`;
}
