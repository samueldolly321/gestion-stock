import React, { useState, useMemo } from 'react';
import { HandCoins, Wallet, History, X, Download, CheckCircle2, FileMinus2, Printer } from 'lucide-react';
import { Sale, Client, User, Payment } from '../types';
import { useMoney } from '../services/CurrencyContext';
import { paySale, createCreditNote } from '../services/salesService';
import { listPayments } from '../services/paymentsService';
import { getExportCompany } from '../services/exportContext';
import { showAlert } from '../services/dialog';
import { showToast } from '../services/toast';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import Pagination, { usePagination } from './Pagination';

interface ReceivablesProps {
  sales: Sale[];
  clients: Client[];
  user: User;
  onRefresh: () => void;
}

const PAY_META: Record<string, { label: string; cls: string }> = {
  unpaid: { label: 'Non payé', cls: 'bg-red-500/10 text-red-500' },
  partially_paid: { label: 'Partiel', cls: 'bg-amber-500/10 text-amber-500' },
  paid: { label: 'Payé', cls: 'bg-emerald-500/10 text-emerald-500' },
};

export default function Receivables({ sales, clients, user, onRefresh }: ReceivablesProps) {
  const { format } = useMoney();
  const canPay = ['Super Admin', 'Admin', 'Manager', 'Commercial', 'Comptable'].includes(user.role);
  const canCreditNote = ['Super Admin', 'Admin', 'Manager', 'Commercial', 'Magasinier'].includes(user.role);

  const [search, setSearch] = useState('');
  const [onlyDue, setOnlyDue] = useState(true);

  // Quantités déjà avoirées par facture / produit (avoirs = ventes type 'return' liées).
  const returnedByInvoice = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const s of sales) {
      if (s.type === 'return' && s.relatedSaleId) {
        const inv = (m[s.relatedSaleId] ||= {});
        for (const it of s.items || []) inv[it.productId] = (inv[it.productId] || 0) + Math.abs(Number(it.quantity) || 0);
      }
    }
    return m;
  }, [sales]);

  // Total encore retournable d'une facture (0 = entièrement avoirée).
  const returnableQty = (s: Sale) => {
    const ret = returnedByInvoice[s.id] || {};
    return (s.items || []).reduce((a, it) => a + Math.max(0, (Number(it.quantity) || 0) - (ret[it.productId] || 0)), 0);
  };

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return sales
      .filter((sale) => sale.type === 'invoice') // créances = factures (les avoirs sont exclus)
      .filter((sale) => {
        const reste = sale.totalAmount - (sale.paidAmount || 0);
        const match = (sale.clientName || '').toLowerCase().includes(s)
          || sale.id.toLowerCase().includes(s)
          || (sale.invoiceNumber || '').toLowerCase().includes(s);
        return match && (!onlyDue || reste > 0.5);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [sales, search, onlyDue]);
  const page = usePagination<Sale>(rows);

  const totalDue = useMemo(
    () => sales
      .filter((s) => s.type === 'invoice')
      .reduce((a, s) => a + Math.max(0, s.totalAmount - (s.paidAmount || 0)), 0),
    [sales],
  );

  // Modal encaissement
  const [payTarget, setPayTarget] = useState<Sale | null>(null);
  const [payAmount, setPayAmount] = useState(0);

  // Modal historique
  const [historyTarget, setHistoryTarget] = useState<Sale | null>(null);
  const [historyRows, setHistoryRows] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openPay = (s: Sale) => { setPayTarget(s); setPayAmount(Math.max(0, s.totalAmount - (s.paidAmount || 0))); };
  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || payAmount <= 0) { showAlert('Montant invalide.', { variant: 'warning' }); return; }
    try {
      await paySale(payTarget.id, payAmount);
      showToast('Règlement client enregistré.', { title: 'Créances' });
      setPayTarget(null);
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors du règlement.', { variant: 'error' });
    }
  };

  const openHistory = async (s: Sale) => {
    setHistoryTarget(s);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      setHistoryRows(await listPayments({ refId: s.id }));
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  };

  // Modal avoir (note de crédit)
  const [cnTarget, setCnTarget] = useState<Sale | null>(null);
  const [cnQty, setCnQty] = useState<Record<string, number>>({});
  const [cnReason, setCnReason] = useState('');
  const [cnRestock, setCnRestock] = useState(true);
  const [cnLoading, setCnLoading] = useState(false);
  const [printCn, setPrintCn] = useState<Sale | null>(null); // avoir créé, à imprimer

  const openCreditNote = (s: Sale) => {
    setCnTarget(s);
    setCnQty({});
    setCnReason('');
    setCnRestock(true);
  };

  // Retournable par ligne d'une facture, en tenant compte des avoirs déjà émis.
  const lineReturnable = (s: Sale, productId: string, invoicedQty: number) =>
    Math.max(0, invoicedQty - ((returnedByInvoice[s.id] || {})[productId] || 0));

  const cnSelectedTotal = useMemo(
    () => Object.values(cnQty).reduce((a: number, q) => a + (Number(q) || 0), 0),
    [cnQty],
  );

  const handleCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnTarget) return;
    const lines = Object.entries(cnQty)
      .map(([productId, quantity]) => ({ productId, quantity: Number(quantity) || 0 }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) { showAlert('Sélectionnez au moins une quantité à créditer.', { variant: 'warning' }); return; }
    setCnLoading(true);
    try {
      const created = await createCreditNote(cnTarget.id, { lines, reason: cnReason.trim() || undefined, restock: cnRestock });
      showToast(`Avoir ${created.invoiceNumber} établi.`, { title: 'Avoir' });
      setCnTarget(null);
      setPrintCn(created); // propose l'impression du justificatif
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de l\'établissement de l\'avoir.', { variant: 'error' });
    } finally {
      setCnLoading(false);
    }
  };

  const cols = [
    { label: 'Réf', value: (s: Sale) => s.invoiceNumber || s.id },
    { label: 'Client', value: (s: Sale) => s.clientName || '' },
    { label: 'Date', value: (s: Sale) => new Date(s.createdAt).toLocaleDateString() },
    { label: 'Total', value: (s: Sale) => s.totalAmount },
    { label: 'Payé', value: (s: Sale) => s.paidAmount || 0 },
    { label: 'Reste', value: (s: Sale) => s.totalAmount - (s.paidAmount || 0) },
    { label: 'Statut', value: (s: Sale) => PAY_META[s.paymentStatus]?.label || s.paymentStatus },
  ];
  const handleExport = (fmt: 'pdf' | 'excel') => {
    if (fmt === 'excel') exportExcel('creances_clients', 'Créances', cols, rows);
    else exportPdf('creances_clients', 'Créances Clients', cols, rows);
    showToast(`${rows.length} ligne(s) exportée(s) (${fmt.toUpperCase()}).`, { title: 'Export' });
  };

  const inputCls = 'w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

  return (
    <div className="space-y-6">
      {/* Title + total créances */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-cyan-500" />
            Créances Clients
          </h2>
          <p className="text-xs text-slate-400">Avances, restes dus et encaissements des commandes clients.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-right">
            <span className="text-[9px] uppercase font-mono text-red-400 block">Total créances</span>
            <span className="text-sm font-bold font-mono text-red-500">{format(totalDue)}</span>
          </div>
          <button onClick={() => handleExport('pdf')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5">
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
          <button onClick={() => handleExport('excel')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5">
            <Download className="w-4 h-4 text-green-700" /> Excel
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
        <input type="text" placeholder="Rechercher client ou réf..." value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} flex-1`} />
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs shrink-0">
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} className="accent-cyan-500 w-3.5 h-3.5" />
          <span className="text-slate-600 dark:text-slate-300">Restes dus uniquement</span>
        </label>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Réf</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4 hidden lg:table-cell">Date</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right hidden md:table-cell">Payé</th>
                <th className="py-3 px-4 text-right">Reste dû</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs text-slate-600 dark:text-gray-300">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-500">Aucune créance {onlyDue ? 'en cours' : ''}.</td></tr>
              ) : (
                page.paged.map((s) => {
                  const reste = s.totalAmount - (s.paidAmount || 0);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition">
                      <td className="py-3 px-4 font-mono font-bold text-[11px] text-cyan-500">
                        {s.invoiceNumber || s.id}
                        {returnedByInvoice[s.id] && (
                          <span title="Avoir(s) émis sur cette facture" className="ml-1.5 px-1 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[8px] font-mono align-middle">AVOIR</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{s.clientName || '—'}</td>
                      <td className="py-3 px-4 hidden lg:table-cell font-mono text-[11px] text-slate-400">{new Date(s.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-white">{format(s.totalAmount)}</td>
                      <td className="py-3 px-4 text-right hidden md:table-cell font-mono text-emerald-500">{format(s.paidAmount || 0)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold">{reste > 0.5 ? <span className="text-red-500">{format(reste)}</span> : <span className="text-emerald-500 flex items-center justify-end gap-1"><CheckCircle2 className="w-3.5 h-3.5" />0</span>}</td>
                      <td className="py-3 px-4 text-center"><span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${PAY_META[s.paymentStatus]?.cls}`}>{PAY_META[s.paymentStatus]?.label}</span></td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => openHistory(s)} title="Historique des règlements" className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                            <History className="w-3.5 h-3.5" />
                          </button>
                          {canPay && reste > 0.5 && (
                            <button onClick={() => openPay(s)} title="Enregistrer un encaissement" className="p-1.5 bg-slate-100 hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                              <Wallet className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canCreditNote && returnableQty(s) > 0 && (
                            <button onClick={() => openCreditNote(s)} title="Établir un avoir" className="p-1.5 bg-slate-100 hover:bg-orange-500/10 text-slate-500 hover:text-orange-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                              <FileMinus2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* Modal encaissement */}
      {payTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-fade-in text-xs">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-cyan-500" />Encaissement client</h3>
              <button onClick={() => setPayTarget(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handlePay} className="p-5 space-y-3">
              <p className="text-slate-500 dark:text-slate-400">
                {payTarget.clientName} — Réf {payTarget.id}<br />
                Total : <strong className="text-slate-900 dark:text-white">{format(payTarget.totalAmount)}</strong> · Payé : {format(payTarget.paidAmount || 0)} · Reste : <strong className="text-red-500">{format(payTarget.totalAmount - (payTarget.paidAmount || 0))}</strong>
              </p>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Montant encaissé (Ar)</label>
                <input type="number" min={1} value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} className={inputCls} />
              </div>
              <div className="flex justify-end gap-2 font-semibold pt-1">
                <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer">Annuler</button>
                <button type="submit" className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg cursor-pointer transition">Encaisser</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal historique */}
      {historyTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in text-xs flex flex-col max-h-[85vh]">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><History className="w-4 h-4 text-cyan-500" />Historique des règlements</h3>
                <p className="text-[10px] text-slate-400">{historyTarget.clientName} · Réf {historyTarget.id}</p>
              </div>
              <button onClick={() => setHistoryTarget(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {historyLoading ? (
                <p className="text-center text-slate-500 py-6">Chargement...</p>
              ) : historyRows.length === 0 ? (
                <p className="text-center text-slate-500 py-6">Aucun règlement enregistré.</p>
              ) : (
                historyRows.map((p) => (
                  <div key={p.id} className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-lg">
                    <div className="min-w-0">
                      <span className={`font-mono font-bold block ${p.amount < 0 ? 'text-orange-500' : 'text-emerald-500'}`}>{format(p.amount)}</span>
                      <span className="text-[10px] text-slate-400">{new Date(p.createdAt).toLocaleString()} · {p.note || '—'}{p.createdBy ? ` · ${p.createdBy}` : ''}</span>
                    </div>
                    {p.method && <span className="text-[9px] font-mono uppercase text-slate-400 shrink-0">{p.method}</span>}
                  </div>
                ))
              )}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex justify-between font-mono text-slate-500">
                <span>Total réglé</span>
                <span className="text-slate-900 dark:text-white font-bold">{format(historyTarget.paidAmount || 0)} / {format(historyTarget.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal avoir : sélection des lignes / quantités à créditer */}
      {cnTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in text-xs flex flex-col max-h-[85vh]">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><FileMinus2 className="w-4 h-4 text-orange-500" />Établir un avoir</h3>
                <p className="text-[10px] text-slate-400">{cnTarget.clientName} · sur facture {cnTarget.invoiceNumber || cnTarget.id}</p>
              </div>
              <button onClick={() => setCnTarget(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreditNote} className="p-5 space-y-3 overflow-y-auto">
              <div className="space-y-2">
                {(cnTarget.items || []).map((it) => {
                  const max = lineReturnable(cnTarget, it.productId, Number(it.quantity) || 0);
                  const already = (returnedByInvoice[cnTarget.id] || {})[it.productId] || 0;
                  return (
                    <div key={it.productId} className={`flex items-center gap-3 p-2.5 rounded-lg border ${max === 0 ? 'opacity-50 border-slate-200 dark:border-slate-800/40' : 'border-slate-200 dark:border-slate-800/60'}`}>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-900 dark:text-white block truncate">{it.productName}</span>
                        <span className="text-[10px] text-slate-400">Facturé {it.quantity} · {format(it.unitPrice)}{already ? ` · déjà avoiré ${already}` : ''} · retournable {max}</span>
                      </div>
                      <input
                        type="number" min={0} max={max} step="any" disabled={max === 0}
                        value={cnQty[it.productId] ?? 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(max, Math.round((Number(e.target.value) || 0) * 1000) / 1000));
                          setCnQty((q) => ({ ...q, [it.productId]: v }));
                        }}
                        className="w-20 shrink-0 text-right bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                      />
                    </div>
                  );
                })}
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Motif de l'avoir</label>
                <input type="text" value={cnReason} onChange={(e) => setCnReason(e.target.value)} placeholder="Retour marchandise, erreur de facturation…" className={inputCls} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={cnRestock} onChange={(e) => setCnRestock(e.target.checked)} className="accent-orange-500 w-3.5 h-3.5" />
                <span className="text-slate-600 dark:text-slate-300">Remettre les articles en stock (décocher si détruits)</span>
              </label>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-400 font-mono">{cnSelectedTotal} article(s) sélectionné(s)</span>
                <div className="flex gap-2 font-semibold">
                  <button type="button" onClick={() => setCnTarget(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer">Annuler</button>
                  <button type="submit" disabled={cnLoading || cnSelectedTotal === 0} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg cursor-pointer transition">{cnLoading ? 'Traitement…' : 'Établir l\'avoir'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal impression du justificatif d'avoir */}
      {printCn && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <style>{`@media print { @page { size: A4; margin: 15mm; } body * { visibility: hidden; } .avoir-print, .avoir-print * { visibility: visible; } .avoir-print { position: absolute; inset: 0; } .avoir-noprint { display: none !important; } }`}</style>
          <div className="bg-white text-slate-950 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 avoir-print animate-scale-up">
            <div className="text-center space-y-1">
              <span className="font-bold tracking-tight text-lg uppercase">{getExportCompany() || 'Vokatra-ko'}</span>
              <p className="text-sm font-bold text-orange-600 uppercase tracking-wide">Avoir / Note de crédit</p>
              <div className="border-b border-dashed border-slate-300 py-1"></div>
            </div>
            <div className="text-[11px] space-y-1">
              <div className="flex justify-between"><span>Avoir N° :</span><span className="font-bold">{printCn.invoiceNumber}</span></div>
              <div className="flex justify-between"><span>Sur facture :</span><span className="font-bold">{cnTargetRefLabel(sales, printCn.relatedSaleId)}</span></div>
              <div className="flex justify-between"><span>Date :</span><span>{new Date(printCn.createdAt).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Client :</span><span className="font-bold">{printCn.clientName || '—'}</span></div>
              {printCn.notes && <div className="flex justify-between gap-2"><span>Motif :</span><span className="text-right">{printCn.notes}</span></div>}
              <div className="border-b border-dashed border-slate-300 py-1"></div>
            </div>
            <div className="space-y-1.5 text-[11px]">
              {(printCn.items || []).map((it) => (
                <div key={it.productId} className="flex justify-between items-start">
                  <div>
                    <span>{it.productName}</span>
                    <span className="text-[9px] text-slate-500 block">{Math.abs(it.quantity)} x {format(it.unitPrice)}</span>
                  </div>
                  <span className="font-mono text-red-600">{format(it.total)}</span>
                </div>
              ))}
              <div className="border-b border-dashed border-slate-300 py-1"></div>
            </div>
            <div className="text-xs space-y-1 text-right font-mono">
              <div className="flex justify-between"><span>TVA :</span><span className="text-red-600">{format(printCn.vatAmount)}</span></div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-1 font-sans">
                <span>TOTAL AVOIR :</span><span className="text-red-600">{format(printCn.totalAmount)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 avoir-noprint">
              <button onClick={() => setPrintCn(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer text-xs font-semibold">Fermer</button>
              <button onClick={() => window.print()} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg cursor-pointer text-xs font-semibold flex items-center gap-1.5"><Printer className="w-4 h-4" />Imprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Libellé de la facture d'origine (n° légal si dispo) à partir de son id.
function cnTargetRefLabel(sales: Sale[], relatedSaleId?: string | null): string {
  if (!relatedSaleId) return '—';
  const inv = sales.find((s) => s.id === relatedSaleId);
  return inv?.invoiceNumber || relatedSaleId;
}
