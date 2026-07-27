import React, { useState, useMemo } from 'react';
import {
  ShoppingBag, Plus, Trash2, PackageCheck, Wallet, Eye, X, Download, Truck,
} from 'lucide-react';
import { Purchase, Supplier, Product, User, PurchaseItem, PurchaseStatus, SupplierProduct } from '../types';
import { useMoney } from '../services/CurrencyContext';
import { createPurchase, receivePurchase, payPurchase, deletePurchase } from '../services/purchasesService';
import { canWrite as hasWritePerm } from '../services/permissions';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import Pagination, { usePagination } from './Pagination';

interface PurchasesProps {
  purchases: Purchase[];
  suppliers: Supplier[];
  products: Product[];
  supplierProducts: SupplierProduct[];
  user: User;
  onRefresh: () => void;
  writePerms?: Record<string, string[]> | null;
}

const STATUS_META: Record<PurchaseStatus, { label: string; cls: string }> = {
  ordered: { label: 'Commandé', cls: 'bg-amber-500/10 text-amber-500' },
  received: { label: 'Réceptionné', cls: 'bg-emerald-500/10 text-emerald-500' },
  cancelled: { label: 'Annulé', cls: 'bg-red-500/10 text-red-500' },
};
const PAY_META: Record<string, { label: string; cls: string }> = {
  unpaid: { label: 'Non payé', cls: 'bg-red-500/10 text-red-500' },
  partially_paid: { label: 'Partiel', cls: 'bg-amber-500/10 text-amber-500' },
  paid: { label: 'Payé', cls: 'bg-emerald-500/10 text-emerald-500' },
};

interface Line { productId: string; quantity: number; unitCost: number; tax: number }

export default function Purchases({ purchases, suppliers, products, supplierProducts, user, onRefresh, writePerms }: PurchasesProps) {
  const { format } = useMoney();
  const canWrite = useMemo(() => hasWritePerm(user.role, 'purchases', writePerms), [user.role, writePerms]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(''); // filtre période (date de commande)
  const [dateTo, setDateTo] = useState('');

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59.999').getTime() : null;
    return purchases.filter((p) => {
      const match = (p.supplierName || '').toLowerCase().includes(s) || p.id.toLowerCase().includes(s);
      const st = statusFilter === 'all' || p.status === statusFilter;
      const t = new Date(p.createdAt).getTime();
      const okDate = (from === null || t >= from) && (to === null || t <= to);
      return match && st && okDate;
    });
  }, [purchases, search, statusFilter, dateFrom, dateTo]);
  const page = usePagination<Purchase>(filtered);

  // Dette fournisseurs (total dû = total - payé, hors annulés).
  const payable = useMemo(
    () => purchases.filter((p) => p.status !== 'cancelled').reduce((a, p) => a + (p.totalAmount - (p.paidAmount || 0)), 0),
    [purchases],
  );

  // Modal création
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1, unitCost: 0, tax: 20 }]);
  const [notes, setNotes] = useState('');
  const [expectedDate, setExpectedDate] = useState(''); // date de réception prévue (calendrier)
  const [applyVat, setApplyVat] = useState(false); // TVA optionnelle (désactivée par défaut)
  const [busy, setBusy] = useState(false);

  // Modal paiement / détails
  const [payTarget, setPayTarget] = useState<Purchase | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [viewTarget, setViewTarget] = useState<Purchase | null>(null);

  const totals = useMemo(() => {
    let subtotal = 0, vat = 0;
    lines.forEach((l) => {
      const t = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);
      subtotal += t;
      // La TVA n'est comptée que si l'option est activée (achat sans TVA sinon).
      if (applyVat) vat += t * ((Number(l.tax) || 0) / 100);
    });
    return { subtotal, vat, total: subtotal + vat };
  }, [lines, applyVat]);

  // Produits achetables auprès d'un fournisseur : UNION de deux sources, dédupliquée —
  //  1) le catalogue « Produits fournis » (prix d'achat négocié, prioritaire) ;
  //  2) les articles dont ce fournisseur est le fournisseur principal (fiche Articles & Stocks).
  // Ainsi, un produit auquel on affecte un fournisseur (n'importe où) apparaît dans ses achats.
  const buildCatalog = (sid: string) => {
    const map = new Map<string, { productId: string; name: string; purchasePrice: number; vatRate: number }>();
    supplierProducts.filter((sp) => sp.supplierId === sid).forEach((sp) => {
      const prod = products.find((p) => p.id === sp.productId);
      map.set(sp.productId, {
        productId: sp.productId,
        name: sp.productName || prod?.name || sp.sku || sp.productId,
        purchasePrice: sp.purchasePrice,
        vatRate: prod ? prod.vatRate : 20,
      });
    });
    products.filter((p) => p.supplierId && p.supplierId === sid).forEach((p) => {
      if (!map.has(p.id)) {
        map.set(p.id, { productId: p.id, name: p.name, purchasePrice: p.purchasePrice, vatRate: p.vatRate });
      }
    });
    return Array.from(map.values());
  };

  const catalog = useMemo(() => buildCatalog(supplierId), [supplierProducts, products, supplierId]);

  // Options proposées dans les listes déroulantes : le catalogue du fournisseur si
  // renseigné, sinon tous les produits (repli pour ne jamais bloquer la saisie).
  const optionProducts = useMemo(() => {
    if (catalog.length) {
      return catalog.map((c) => ({ id: c.productId, name: c.name }));
    }
    return products.map((p) => ({ id: p.id, name: p.name }));
  }, [catalog, products]);

  // Construit les lignes de commande à partir du catalogue d'un fournisseur :
  // tous ses produits, quantité 1, coût = son prix négocié / d'achat. Repli sur une ligne vide.
  const linesForSupplier = (sid: string): Line[] => {
    const cat = buildCatalog(sid);
    if (cat.length === 0) return [{ productId: '', quantity: 1, unitCost: 0, tax: 20 }];
    return cat.map((c) => ({ productId: c.productId, quantity: 1, unitCost: c.purchasePrice, tax: c.vatRate }));
  };

  const openCreate = () => {
    const sid = suppliers[0]?.id || '';
    setSupplierId(sid);
    setLines(linesForSupplier(sid));
    setNotes('');
    setExpectedDate('');
    setApplyVat(false);
    setIsCreateOpen(true);
  };

  // Changer de fournisseur pré-remplit automatiquement ses produits.
  const onSelectSupplier = (sid: string) => {
    setSupplierId(sid);
    setLines(linesForSupplier(sid));
  };

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onSelectProduct = (i: number, pid: string) => {
    // Prix issu du catalogue unifié (négocié en priorité), sinon prix d'achat de la fiche.
    const c = catalog.find((s) => s.productId === pid);
    const prod = products.find((p) => p.id === pid);
    setLine(i, {
      productId: pid,
      unitCost: c ? c.purchasePrice : prod ? prod.purchasePrice : 0,
      tax: c ? c.vatRate : prod ? prod.vatRate : 20,
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const items: PurchaseItem[] = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => {
        const prod = products.find((p) => p.id === l.productId);
        const quantity = Number(l.quantity) || 0;
        const unitCost = Number(l.unitCost) || 0;
        return {
          productId: l.productId,
          productName: prod?.name,
          sku: prod?.sku,
          quantity,
          unitCost,
          tax: applyVat ? (Number(l.tax) || 0) : 0, // TVA neutralisée si l'option est décochée
          total: quantity * unitCost,
        };
      });
    if (!supplierId) { showAlert('Sélectionnez un fournisseur.', { variant: 'warning' }); return; }
    if (items.length === 0) { showAlert('Ajoutez au moins un article valide.', { variant: 'warning' }); return; }
    setBusy(true);
    try {
      const sup = suppliers.find((s) => s.id === supplierId);
      await createPurchase({ supplierId, supplierName: sup?.name, items, notes, expectedDate: expectedDate || undefined });
      setIsCreateOpen(false);
      showToast('Commande d\'achat créée.', { title: 'Achats' });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la création.', { variant: 'error' });
    } finally { setBusy(false); }
  };

  const handleReceive = async (p: Purchase) => {
    if (!(await showConfirm(`Réceptionner la commande ${p.id} ? Le stock des articles sera augmenté.`, { title: 'Réception', variant: 'info', confirmText: 'Réceptionner' }))) return;
    try {
      await receivePurchase(p.id);
      showToast('Marchandises réceptionnées, stock mis à jour.', { title: 'Achats' });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la réception.', { variant: 'error' });
    }
  };

  const openPay = (p: Purchase) => {
    setPayTarget(p);
    setPayAmount(Math.max(0, p.totalAmount - (p.paidAmount || 0)));
  };
  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || payAmount <= 0) { showAlert('Montant invalide.', { variant: 'warning' }); return; }
    try {
      await payPurchase(payTarget.id, payAmount);
      showToast('Règlement enregistré.', { title: 'Achats' });
      setPayTarget(null);
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors du règlement.', { variant: 'error' });
    }
  };

  const handleDelete = async (p: Purchase) => {
    if (!(await showConfirm(`Supprimer la commande ${p.id} ?`, { title: 'Supprimer', confirmText: 'Supprimer' }))) return;
    try {
      await deletePurchase(p.id);
      showToast('Commande supprimée.', { title: 'Achats', type: 'info' });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Suppression refusée.', { variant: 'error' });
    }
  };

  const exportCols = [
    { label: 'Réf', value: (p: Purchase) => p.id },
    { label: 'Fournisseur', value: (p: Purchase) => p.supplierName || '' },
    { label: 'Date', value: (p: Purchase) => new Date(p.createdAt).toLocaleDateString() },
    { label: 'Articles', value: (p: Purchase) => p.items?.length || 0 },
    { label: 'Total', value: (p: Purchase) => p.totalAmount },
    { label: 'Payé', value: (p: Purchase) => p.paidAmount || 0 },
    { label: 'Reste', value: (p: Purchase) => p.totalAmount - (p.paidAmount || 0) },
    { label: 'Statut', value: (p: Purchase) => STATUS_META[p.status]?.label || p.status },
    { label: 'Paiement', value: (p: Purchase) => PAY_META[p.paymentStatus]?.label || p.paymentStatus },
  ];
  const handleExport = (fmt: 'pdf' | 'excel') => {
    if (fmt === 'excel') exportExcel('achats', 'Achats', exportCols, filtered);
    else exportPdf('achats', 'Achats & Fournisseurs', exportCols, filtered);
    showToast(`${filtered.length} achat(s) exporté(s) (${fmt.toUpperCase()}).`, { title: 'Export' });
  };

  const inputCls = 'w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

  return (
    <div className="space-y-6">
      {/* Title + dette */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-cyan-500" />
            Achats & Fournisseurs
          </h2>
          <p className="text-xs text-slate-400">Commandes fournisseurs, réception en stock et suivi des règlements.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-right">
            <span className="text-[9px] uppercase font-mono text-red-400 block">Dette fournisseurs</span>
            <span className="text-sm font-bold font-mono text-red-500">{format(payable)}</span>
          </div>
          <button onClick={() => handleExport('pdf')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5">
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
          <button onClick={() => handleExport('excel')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5">
            <Download className="w-4 h-4 text-green-700" /> Excel
          </button>
          {canWrite && (
            <button onClick={openCreate} className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition">
              <Plus className="w-4 h-4" /> Nouvelle Commande
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col lg:flex-row gap-3">
        <input type="text" placeholder="Rechercher fournisseur ou réf..." value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} flex-1`} />
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-mono uppercase text-slate-400 shrink-0">Du</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputCls} sm:w-40`} title="Date de commande — début" />
          <label className="text-[10px] font-mono uppercase text-slate-400 shrink-0">Au</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputCls} sm:w-40`} title="Date de commande — fin" />
          {(dateFrom || dateTo) && (
            <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-[11px] text-cyan-500 hover:underline shrink-0">Effacer</button>
          )}
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} lg:w-48`}>
          <option value="all">Tous les statuts</option>
          <option value="ordered">Commandé</option>
          <option value="received">Réceptionné</option>
          <option value="cancelled">Annulé</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Réf</th>
                <th className="py-3 px-4">Fournisseur</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Total TTC</th>
                <th className="py-3 px-4 text-right hidden md:table-cell">Reste dû</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-center hidden md:table-cell">Paiement</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs text-slate-600 dark:text-gray-300">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-500">Aucune commande d'achat.</td></tr>
              ) : (
                page.paged.map((p) => {
                  const reste = p.totalAmount - (p.paidAmount || 0);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition">
                      <td className="py-3 px-4 font-mono font-bold text-[11px] text-cyan-500">{p.id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{p.supplierName || '—'}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">{format(p.totalAmount)}</td>
                      <td className="py-3 px-4 text-right hidden md:table-cell font-mono">{reste > 0 ? <span className="text-red-500 font-bold">{format(reste)}</span> : <span className="text-emerald-500">0</span>}</td>
                      <td className="py-3 px-4 text-center"><span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${STATUS_META[p.status]?.cls}`}>{STATUS_META[p.status]?.label}</span></td>
                      <td className="py-3 px-4 text-center hidden md:table-cell"><span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${PAY_META[p.paymentStatus]?.cls}`}>{PAY_META[p.paymentStatus]?.label}</span></td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setViewTarget(p)} title="Détails" className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canWrite && p.status === 'ordered' && (
                            <button onClick={() => handleReceive(p)} title="Réceptionner en stock" className="p-1.5 bg-slate-100 hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                              <PackageCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canWrite && p.paymentStatus !== 'paid' && p.status !== 'cancelled' && (
                            <button onClick={() => openPay(p)} title="Enregistrer un règlement" className="p-1.5 bg-slate-100 hover:bg-amber-500/10 text-slate-500 hover:text-amber-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                              <Wallet className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canWrite && p.status !== 'received' && (
                            <button onClick={() => handleDelete(p)} title="Supprimer" className="p-1.5 bg-slate-100 hover:bg-red-500/10 text-slate-500 hover:text-red-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal création */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in text-xs">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-cyan-500" />Nouvelle Commande d'Achat</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Fournisseur *</label>
                <select value={supplierId} onChange={(e) => onSelectSupplier(e.target.value)} className={inputCls}>
                  <option value="">— Sélectionner —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {supplierId && catalog.length === 0 && (
                  <p className="text-[10px] text-amber-500 mt-1">
                    Aucun produit catalogué pour ce fournisseur. Ajoutez-en dans Clients &amp; Fournisseurs → Fournisseurs (bouton « Produits fournis »).
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-slate-500 dark:text-slate-400">Articles</label>
                  <button type="button" onClick={() => setLines((p) => [...p, { productId: '', quantity: 1, unitCost: 0, tax: 20 }])} className="text-[11px] text-cyan-500 hover:underline flex items-center gap-0.5"><Plus className="w-3 h-3" /> Ligne</button>
                </div>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <select value={l.productId} onChange={(e) => onSelectProduct(i, e.target.value)} className={`${inputCls} col-span-5`}>
                      <option value="">— Article —</option>
                      {optionProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className={`${inputCls} col-span-2`} title="Quantité" />
                    <input type="number" min={0} value={l.unitCost} onChange={(e) => setLine(i, { unitCost: Number(e.target.value) })} className={`${inputCls} col-span-3`} title="Coût unitaire" />
                    <span className="col-span-1 text-[10px] font-mono text-slate-400 text-center">{applyVat ? l.tax : 0}%</span>
                    <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="col-span-1 text-slate-400 hover:text-red-500 flex justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Date de réception prévue</label>
                  <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputCls} title="Apparaîtra sur le calendrier" />
                </div>
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Notes</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="N° facture, conditions..." />
                </div>
              </div>

              {/* Option TVA (désactivée par défaut) */}
              <label className="flex items-center gap-2 cursor-pointer select-none border-t border-slate-200 dark:border-slate-800 pt-3">
                <input type="checkbox" checked={applyVat} onChange={(e) => setApplyVat(e.target.checked)} className="accent-cyan-500 w-3.5 h-3.5" />
                <span className="text-slate-700 dark:text-slate-200 font-semibold">Appliquer la TVA</span>
                <span className="text-[10px] text-slate-400">(sinon achat sans TVA)</span>
              </label>

              <div className="space-y-1 font-mono text-slate-500">
                <div className="flex justify-between"><span>Sous-total HT</span><span className="text-slate-900 dark:text-white">{format(totals.subtotal)}</span></div>
                {applyVat && (
                  <div className="flex justify-between"><span>TVA</span><span className="text-slate-900 dark:text-white">{format(totals.vat)}</span></div>
                )}
                <div className="flex justify-between text-sm font-bold font-sans text-slate-900 dark:text-white"><span>Total TTC</span><span className="text-cyan-500">{format(totals.total)}</span></div>
              </div>

              <div className="flex justify-end gap-2 font-semibold">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer">Annuler</button>
                <button type="submit" disabled={busy} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg cursor-pointer transition">{busy ? 'Création...' : 'Créer la commande'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal paiement */}
      {payTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-fade-in text-xs">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-cyan-500" />Règlement fournisseur</h3>
              <button onClick={() => setPayTarget(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handlePay} className="p-5 space-y-3">
              <p className="text-slate-500 dark:text-slate-400">
                {payTarget.supplierName} — Réf {payTarget.id}<br />
                Total : <strong className="text-slate-900 dark:text-white">{format(payTarget.totalAmount)}</strong> · Déjà payé : {format(payTarget.paidAmount || 0)} · Reste : <strong className="text-red-500">{format(payTarget.totalAmount - (payTarget.paidAmount || 0))}</strong>
              </p>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Montant du règlement (Ar)</label>
                <input type="number" min={1} value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} className={inputCls} />
              </div>
              <div className="flex justify-end gap-2 font-semibold pt-1">
                <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer">Annuler</button>
                <button type="submit" className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg cursor-pointer transition">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal détails */}
      {viewTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in text-xs flex flex-col max-h-[85vh]">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Commande {viewTarget.id}</h3>
                <p className="text-[10px] text-slate-400">{viewTarget.supplierName} · {new Date(viewTarget.createdAt).toLocaleString()}</p>
              </div>
              <button onClick={() => setViewTarget(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {(viewTarget.items || []).map((it: PurchaseItem, i) => (
                <div key={i} className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-lg">
                  <div className="min-w-0"><span className="font-semibold text-slate-900 dark:text-white block truncate">{it.productName || it.productId}</span><span className="text-[10px] text-slate-400">{it.quantity} × {format(it.unitCost)}</span></div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{format(it.total)}</span>
                </div>
              ))}
              {viewTarget.notes && <p className="text-[11px] text-slate-500 italic pt-1">Note : {viewTarget.notes}</p>}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 font-mono text-slate-500 space-y-1">
                <div className="flex justify-between"><span>TVA</span><span>{format(viewTarget.vatAmount)}</span></div>
                <div className="flex justify-between text-sm font-bold font-sans text-slate-900 dark:text-white"><span>Total TTC</span><span>{format(viewTarget.totalAmount)}</span></div>
                <div className="flex justify-between"><span>Réglé</span><span className="text-emerald-500">{format(viewTarget.paidAmount || 0)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
