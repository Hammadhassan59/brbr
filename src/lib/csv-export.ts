/**
 * Build a CSV string from headers + 2D row data. Standard quoting rules: any
 * field containing comma, quote, or newline gets wrapped in double quotes,
 * and embedded quotes are doubled. Excel and Google Sheets both consume this.
 */
export function rowsToCSV(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ];
  return lines.join('\n');
}
