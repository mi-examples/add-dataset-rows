import type { DatasetColumn, DatasetDataRow } from '../api/mi';

/** Maps an MI column value_type to an appropriate HTML input type. */
export function inputTypeFor(valueType: string): string {
  switch (valueType) {
    case 'numeric':
      return 'number';
    case 'datetime':
      return 'date';
    default:
      return 'text';
  }
}

/** Best-effort value_type guess for a freshly defined column (MI detects the real type). */
export function inferType(value: string): string {
  const v = value.trim();

  if (v !== '' && !Number.isNaN(Number(v))) {
    return 'numeric';
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    return 'datetime';
  }

  return 'text';
}

/** Render any value as a display string (null/undefined → ''). */
export function formatValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Resolve which key in a read row holds a column's value, tolerating
 * reference_name / column_name / case differences. Returns undefined if absent.
 */
function resolveKey(row: DatasetDataRow, col: DatasetColumn): string | undefined {
  for (const key of [col.reference_name, col.column_name]) {
    if (key in row) {
      return key;
    }
  }

  const lower = col.reference_name.toLowerCase();

  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lower) {
      return key;
    }
  }

  return undefined;
}

/** Display value for a column (stringified). */
export function cellValue(row: DatasetDataRow, col: DatasetColumn): string {
  const key = resolveKey(row, col);

  return key === undefined ? '' : formatValue(row[key]);
}

/**
 * Raw value for a column, exactly as returned by the read (no coercion).
 * Used when rewriting the dataset so surviving rows are round-tripped unchanged.
 */
export function rawCellValue(row: DatasetDataRow, col: DatasetColumn): unknown {
  const key = resolveKey(row, col);

  return key === undefined ? '' : row[key];
}

/** Two rows are "the same" when every column's rendered value matches. */
export function rowsMatch(a: DatasetDataRow, b: DatasetDataRow, columns: DatasetColumn[]): boolean {
  return columns.every((col) => cellValue(a, col) === cellValue(b, col));
}

/**
 * Build a write payload keyed by reference_name, preserving each value as it was
 * read (no re-stringifying), so rewriting to delete one row does not reformat the
 * others.
 */
export function rowToRawPayload(row: DatasetDataRow, columns: DatasetColumn[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const col of columns) {
    payload[col.reference_name] = rawCellValue(row, col);
  }

  return payload;
}
