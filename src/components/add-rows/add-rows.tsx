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

  // Refresh the recent-rows table after adding a row (called from an event handler).
  async function refreshRows() {
    setRowsLoading(true);
    setRowsError(null);

    try {
      const { rows: latest } = await getLastRows(datasetId, 10);

      setRows(latest);
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
    return <p className={styles.error}>This dataset has no editable columns.</p>;
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
