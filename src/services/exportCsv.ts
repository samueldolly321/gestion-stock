// Export CSV générique, compatible Excel (BOM UTF-8 pour les accents,
// séparateur point-virgule pour les locales FR, échappement des guillemets).

export interface CsvColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

const SEP = ';';

function escape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (s.includes('"') || s.includes(SEP) || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function exportCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const header = columns.map((c) => escape(c.label)).join(SEP);
  const body = rows.map((r) => columns.map((c) => escape(c.value(r))).join(SEP)).join('\r\n');
  const csv = '﻿' + header + '\r\n' + body; // BOM UTF-8

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
