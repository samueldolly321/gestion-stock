// Export PDF via jsPDF + autotable : titre, en-tête coloré (cyan), lignes
// alternées, colonnes auto. Réutilise le même typage de colonnes que les autres exports.

import type { CsvColumn } from './exportCsv';
import { getExportCompany } from './exportContext';

export async function exportPdf<T>(
  filename: string,
  title: string,
  columns: CsvColumn<T>[],
  rows: T[],
): Promise<void> {
  // Chargement à la demande (garde jspdf hors du bundle initial).
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const company = getExportCompany();
  let y = 42;

  // Raison sociale en en-tête (si renseignée).
  if (company) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(0, 71, 171); // cobalt #0047ab
    doc.text(company, 40, y);
    y += 20;
  }

  // Titre du document + sous-titre.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(title, 40, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`${rows.length} ligne(s) — export du ${new Date().toLocaleString()}`, 40, y);

  autoTable(doc, {
    startY: y + 14,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => String(c.value(r) ?? ''))),
    styles: { fontSize: 8, cellPadding: 5, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [0, 71, 171], textColor: 255, fontStyle: 'bold', halign: 'left' }, // cobalt #0047ab
    alternateRowStyles: { fillColor: [241, 245, 249] }, // slate-100
    margin: { left: 40, right: 40 },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
