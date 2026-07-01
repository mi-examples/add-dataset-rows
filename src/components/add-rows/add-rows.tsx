import { useEffect, useMemo, useState } from 'react';
import styles from './add-rows.module.scss';
import {
  addDatasetRow,
  getDatasetColumns,
  getLastRows,
  listDatasets,
  type Dataset,
  type DatasetColumn,
  type DatasetDataRow,
  type DatasetRow,
} from '../../api/mi';

/** Maps an MI column value_type to an appropriate HTML input type. */
function inputTypeFor(valueType: string): string {
  switch (valueType) {
    case 'numeric':
      return 'number';
    case 'datetime':
      return 'date';
    default:
      return 'text';
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Best-effort value_type guess for a freshly defined column (MI detects the real type). */
function inferType(value: string): string {
  const v = value.trim();

  if (v !== '' && !Number.isNaN(Number(v))) {
    return 'numeric';
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    return 'datetime';
  }

  return 'text';
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Read a row's value for a column, tolerating reference_name/column_name/case differences. */
function cellValue(row: DatasetDataRow, col: DatasetColumn): string {
  for (const key of [col.reference_name, col.column_name]) {
    if (key in row) {
      return formatValue(row[key]);
    }
  }

  const lower = col.reference_name.toLowerCase();

  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lower) {
      return formatValue(row[key]);
    }
  }

  return '';
}

export default function AddRows() {
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | ''>('');

  // Load the dataset list once.
  useEffect(() => {
    let cancelled = false;

    listDatasets()
      .then((list) => {
        if (!cancelled) {
          setDatasets(list);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDatasetsError(messageOf(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDataset = useMemo(() => datasets?.find((d) => d.id === selectedId) ?? null, [datasets, selectedId]);

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Dataset</span>
        {datasetsError ? (
          <span className={styles.error}>{datasetsError}</span>
        ) : (
          <select
            className={`${styles.control} ${styles.select}`}
            value={selectedId}
            disabled={!datasets}
            onChange={(e) => setSelectedId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">{datasets ? 'Select a dataset…' : 'Loading datasets…'}</option>
            {datasets?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </label>

      {selectedDataset && (
        // Remount on dataset change so per-dataset state (columns, entered
        // values, messages) resets cleanly.
        <DatasetRowForm
          key={selectedDataset.id}
          datasetId={selectedDataset.id}
          keepsHistory={selectedDataset.keep_history === 'Y'}
        />
      )}
    </div>
  );
}

interface DatasetRowFormProps {
  datasetId: number;
  keepsHistory: boolean;
}

function DatasetRowForm({ datasetId, keepsHistory }: DatasetRowFormProps) {
  const [columns, setColumns] = useState<DatasetColumn[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [columnsError, setColumnsError] = useState<string | null>(null);

  const [values, setValues] = useState<DatasetRow>({});
  const [measurementDate, setMeasurementDate] = useState<string>(today());

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [rows, setRows] = useState<DatasetDataRow[] | null>(null);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);

  // Load this dataset's columns on mount.
  useEffect(() => {
    let cancelled = false;

    getDatasetColumns(datasetId)
      .then((cols) => {
        if (!cancelled) {
          setColumns(cols);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setColumnsError(messageOf(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  // Load the recent rows on mount.
  useEffect(() => {
    let cancelled = false;

    getLastRows(datasetId, 10)
      .then((result) => {
        if (!cancelled) {
          setRows(result.rows);
          setRowsTotal(result.total);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRowsError(messageOf(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRowsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  // After columns are created from scratch: switch to the normal form immediately
  // (optimistic), then reconcile with MI's actual column definitions and load rows.
  function handleColumnsCreated(created: DatasetColumn[]) {
    setColumns(created);
    setSuccessMessage('Columns created and first row added.');
    void reconcileColumns();
    void refreshRows();
  }

  async function reconcileColumns() {
    try {
      const fresh = await getDatasetColumns(datasetId, { bustCache: true });

      if (fresh.length > 0) {
        setColumns(fresh);
      }
    } catch {
      // Keep the optimistic columns if the reconcile read fails.
    }
  }

  // Refresh the recent-rows table after adding a row (called from an event handler).
  async function refreshRows() {
    setRowsLoading(true);
    setRowsError(null);

    try {
      const { rows: latest, total } = await getLastRows(datasetId, 10);

      setRows(latest);
      setRowsTotal(total);
    } catch (err: unknown) {
      setRowsError(messageOf(err));
    } finally {
      setRowsLoading(false);
    }
  }

  const allFilled =
    !!columns && columns.length > 0 && columns.every((col) => (values[col.reference_name] ?? '').trim() !== '');

  const canSubmit = allFilled && (!keepsHistory || measurementDate !== '') && !submitting;

  function handleValueChange(referenceName: string, value: string) {
    setValues((prev) => ({ ...prev, [referenceName]: value }));
    setSuccessMessage(null);
    setSubmitError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!columns) {
      return;
    }

    const row: DatasetRow = {};

    for (const col of columns) {
      row[col.reference_name] = (values[col.reference_name] ?? '').trim();
    }

    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      await addDatasetRow(datasetId, row, {
        measurementTime: keepsHistory ? measurementDate : undefined,
      });
      setSuccessMessage('Row added successfully.');
      // Keep the dataset selected; clear values ready for the next row.
      setValues({});
      void refreshRows();
    } catch (err: unknown) {
      setSubmitError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className={styles.muted}>Loading columns…</p>;
  }

  if (columnsError) {
    return <p className={styles.error}>{columnsError}</p>;
  }

  if (!columns || columns.length === 0) {
    return <DefineColumns datasetId={datasetId} keepsHistory={keepsHistory} onCreated={handleColumnsCreated} />;
  }

  const form = (
    <form className={styles.fields} onSubmit={handleSubmit}>
      {columns.map((col) => (
        <label key={col.reference_name} className={styles.field}>
          <span className={styles.label}>{col.column_name}</span>
          <input
            className={styles.control}
            type={inputTypeFor(col.value_type)}
            value={values[col.reference_name] ?? ''}
            onChange={(e) => handleValueChange(col.reference_name, e.target.value)}
            disabled={submitting}
          />
        </label>
      ))}

      {keepsHistory && (
        <label className={styles.field}>
          <span className={styles.label}>Measurement date</span>
          <input
            className={styles.control}
            type="date"
            value={measurementDate}
            onChange={(e) => setMeasurementDate(e.target.value)}
            disabled={submitting}
          />
        </label>
      )}

      <button className={styles.submit} type="submit" disabled={!canSubmit}>
        {submitting ? 'Adding…' : 'Add Row'}
      </button>

      {submitError && <p className={styles.error}>{submitError}</p>}
      {successMessage && <p className={styles.success}>{successMessage}</p>}
    </form>
  );

  const table = (
    <section className={styles.recent}>
      <h2 className={styles.recentTitle}>Last 10 rows</h2>

      {!rowsLoading && !rowsError && rows && rows.length > 0 && (
        <p className={styles.recentCaption}>
          Showing last {rows.length} of {rowsTotal}
        </p>
      )}

      {rowsLoading && <p className={styles.muted}>Loading rows…</p>}
      {rowsError && <p className={styles.error}>{rowsError}</p>}
      {!rowsLoading && !rowsError && rows && rows.length === 0 && <p className={styles.muted}>No rows yet.</p>}

      {!rowsError && rows && rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.reference_name} className={col.value_type === 'numeric' ? styles.numeric : undefined}>
                    {col.column_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((col) => (
                    <td key={col.reference_name} className={col.value_type === 'numeric' ? styles.numeric : undefined}>
                      {cellValue(row, col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <>
      {form}
      {table}
    </>
  );
}

interface DefineColumnsProps {
  datasetId: number;
  keepsHistory: boolean;
  onCreated: (columns: DatasetColumn[]) => void;
}

interface DraftColumn {
  id: number;
  name: string;
  value: string;
}

// Monotonic id source for draft-column React keys (uniqueness is all that matters).
let draftColumnSeq = 0;

function makeDraftColumn(): DraftColumn {
  return { id: draftColumnSeq++, name: '', value: '' };
}

function DefineColumns({ datasetId, keepsHistory, onCreated }: DefineColumnsProps) {
  const [draft, setDraft] = useState<DraftColumn[]>(() => [makeDraftColumn(), makeDraftColumn()]);
  const [measurementDate, setMeasurementDate] = useState<string>(today());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDraft(id: number, patch: Partial<DraftColumn>) {
    setDraft((prev) => prev.map((col) => (col.id === id ? { ...col, ...patch } : col)));
    setError(null);
  }

  function addColumn() {
    setDraft((prev) => [...prev, makeDraftColumn()]);
  }

  function removeColumn(id: number) {
    setDraft((prev) => (prev.length > 1 ? prev.filter((col) => col.id !== id) : prev));
  }

  const names = draft.map((col) => col.name.trim());
  const namesFilled = names.every((name) => name !== '');
  const namesUnique = new Set(names.map((name) => name.toLowerCase())).size === names.length;
  const valuesFilled = draft.every((col) => col.value.trim() !== '');
  const canSubmit =
    namesFilled && namesUnique && valuesFilled && (!keepsHistory || measurementDate !== '') && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const row: DatasetRow = {};

    for (const col of draft) {
      row[col.name.trim()] = col.value.trim();
    }

    setSubmitting(true);
    setError(null);

    try {
      await addDatasetRow(datasetId, row, {
        measurementTime: keepsHistory ? measurementDate : undefined,
      });
      onCreated(
        draft.map((col) => ({
          reference_name: col.name.trim(),
          column_name: col.name.trim(),
          value_type: inferType(col.value),
        })),
      );
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.fields} onSubmit={handleSubmit}>
      <p className={styles.notice}>
        This dataset has no columns yet. Define the columns and the first row to get started — column types are detected
        automatically from the values.
      </p>

      {draft.map((col, index) => (
        <div key={col.id} className={styles.draftColumn}>
          <div className={styles.draftHeader}>
            <span className={styles.label}>Column {index + 1}</span>
            {draft.length > 1 && (
              <button
                type="button"
                className={styles.removeColumn}
                onClick={() => removeColumn(col.id)}
                disabled={submitting}
              >
                Remove
              </button>
            )}
          </div>
          <input
            className={styles.control}
            placeholder="Column name"
            value={col.name}
            onChange={(e) => updateDraft(col.id, { name: e.target.value })}
            disabled={submitting}
          />
          <input
            className={styles.control}
            placeholder="First value"
            value={col.value}
            onChange={(e) => updateDraft(col.id, { value: e.target.value })}
            disabled={submitting}
          />
        </div>
      ))}

      <button type="button" className={styles.addColumn} onClick={addColumn} disabled={submitting}>
        + Add column
      </button>

      {keepsHistory && (
        <label className={styles.field}>
          <span className={styles.label}>Measurement date</span>
          <input
            className={styles.control}
            type="date"
            value={measurementDate}
            onChange={(e) => setMeasurementDate(e.target.value)}
            disabled={submitting}
          />
        </label>
      )}

      <button className={styles.submit} type="submit" disabled={!canSubmit}>
        {submitting ? 'Creating…' : 'Create columns & add row'}
      </button>

      {!namesUnique && <p className={styles.error}>Column names must be unique.</p>}
      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}
