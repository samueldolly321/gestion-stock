// Export Excel natif (.xlsx) via ExcelJS, avec mise en forme : raison sociale
// en en-tête, ligne de titre colorée (cyan, texte blanc gras), bordures,
// largeurs de colonnes auto, lignes alternées.

import type { CsvColumn } from './exportCsv';
import { getExportCompany } from './exportContext';

const HEADER_BG = 'FF0047AB'; // cobalt #0047ab (accent Cobalt Sky)
const ROW_ALT_BG = 'FFF1F5F9'; // slate-100
const BORDER = { style: 'thin' as const, color: { argb: 'FFE2E8F0' } };

export async function exportExcel<T>(
  filename: string,
  sheetName: string,
  columns: CsvColumn<T>[],
  rows: T[],
): Promise<void> {
  // Chargement à la demande (garde exceljs hors du bundle initial).
  const ExcelJS = (await import('exceljs')).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vokatra-ko';
  const company = getExportCompany();

  const ws = wb.addWorksheet(sheetName);

  // Valeurs pré-calculées (sert aussi au calcul des largeurs).
  const values = rows.map((r) => columns.map((c) => c.value(r) ?? ''));

  // Largeurs de colonnes auto (bornées).
  columns.forEach((c, i) => {
    const maxCell = values.reduce((m, row) => Math.max(m, String(row[i]).length), 0);
    ws.getColumn(i + 1).width = Math.min(60, Math.max(c.label.length, maxCell) + 3);
  });

  let r = 1;

  // Ligne raison sociale (fusionnée sur toutes les colonnes), si renseignée.
  if (company) {
    ws.mergeCells(1, 1, 1, Math.max(1, columns.length));
    const cell = ws.getCell(1, 1);
    cell.value = company;
    cell.font = { name: 'Calibri', bold: true, size: 14, color: { argb: 'FF0047AB' } };
    cell.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 26;
    r = 2;
  }

  // Ligne d'en-tête colorée.
  const headerRowIndex = r;
  const headerRow = ws.getRow(headerRowIndex);
  headerRow.height = 22;
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
  });

  // Lignes de données (fond alterné + bordures).
  values.forEach((row, idx) => {
    const dataRow = ws.getRow(headerRowIndex + 1 + idx);
    const bg = idx % 2 ? ROW_ALT_BG : 'FFFFFFFF';
    row.forEach((v, i) => {
      const cell = dataRow.getCell(i + 1);
      cell.value = v as any;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle' };
      cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
    });
  });

  // Fige jusqu'à la ligne d'en-tête incluse.
  ws.views = [{ state: 'frozen', ySplit: headerRowIndex }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
