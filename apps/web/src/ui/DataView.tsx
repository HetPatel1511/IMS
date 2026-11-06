import type { HTMLAttributes, ReactNode } from 'react';

export type DataSort = { key: string; dir: 'asc' | 'desc' } | null;

export type Column<T> = {
  /** stable identity for the column */
  key: string;
  /** header content (string or node) */
  header: ReactNode;
  /** label used as the "key:" prefix in the mobile card layout; defaults to `header` when it's a string */
  cardLabel?: string;
  /** when set, the column is sortable and this is the key sent to the server `sort` param */
  sortKey?: string;
  /** numeric columns right-align and use tabular figures */
  align?: 'start' | 'end';
  render: (row: T) => ReactNode;
  cellClassName?: string;
};

type DataViewProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** accessible table name */
  caption: string;
  loading?: boolean;
  skeletonRows?: number;
  sort?: DataSort;
  /** called with a column's `sortKey` when its header is activated (drives the server sort) */
  onSort?: (key: string) => void;
  /** always-reachable per-row actions (pinned right on wide screens, full-width on cards) */
  actions?: (row: T) => ReactNode;
  /** rendered when there are no rows and not loading */
  empty?: ReactNode;
  rowClassName?: (row: T, index: number) => string | undefined;
  rowAttributes?: (row: T, index: number) => HTMLAttributes<HTMLTableRowElement>;
  /** extra className on the scroll wrapper */
  className?: string;
};

/**
 * The single responsive record list used across the app (A1–A5, B3, B4).
 *
 * - Renders a table on wide containers and stacked record cards on narrow ones,
 *   switching on the component's OWN width via a CSS container query — so row
 *   actions are never clipped at mid widths and the layout adapts to sidebar
 *   collapse, not just the viewport.
 * - Sort headers are real focusable buttons with `aria-sort`, and call `onSort`
 *   with the column's server `sortKey` (dataset-wide sorting, not page-local).
 * - Presentation only: it receives rows + callbacks and never touches the API.
 */
export function DataView<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading,
  skeletonRows = 6,
  sort,
  onSort,
  actions,
  empty,
  rowClassName,
  rowAttributes,
  className,
}: DataViewProps<T>) {
  if (!loading && rows.length === 0 && empty) {
    return <div className={`dataview${className ? ` ${className}` : ''}`}>{empty}</div>;
  }

  return (
    <div className={`dataview${className ? ` ${className}` : ''}`}>
      <div className="dv-scroll">
        <table className="dv-table" aria-label={caption}>
          <thead>
            <tr>
              {columns.map((col) => {
                const active = Boolean(col.sortKey && sort && sort.key === col.sortKey);
                const ariaSort = active
                  ? sort!.dir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : col.sortKey
                    ? 'none'
                    : undefined;
                return (
                  <th
                    key={col.key}
                    className={col.align === 'end' ? 'dv-end' : undefined}
                    aria-sort={ariaSort}
                    scope="col"
                  >
                    {col.sortKey && onSort ? (
                      <button
                        type="button"
                        className="dv-sort"
                        onClick={() => onSort(col.sortKey!)}
                      >
                        <span>{col.header}</span>
                        <span className="dv-sort-ind" aria-hidden>
                          {active ? (sort!.dir === 'asc' ? '▲' : '▼') : ''}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
              {actions ? (
                <th className="dv-actions-head" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, r) => (
                  <tr key={`sk-${r}`} aria-hidden>
                    {columns.map((col) => (
                      <td key={col.key} className={col.align === 'end' ? 'dv-end' : undefined}>
                        <span className="dv-skel-cell" />
                      </td>
                    ))}
                    {actions ? (
                      <td className="dv-actions-cell" data-label="">
                        <span className="dv-skel-cell" />
                      </td>
                    ) : null}
                  </tr>
                ))
              : rows.map((row, i) => {
                  const extra = rowAttributes?.(row, i) ?? {};
                  const cls = [rowClassName?.(row, i), extra.className].filter(Boolean).join(' ');
                  return (
                    <tr key={rowKey(row)} {...extra} className={cls || undefined}>
                      {columns.map((col) => {
                        const label =
                          col.cardLabel ?? (typeof col.header === 'string' ? col.header : '');
                        const cellCls = [
                          col.align === 'end' ? 'dv-end' : undefined,
                          col.cellClassName,
                        ]
                          .filter(Boolean)
                          .join(' ');
                        return (
                          <td key={col.key} data-label={label} className={cellCls || undefined}>
                            {col.render(row)}
                          </td>
                        );
                      })}
                      {actions ? (
                        <td className="dv-actions-cell" data-label="">
                          <div className="dv-actions">{actions(row)}</div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
