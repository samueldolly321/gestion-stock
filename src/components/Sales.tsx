import React, { useMemo, useState } from 'react';
import {
  ShoppingCart, ChevronLeft, ChevronRight, Download, Eye, X, Printer, FileText, Receipt, Coins,
} from 'lucide-react';
import { Sale, TransactionItem, User } from '../types';
import { useMoney } from '../services/CurrencyContext';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import { showToast } from '../services/toast';
import Pagination, { usePagination } from './Pagination';

interface SalesProps {
  sales: Sale[];
  user: User;
  currencySymbol: string;
  company?: { name?: string; address?: string; phone?: string; taxId?: string };
}

type Gran = 'day' | 'month' | 'year';

const PAY_META: Record<string, { label: string; cls: string }> = {
  unpaid: { label: 'Non payé', cls: 'bg-red-500/10 text-red-500' },
  partially_paid: { label: 'Partiel', cls: 'bg-amber-500/10 text-amber-500' },
  paid: { label: 'Payé', cls: 'bg-emerald-500/10 text-emerald-500' },
};

// Bornes [début, fin] + libellé de la période selon la granularité et la date d'ancrage.
function periodRange(gran: Gran, anchor: Date) {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate();
  if (gran === 'year') {
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999), label: `Année ${y}` };
  }
  if (gran === 'day') {
    const lbl = anchor.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return { start: new Date(y, m, d, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999), label: lbl.charAt(0).toUpperCase() + lbl.slice(1) };
  }
  const label = anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999), label: label.charAt(0).toUpperCase() + label.slice(1) };
}

export default function Sales({ sales, user, currencySymbol, company }: SalesProps) {
  const { format } = useMoney();
  const [gran, setGran] = useState<Gran>('day');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [search, setSearch] = useState('');

  const [viewTarget, setViewTarget] = useState<Sale | null>(null);   // détail
  const [receipt, setReceipt] = useState<Sale | null>(null);          // réimpression
  const [printFormat, setPrintFormat] = useState<'ticket' | 'a4'>('ticket');

  const range = useMemo(() => periodRange(gran, anchor), [gran, anchor]);

  const shift = (dir: number) => setAnchor((a) => {
    const d = new Date(a);
    if (gran === 'year') d.setFullYear(d.getFullYear() + dir);
    else if (gran === 'day') d.setDate(d.getDate() + dir);
    else d.setMonth(d.getMonth() + dir);
    return d;
  });

  // Ventes de la période (hors avoirs), triées récentes d'abord, filtrées par recherche.
  const periodSales = useMemo(() => {
    const s0 = range.start.getTime(), s1 = range.end.getTime();
    const q = search.toLowerCase();
    return sales
      .filter((s) => s.type !== 'return')
      .filter((s) => { const t = new Date(s.createdAt).getTime(); return t >= s0 && t <= s1; })
      .filter((s) => !q
        || (s.invoiceNumber || s.id).toLowerCase().includes(q)
        || (s.clientName || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sales, range, search]);

  const totals = useMemo(() => {
    const ca = periodSales.reduce((a, s) => a + (Number(s.totalAmount) || 0), 0);
    const paid = periodSales.reduce((a, s) => a + (Number(s.paidAmount) || 0), 0);
    return { count: periodSales.length, ca, paid, due: ca - paid };
  }, [periodSales]);

  const page = usePagination<Sale>(periodSales);

  const exportCols = [
    { label: 'N° Facture', value: (s: Sale) => s.invoiceNumber || s.id },
    { label: 'Date', value: (s: Sale) => new Date(s.createdAt).toLocaleString() },
    { label: 'Client', value: (s: Sale) => s.clientName || '' },
    { label: 'Total TTC', value: (s: Sale) => s.totalAmount },
    { label: 'Encaissé', value: (s: Sale) => s.paidAmount || 0 },
    { label: 'Reste dû', value: (s: Sale) => s.totalAmount - (s.paidAmount || 0) },
    { label: 'Paiement', value: (s: Sale) => PAY_META[s.paymentStatus]?.label || s.paymentStatus },
    { label: 'Caissier', value: (s: Sale) => s.cashierName || '' },
  ];
  const handleExport = (fmt: 'pdf' | 'excel') => {
    const title = `Ventes — ${range.label}`;
    if (fmt === 'excel') exportExcel('ventes', title, exportCols, periodSales);
    else exportPdf('ventes', title, exportCols, periodSales);
    showToast(`${periodSales.length} vente(s) exportée(s) (${fmt.toUpperCase()}).`, { title: 'Export' });
  };

  const inputCls = 'w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

  const GranBtn = ({ g, label }: { g: Gran; label: string }) => (
    <button
      onClick={() => setGran(g)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
        gran === g ? 'bg-cyan-500/15 text-cyan-500 border border-cyan-500/30' : 'bg-white dark:bg-slate-950/20 text-slate-500 border border-slate-200 dark:border-slate-800'
      }`}
    >
      {label}
    </button>
  );

  const SummaryCard = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
    <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm">
      <span className="text-[10px] uppercase font-mono text-slate-400 block">{label}</span>
      <span className={`text-lg font-bold font-mono ${accent}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-cyan-500" />
            Journal des Ventes
          </h2>
          <p className="text-xs text-slate-400">Toutes les ventes par jour, mois ou année, avec synthèse et détails.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleExport('pdf')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5">
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
          <button onClick={() => handleExport('excel')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5">
            <Download className="w-4 h-4 text-green-700" /> Excel
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-white dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <GranBtn g="day" label="Jour" />
          <GranBtn g="month" label="Mois" />
          <GranBtn g="year" label="Année" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-bold text-slate-900 dark:text-white min-w-[180px] text-center">{range.label}</span>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => setAnchor(new Date())} className="ml-1 text-[11px] text-cyan-500 hover:underline">Aujourd'hui</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Nombre de ventes" value={String(totals.count)} accent="text-slate-900 dark:text-white" />
        <SummaryCard label="Chiffre d'affaires TTC" value={format(totals.ca)} accent="text-cyan-500" />
        <SummaryCard label="Encaissé" value={format(totals.paid)} accent="text-emerald-500" />
        <SummaryCard label="Reste dû (créances)" value={format(totals.due)} accent="text-red-500" />
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <input type="text" placeholder="Rechercher par n° facture ou client..." value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls} />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">N° Facture</th>
                <th className="py-3 px-4 hidden md:table-cell">Date</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4 text-right">Total TTC</th>
                <th className="py-3 px-4 text-right hidden md:table-cell">Reste dû</th>
                <th className="py-3 px-4 text-center">Paiement</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs text-slate-600 dark:text-gray-300">
              {periodSales.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">Aucune vente sur cette période.</td></tr>
              ) : (
                page.paged.map((s) => {
                  const reste = s.totalAmount - (s.paidAmount || 0);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition cursor-pointer" onClick={() => setViewTarget(s)}>
                      <td className="py-3 px-4 font-mono font-bold text-[11px] text-cyan-500">{s.invoiceNumber || s.id}</td>
                      <td className="py-3 px-4 hidden md:table-cell font-mono text-[11px] text-slate-400">{new Date(s.createdAt).toLocaleString()}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{s.clientName || '—'}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">{format(s.totalAmount)}</td>
                      <td className="py-3 px-4 text-right hidden md:table-cell font-mono">{reste > 0 ? <span className="text-red-500 font-bold">{format(reste)}</span> : <span className="text-emerald-500">0</span>}</td>
                      <td className="py-3 px-4 text-center"><span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${PAY_META[s.paymentStatus]?.cls}`}>{PAY_META[s.paymentStatus]?.label || s.paymentStatus}</span></td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => setViewTarget(s)} title="Détail" className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { setReceipt(s); setPrintFormat('ticket'); }} title="Réimprimer le reçu" className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page.page} pageCount={page.pageCount} total={page.total} from={page.from} to={page.to} onChange={page.setPage} />
      </div>

      {/* Détail modal */}
      {viewTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in text-xs flex flex-col max-h-[85vh]">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Vente {viewTarget.invoiceNumber || viewTarget.id}</h3>
                <p className="text-[10px] text-slate-400">{viewTarget.clientName} · {new Date(viewTarget.createdAt).toLocaleString()} · {viewTarget.cashierName}</p>
              </div>
              <button onClick={() => setViewTarget(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {(viewTarget.items || []).map((it: TransactionItem, i) => (
                <div key={i} className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-lg">
                  <div className="min-w-0"><span className="font-semibold text-slate-900 dark:text-white block truncate">{it.productName || it.productId}</span><span className="text-[10px] text-slate-400">{it.quantity} × {format(it.unitPrice)}</span></div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{format(it.quantity * it.unitPrice)}</span>
                </div>
              ))}
              {viewTarget.notes && <p className="text-[11px] text-slate-500 italic pt-1">Note : {viewTarget.notes}</p>}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 font-mono text-slate-500 space-y-1">
                <div className="flex justify-between"><span>TVA</span><span>{format(viewTarget.vatAmount)}</span></div>
                <div className="flex justify-between text-sm font-bold font-sans text-slate-900 dark:text-white"><span>Total TTC</span><span>{format(viewTarget.totalAmount)}</span></div>
                <div className="flex justify-between"><span>Encaissé</span><span className="text-emerald-500">{format(viewTarget.paidAmount || 0)}</span></div>
                {viewTarget.totalAmount - (viewTarget.paidAmount || 0) > 0 && (
                  <div className="flex justify-between font-bold text-red-500"><span>Reste dû</span><span>{format(viewTarget.totalAmount - (viewTarget.paidAmount || 0))}</span></div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button onClick={() => { setReceipt(viewTarget); setPrintFormat('ticket'); setViewTarget(null); }} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg cursor-pointer flex items-center gap-1.5">
                <Printer className="w-4 h-4" /> Réimprimer
              </button>
              <button onClick={() => setViewTarget(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-semibold rounded-lg cursor-pointer">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Reçu réimprimable */}
      {receipt && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <style>{`@media print { @page { size: ${printFormat === 'a4' ? 'A4' : '80mm auto'}; margin: ${printFormat === 'a4' ? '15mm' : '4mm'}; } }`}</style>
          <div className={`bg-white text-slate-950 rounded-2xl w-full ${printFormat === 'a4' ? 'max-w-md print-a4-card' : 'max-w-sm'} overflow-hidden shadow-2xl p-6 space-y-4 print-card animate-scale-up`}>
            <div className="text-center space-y-1">
              <span className="font-bold tracking-tight text-lg uppercase">{company?.name || 'Vokatra-ko ERP'}</span>
              {company?.address && <p className="text-[10px] text-slate-500">{company.address}</p>}
              {company?.phone && <p className="text-[10px] text-slate-500">Tél: {company.phone}</p>}
              {company?.taxId && <p className="text-[10px] text-slate-500">NIF / Stat: {company.taxId}</p>}
              <div className="border-b border-dashed border-slate-300 py-1"></div>
            </div>

            <div className="text-[10px] space-y-1">
              <div className="flex justify-between"><span>Facture N° :</span><span className="font-bold">{receipt.invoiceNumber || receipt.id}</span></div>
              <div className="flex justify-between"><span>Date :</span><span>{new Date(receipt.createdAt).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Caissier :</span><span>{receipt.cashierName}</span></div>
              <div className="flex justify-between"><span>Client :</span><span className="font-bold">{receipt.clientName}</span></div>
              <div className="border-b border-dashed border-slate-300 py-1"></div>
            </div>

            <div className="space-y-1.5 text-[11px]">
              {receipt.items.map((item) => (
                <div key={item.productId} className="flex justify-between items-start">
                  <div><span>{item.productName}</span><span className="text-[9px] text-slate-500 block">{item.quantity} x {format(item.unitPrice)}</span></div>
                  <span className="font-mono">{format(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
              <div className="border-b border-dashed border-slate-300 py-1"></div>
            </div>

            <div className="text-xs space-y-1 text-right font-mono">
              <div className="flex justify-between"><span>TVA :</span><span>{format(receipt.vatAmount)}</span></div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-1 text-slate-950 font-sans"><span>TOTAL TTC :</span><span>{format(receipt.totalAmount)}</span></div>
              {receipt.paidAmount < receipt.totalAmount && (
                <>
                  <div className="flex justify-between"><span>Payé :</span><span>{format(receipt.paidAmount)}</span></div>
                  <div className="flex justify-between font-bold text-red-600"><span>Reste dû :</span><span>{format(receipt.totalAmount - receipt.paidAmount)}</span></div>
                </>
              )}
            </div>

            <div className="text-center pt-2 text-[10px] text-slate-500 border-t border-dashed border-slate-300">
              <p>Moyen de paiement: <strong className="uppercase">{receipt.paymentMethod}</strong></p>
              {receipt.notes && <p className="mt-0.5">{receipt.notes}</p>}
              <p className="mt-1 flex items-center justify-center gap-1"><Coins className="w-3 h-3" /> Points fidélité: +{receipt.loyaltyPointsEarned}</p>
              <p className="font-bold mt-2">Merci de votre visite !</p>
            </div>

            <div className="pt-3 space-y-2.5 no-print">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1.5">Format d'impression</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPrintFormat('ticket')} className={`py-2 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${printFormat === 'ticket' ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                    <Receipt className="w-3.5 h-3.5" /> Ticket (80mm)
                  </button>
                  <button type="button" onClick={() => setPrintFormat('a4')} className={`py-2 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${printFormat === 'a4' ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                    <FileText className="w-3.5 h-3.5" /> Facture A4
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1.5">
                  <Printer className="w-4 h-4" /> Imprimer ({printFormat === 'a4' ? 'A4' : 'Ticket'})
                </button>
                <button onClick={() => setReceipt(null)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-xs cursor-pointer">Fermer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
