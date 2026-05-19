import { ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { color, radius, text, weight } from '../../tokens';

/* ============================================================
 *  Tipos
 * ============================================================ */

export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnDef<T> {
  /** Identificador único — usado para sort */
  id: string;
  /** Texto del header */
  header: ReactNode;
  /** Render de la celda */
  cell: (row: T, index: number) => ReactNode;
  /** Permite ordenar por esta columna */
  sortable?: boolean;
  /** Función de comparación custom (default: comparación natural sobre accessor) */
  sortFn?: (a: T, b: T) => number;
  /** Ancho de la columna (CSS, ej: "200px", "1fr", "minmax(120px, 1fr)") */
  width?: string;
  /** Alineación del contenido */
  align?: 'left' | 'right' | 'center';
  /** Si la columna debe permanecer pegada al header (sticky horizontal) */
  sticky?: 'left' | 'right';
  /** Padding diferente al default */
  padding?: 'compact' | 'normal' | 'comfy';
}

interface DataTableProps<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  /** Función para obtener un id único de cada row */
  getRowId: (row: T) => string;
  /** Click en una row (abre drawer, navega, etc.) */
  onRowClick?: (row: T) => void;
  /** Click derecho en una row → abre context menu custom. Recibe el
   *  evento para extraer coordenadas y la row. */
  onRowContextMenu?: (row: T, e: React.MouseEvent) => void;
  /** Row marcada visualmente como activa (ej: la que está abierta en el drawer) */
  activeRowId?: string;
  /** Selección múltiple */
  selection?: {
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
  };
  /** Sort actual */
  sort?: { columnId: string; direction: 'asc' | 'desc' };
  onSortChange?: (next: { columnId: string; direction: 'asc' | 'desc' } | null) => void;
  /** Empty state cuando rows.length === 0 */
  empty?: ReactNode;
  /** Densidad de las filas */
  density?: 'compact' | 'normal' | 'comfy';
}

/* ============================================================
 *  Componente
 * ============================================================ */

const rowHeight = { compact: 40, normal: 52, comfy: 64 };
const cellPadding = { compact: 10, normal: 14, comfy: 18 };

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  onRowClick,
  onRowContextMenu,
  activeRowId,
  selection,
  sort,
  onSortChange,
  empty,
  density = 'normal',
}: DataTableProps<T>) {
  const hasSelection = !!selection;
  const allSelected = hasSelection && rows.length > 0 && rows.every((r) => selection.selected.has(getRowId(r)));
  const someSelected = hasSelection && !allSelected && rows.some((r) => selection.selected.has(getRowId(r)));

  // Construir grid template
  const gridTemplate = [
    hasSelection ? '40px' : '',
    ...columns.map((c) => c.width || 'minmax(0, 1fr)'),
  ]
    .filter(Boolean)
    .join(' ');

  function toggleSelectAll() {
    if (!selection) return;
    if (allSelected) {
      selection.onChange(new Set());
    } else {
      selection.onChange(new Set(rows.map(getRowId)));
    }
  }

  function toggleSelectRow(id: string, e: React.MouseEvent) {
    if (!selection) return;
    e.stopPropagation();
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  }

  function handleSortClick(columnId: string) {
    if (!onSortChange) return;
    if (!sort || sort.columnId !== columnId) {
      onSortChange({ columnId, direction: 'asc' });
    } else if (sort.direction === 'asc') {
      onSortChange({ columnId, direction: 'desc' });
    } else {
      onSortChange(null);
    }
  }

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
      }}
    >
      {/* HEADER */}
      <div
        role="row"
        style={{
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          alignItems: 'center',
          height: 40,
          background: color.surface,
          borderBottom: `1px solid ${color.border}`,
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        {hasSelection && (
          <HeaderCell padding={cellPadding[density]}>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={toggleSelectAll}
              aria-label="Seleccionar todos"
            />
          </HeaderCell>
        )}
        {columns.map((col) => {
          const isSorted = sort?.columnId === col.id;
          const align = col.align || 'left';
          return (
            <HeaderCell key={col.id} align={align} padding={cellPadding[density]}>
              {col.sortable ? (
                <button
                  onClick={() => handleSortClick(col.id)}
                  className={`dt-sort-btn${isSorted ? ' sorted' : ''}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontWeight: weight.semibold,
                    fontSize: text.xs,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                  }}
                >
                  {col.header}
                  {isSorted ? (
                    sort.direction === 'asc' ? (
                      <ChevronUp size={12} strokeWidth={2.5} />
                    ) : (
                      <ChevronDown size={12} strokeWidth={2.5} />
                    )
                  ) : (
                    <ChevronsUpDown size={12} strokeWidth={2} style={{ opacity: 0.5 }} />
                  )}
                </button>
              ) : (
                <span
                  style={{
                    color: color.textMuted,
                    fontWeight: weight.semibold,
                    fontSize: text.xs,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                  }}
                >
                  {col.header}
                </span>
              )}
            </HeaderCell>
          );
        })}
      </div>

      {/* BODY */}
      {rows.length === 0 ? (
        empty
      ) : (
        rows.map((row, idx) => {
          const id = getRowId(row);
          const isActive = activeRowId === id;
          const isSelected = selection?.selected.has(id) || false;
          return (
            <Row
              key={id}
              gridTemplate={gridTemplate}
              height={rowHeight[density]}
              isActive={isActive}
              isSelected={isSelected}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onContextMenu={
                onRowContextMenu ? (e) => onRowContextMenu(row, e) : undefined
              }
              isLast={idx === rows.length - 1}
            >
              {hasSelection && (
                <BodyCell padding={cellPadding[density]}>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => toggleSelectRow(id, e)}
                    aria-label={`Seleccionar fila ${id}`}
                  />
                </BodyCell>
              )}
              {columns.map((col) => (
                <BodyCell key={col.id} align={col.align || 'left'} padding={cellPadding[density]}>
                  {col.cell(row, idx)}
                </BodyCell>
              ))}
            </Row>
          );
        })
      )}
    </div>
  );
}

/* ============================================================
 *  Sub-componentes
 * ============================================================ */

function HeaderCell({
  children,
  align = 'left',
  padding,
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  padding: number;
}) {
  return (
    <div
      style={{
        padding: `0 ${padding}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

function Row({
  children,
  gridTemplate,
  height,
  isActive,
  isSelected,
  onClick,
  onContextMenu,
  isLast,
}: {
  children: ReactNode;
  gridTemplate: string;
  height: number;
  isActive: boolean;
  isSelected: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  isLast: boolean;
}) {
  const rowClass = `dt-row${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}`;

  return (
    <div
      role="row"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={rowClass}
      style={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        alignItems: 'center',
        height,
        borderBottom: isLast ? 'none' : `1px solid ${color.border}`,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        // Skip rendering off-screen rows. Es ~70% del beneficio de
        // virtualización con cero código JS — el browser hace lazy
        // layout. contain-intrinsic-size le da una altura provisional
        // para que el scroll no salte cuando una fila entra al viewport.
        contentVisibility: 'auto',
        containIntrinsicSize: `auto ${height}px`,
      }}
    >
      {/* Indicador izquierdo cuando la row está activa (drawer abierto) */}
      {isActive && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: color.primary,
          }}
        />
      )}
      {children}
    </div>
  );
}

function BodyCell({
  children,
  align = 'left',
  padding,
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  padding: number;
}) {
  return (
    <div
      style={{
        padding: `0 ${padding}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        minWidth: 0,
        fontSize: text.sm,
        color: color.text,
      }}
    >
      {children}
    </div>
  );
}

/* ============================================================
 *  Checkbox (compartido)
 * ============================================================ */

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  'aria-label'?: string;
}

function Checkbox({ checked, indeterminate, onChange, onClick, ...rest }: CheckboxProps) {
  const filled = checked || indeterminate;

  return (
    <button
      onClick={(e) => {
        if (onClick) onClick(e);
        else onChange?.();
      }}
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      className={`dt-checkbox${filled ? ' filled' : ''}`}
      {...rest}
    >
      {indeterminate ? (
        <svg width="10" height="2" viewBox="0 0 10 2">
          <rect width="10" height="2" rx="1" fill="currentColor" />
        </svg>
      ) : checked ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : null}
    </button>
  );
}

/* ============================================================
 *  Helpers de sort
 * ============================================================ */

/**
 * Aplica un sort sobre rows. Manejá strings, números y Dates.
 * Si le pasás una sortFn custom en la columna, se usa esa.
 */
export function applySort<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  sort: { columnId: string; direction: 'asc' | 'desc' } | null,
  defaultAccessor: (row: T, columnId: string) => unknown
): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.id === sort.columnId);
  if (!col) return rows;
  const sorted = [...rows].sort((a, b) => {
    if (col.sortFn) return col.sortFn(a, b);
    const va = defaultAccessor(a, col.id);
    const vb = defaultAccessor(b, col.id);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va).localeCompare(String(vb), 'es', { numeric: true });
  });
  return sort.direction === 'asc' ? sorted : sorted.reverse();
}
