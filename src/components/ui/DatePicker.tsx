import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function formatDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function DatePicker({ value, onChange, placeholder, style }: Props) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    value ? parseInt(value.split("-")[0]) : now.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    value ? parseInt(value.split("-")[1]) - 1 : now.getMonth(),
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openCalendar = () => {
    if (value) {
      setViewYear(parseInt(value.split("-")[0]));
      setViewMonth(parseInt(value.split("-")[1]) - 1);
    } else {
      setViewYear(now.getFullYear());
      setViewMonth(now.getMonth());
    }
    setOpen(true);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayRaw = new Date(viewYear, viewMonth, 1).getDay();
  const firstDay = firstDayRaw === 0 ? 6 : firstDayRaw - 1;

  const selectedDay =
    value &&
    parseInt(value.split("-")[0]) === viewYear &&
    parseInt(value.split("-")[1]) - 1 === viewMonth
      ? parseInt(value.split("-")[2])
      : null;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const selectDay = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(iso);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      {/* Overlay to capture outside click */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 199 }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Trigger button */}
      <div
        role="button"
        onClick={openCalendar}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "9px 12px",
          background: "var(--surface-2)",
          border: `1px solid ${open ? "var(--border-strong)" : "var(--border)"}`,
          borderRadius: 8,
          cursor: "pointer",
          gap: 8,
          transition: "border-color 0.12s",
          userSelect: "none",
        }}
      >
        <Calendar size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            fontSize: 13,
            color: value ? "var(--text-primary)" : "var(--text-tertiary)",
          }}
        >
          {value ? formatDisplay(value) : (placeholder ?? "Seleccionar fecha")}
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            style={{
              color: "var(--text-tertiary)",
              display: "flex",
              alignItems: "center",
              padding: 2,
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Calendar popup */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            width: 256,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            zIndex: 200,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            padding: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Month navigation */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <button
              type="button"
              onClick={prevMonth}
              style={{ color: "var(--text-tertiary)", padding: "4px 6px", borderRadius: 5 }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              style={{ color: "var(--text-tertiary)", padding: "4px 6px", borderRadius: 5 }}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Day headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
              marginBottom: 4,
            }}
          >
            {DAYS.map((d) => (
              <div
                key={d}
                style={{
                  textAlign: "center",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                  padding: "2px 0",
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected = day === selectedDay;
              const isToday =
                day === now.getDate() &&
                viewMonth === now.getMonth() &&
                viewYear === now.getFullYear();
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  style={{
                    padding: "5px 0",
                    borderRadius: 5,
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : isToday ? 600 : 400,
                    background: isSelected
                      ? "var(--brand)"
                      : isToday
                      ? "var(--surface-2)"
                      : "transparent",
                    color: isSelected ? "#fff" : isToday ? "var(--brand)" : "var(--text-primary)",
                    textAlign: "center",
                    transition: "background 0.1s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = isSelected
                      ? "var(--brand)"
                      : isToday
                      ? "var(--surface-2)"
                      : "transparent";
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
