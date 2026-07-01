/**
 * Thin client for the Metric Insights REST API.
 *
 * All requests use root-relative `/api/...` paths so they resolve against the MI
 * instance that serves this app:
 *  - In production the app is served from the MI domain, so the browser session
 *    cookie authenticates each request automatically.
 *  - During `npm run dev` the pp-dev proxy forwards `/api/*` to `backendBaseURL`
 *    and injects authentication (`MI_ACCESS_TOKEN` / interactive login).
 *
 * `api/*` routes are exempt from CSRF on the MI backend, so no token is required.
 */

export interface Dataset {
  id: number;
  name: string;
  /**
   * 'Y' when the dataset stores historical instances. Such datasets require a
   * `measurement_time` on every import.
   */
  keep_history?: string;
}

export interface DatasetColumn {
  /** Internal column identifier — used as the key when sending row data. */
  reference_name: string;
  /** Human-readable column label. */
  column_name: string;
  /** 'numeric' | 'datetime' | 'text'. */
  value_type: string;
}

/** A single row, keyed by column `reference_name`. */
export type DatasetRow = Record<string, string>;

interface ApiEnvelope {
  status?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error('Could not reach the Metric Insights server.');
  }

  let body: ApiEnvelope = {};

  try {
    body = (await res.json()) as ApiEnvelope;
  } catch {
    // Non-JSON response (e.g. an HTML login page when the session expired).
    if (!res.ok) {
      throw new Error(`Request failed (HTTP ${res.status}).`);
    }
  }

  if (!res.ok || body.status === 'ERROR') {
    throw new Error(body.message || body.error || `Request failed (HTTP ${res.status}).`);
  }

  return body as T;
}

/** List datasets the current user can see. */
export async function listDatasets(): Promise<Dataset[]> {
  const body = await apiFetch<{ datasets?: Dataset[] }>('/api/dataset');

  return (body.datasets ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
}

/** Get the column definitions for a dataset, in display order. */
export async function getDatasetColumns(
  datasetId: number,
  options: { bustCache?: boolean } = {},
): Promise<DatasetColumn[]> {
  // The dev proxy caches GETs; bust it when reading columns right after creating them.
  const cacheBuster = options.bustCache ? `&_=${Date.now()}` : '';
  const body = await apiFetch<{ dataset_columns?: DatasetColumn[] }>(
    `/api/dataset_column?dataset=${encodeURIComponent(datasetId)}${cacheBuster}`,
  );

  return body.dataset_columns ?? [];
}

/** A row returned from the dataset, keyed by column identifier. */
export type DatasetDataRow = Record<string, unknown>;

/**
 * Fetch the last `count` rows of a dataset, in the dataset's natural order.
 *
 * The read API has no exposed insertion-order key, so we read the total row
 * count (`amount`) and offset to the tail to get the most recent rows.
 */
export async function getLastRows(datasetId: number, count = 10): Promise<{ rows: DatasetDataRow[]; total: number }> {
  const url = `/api/dataset_data?dataset=${encodeURIComponent(datasetId)}`;
  const jsonHeaders = { 'Content-Type': 'application/json' };

  const countRes = await apiFetch<{ amount?: number }>(url, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ amount: 'Y', limit: 1 }),
  });

  const total = countRes.amount ?? 0;

  if (total === 0) {
    return { rows: [], total: 0 };
  }

  const offset = Math.max(0, total - count);
  const dataRes = await apiFetch<{ data?: DatasetDataRow[] }>(url, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ offset, limit: count }),
  });

  return { rows: Array.isArray(dataRes.data) ? dataRes.data : [], total };
}

export interface AddRowOptions {
  /**
   * Required when the dataset keeps history. Format: 'YYYY-MM-DD' or
   * 'YYYY-MM-DD HH:mm:ss'.
   */
  measurementTime?: string;
  /**
   * When true (default) the row is appended to existing data. Appending reads the
   * dataset's storage table first — which does NOT exist for a never-populated
   * dataset — so pass false for the very first write, which provisions the table,
   * columns, and row. (There is nothing to append to on an empty dataset anyway.)
   */
  append?: boolean;
}

/**
 * Write a single row to a manual (CSV) dataset.
 *
 * The dataset's `data_fetch_method` must be 'manual' and the current user must
 * have edit permission on it; otherwise the API responds with an error that is
 * surfaced as the thrown message.
 */
export async function addDatasetRow(datasetId: number, row: DatasetRow, options: AddRowOptions = {}): Promise<void> {
  await apiFetch(`/api/dataset_data?dataset=${encodeURIComponent(datasetId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataset: datasetId,
      data: [row],
      append: options.append === false ? 'N' : 'Y',
      ...(options.measurementTime ? { measurement_time: options.measurementTime } : {}),
    }),
  });
}
