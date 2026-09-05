// FR-RPT-011: "every report exports to PDF, CSV and XLSX." CSV is what this
// slice actually implements — it's the one format with no library or layout
// decision behind it, and covers the "get this into a spreadsheet" need that
// drives most real report-export requests. PDF/XLSX are a real gap, not
// faked here.
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
  return lines.join('\r\n');
}
