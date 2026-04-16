import { describe, it, expect } from 'vitest';
import { rowsToCSV } from '../src/lib/csv-export';

describe('rowsToCSV', () => {
  it('writes the header row first then data rows', () => {
    const csv = rowsToCSV(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('A,B\n1,2\n3,4');
  });

  it('handles null and undefined as empty cells', () => {
    const csv = rowsToCSV(['X', 'Y'], [[null, undefined]]);
    expect(csv).toBe('X,Y\n,');
  });

  it('quotes fields containing commas', () => {
    const csv = rowsToCSV(['A'], [['Lahore, Punjab']]);
    expect(csv).toBe('A\n"Lahore, Punjab"');
  });

  it('quotes fields containing newlines (Excel/Sheets-safe)', () => {
    const csv = rowsToCSV(['Notes'], [['line1\nline2']]);
    expect(csv).toBe('Notes\n"line1\nline2"');
  });

  it('escapes embedded double quotes by doubling them', () => {
    const csv = rowsToCSV(['Q'], [['She said "hi"']]);
    expect(csv).toBe('Q\n"She said ""hi"""');
  });

  it('handles numbers without quoting', () => {
    const csv = rowsToCSV(['N'], [[42], [-3]]);
    expect(csv).toBe('N\n42\n-3');
  });
});
