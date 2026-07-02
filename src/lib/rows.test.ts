import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DatasetColumn, DatasetDataRow } from '../api/mi.ts';
import {
  cellValue,
  columnsFromMetadata,
  inferType,
  inputTypeFor,
  rawCellValue,
  rowsMatch,
  rowToRawPayload,
} from './rows.ts';

const cols: DatasetColumn[] = [
  { reference_name: 'user', column_name: 'MI username', value_type: 'text' },
  { reference_name: 'amount', column_name: 'Amount', value_type: 'numeric' },
];

describe('inputTypeFor', () => {
  it('maps MI value types to HTML input types', () => {
    assert.equal(inputTypeFor('numeric'), 'number');
    assert.equal(inputTypeFor('datetime'), 'date');
    assert.equal(inputTypeFor('text'), 'text');
    assert.equal(inputTypeFor('anything-else'), 'text');
  });
});

describe('inferType', () => {
  it('detects numeric, datetime, and text from a value', () => {
    assert.equal(inferType('100'), 'numeric');
    assert.equal(inferType('3.14'), 'numeric');
    assert.equal(inferType('  5  '), 'numeric');
    assert.equal(inferType('2026-06-30'), 'datetime');
    assert.equal(inferType('abc'), 'text');
    assert.equal(inferType(''), 'text');
  });
});

describe('cellValue', () => {
  it('resolves by reference_name', () => {
    const row: DatasetDataRow = { user: 'bob', amount: 5 };

    assert.equal(cellValue(row, cols[0]), 'bob');
    assert.equal(cellValue(row, cols[1]), '5');
  });

  it('falls back to column_name, then case-insensitive match', () => {
    assert.equal(cellValue({ 'MI username': 'bob' }, cols[0]), 'bob');
    assert.equal(cellValue({ AMOUNT: 7 }, cols[1]), '7');
  });

  it('renders missing and null values as empty strings', () => {
    assert.equal(cellValue({}, cols[0]), '');
    assert.equal(cellValue({ user: null }, cols[0]), '');
  });
});

describe('rawCellValue', () => {
  it('preserves the raw value without coercion', () => {
    assert.equal(rawCellValue({ amount: 5 }, cols[1]), 5); // number stays a number
    assert.equal(rawCellValue({ user: 'x' }, cols[0]), 'x');
    assert.equal(rawCellValue({ user: null }, cols[0]), null);
  });

  it('returns empty string when the column is absent', () => {
    assert.equal(rawCellValue({}, cols[0]), '');
  });
});

describe('rowsMatch', () => {
  it('matches on rendered values across all columns', () => {
    const a: DatasetDataRow = { user: 'a', amount: 1 };

    assert.equal(rowsMatch(a, { user: 'a', amount: 1 }, cols), true);
    assert.equal(rowsMatch(a, { user: 'a', amount: 2 }, cols), false);
    // number vs numeric-string render the same, so they match
    assert.equal(rowsMatch(a, { user: 'a', amount: '1' }, cols), true);
  });
});

describe('rowToRawPayload', () => {
  it('keys by reference_name and preserves raw values', () => {
    const row: DatasetDataRow = { 'MI username': 'bob', Amount: 5 };
    const payload = rowToRawPayload(row, cols);

    assert.deepEqual(payload, { user: 'bob', amount: 5 });
    assert.equal(typeof payload.amount, 'number');
  });

  it('uses empty string for absent columns', () => {
    assert.deepEqual(rowToRawPayload({ user: 'x' }, cols), { user: 'x', amount: '' });
  });
});

describe('columnsFromMetadata', () => {
  const metadata = [
    { name: 'MI username', type: 'text' },
    { name: 'Amount', type: 'numeric' },
  ];

  it('takes reference_name from the first row keys, in column order', () => {
    const firstRow: DatasetDataRow = { user: 'bob', amount: 5 };
    const built = columnsFromMetadata(metadata, firstRow);

    assert.deepEqual(built, [
      { reference_name: 'user', column_name: 'MI username', value_type: 'text' },
      { reference_name: 'amount', column_name: 'Amount', value_type: 'numeric' },
    ]);
  });

  it('falls back to the display name as reference_name when there are no rows', () => {
    const built = columnsFromMetadata(metadata, undefined);

    assert.deepEqual(built, [
      { reference_name: 'MI username', column_name: 'MI username', value_type: 'text' },
      { reference_name: 'Amount', column_name: 'Amount', value_type: 'numeric' },
    ]);
  });

  it('returns no columns for empty metadata', () => {
    assert.deepEqual(columnsFromMetadata([], undefined), []);
  });
});
