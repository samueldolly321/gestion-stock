import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Truck, ShoppingBag, HandCoins, Plus, X, Trash2 } from 'lucide-react';
import { Delivery, Purchase, Sale, Supplier, Product, SupplierProduct, Client, User, PurchaseItem, DeliveryType } from '../types';
import { deliveryTypeLabel, DELIVERY_TYPES, defaultFeeFor, createDelivery } from '../services/deliveriesService';
import { createPurchase } from '../services/purchasesService';
import { canWrite as hasWritePerm } from '../services/permissions';
import { showAlert } from '../services/dialog';
import { showToast } from '../services/toast';
import { useMoney } from '../services/CurrencyContext';

interface CalendarProps {
  deliveries: Delivery[];
  purchases: Purchase[];
  sales: Sale[];
  suppliers: Supplier[];
  products: Product[];
  supplierProducts: SupplierProduct[];
  clients: Client[];
  user: User;
  onRefresh: () => void;
  onNavigate: (tab: string) => void;
  writePerms?: Record<string, string[]> | null;
}

interface QLine { productId: string; quantity: number; unitCost: number; tax: number }

type Ev = { kind: 'delivery' | 'purchase' | 'receivable'; label: string; sub: string };

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function Calendar({ deliveries, purchases, sales, suppliers, products, supplierProducts, clients, user, onRefresh, onNavigate, writePerms }: CalendarProps) {
  const { format } = useMoney();
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const canWritePurchase = hasWritePerm(user.role, 'purchases', writePerms);
  const canWriteDelivery = hasWritePerm(user.role, 'deliveries', writePerms);
  const canAdd = canWritePurchase || canWriteDelivery;

  // --- Ajout rapide depuis une case du calendrier ---
  const [qaDate, setQaDate] = useState<string | null>(null); // YYYY-MM-DD de la case cliquée
  const [qaMode, setQaMode] = useState<'purchase' | 'delivery'>('purchase');
  const [qaSupplierId, setQaSupplierId] = useState('');
  const [qaLines, setQaLines] = useState<QLine[]>([]);
  const [qaClientId, setQaClientId] = useState('');
  const [qaType, setQaType] = useState<DeliveryType>('moto');
  const [qaFee, setQaFee] = useState<number>(defaultFeeFor('moto'));
  const [qaDriver, setQaDriver] = useState('');
  const [qaBusy, setQaBusy] = useState(false);

  // Catalogue d'un fournisseur = union supplier_products + produits rattachés (fiche).
  const buildCatalog = (sid: string) => {
    const map = new Map<string, { productId: string; name: string; purchasePrice: number; vatRate: number }>();
    supplierProducts.filter((sp) => sp.supplierId === sid).forEach((sp) => {
      const prod = products.find((p) => p.id === sp.productId);
      map.set(sp.productId, { productId: sp.productId, name: sp.productName || prod?.name || sp.sku || sp.productId, purchasePrice: sp.purchasePrice, vatRate: prod ? prod.vatRate : 20 });
    });
    products.filter((p) => p.supplierId && p.supplierId === sid).forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, { productId: p.id, name: p.name, purchasePrice: p.purchasePrice, vatRate: p.vatRate });
    });
    return Array.from(map.values());
  };
  const linesForSupplier = (sid: string): QLine[] => {
    const cat = buildCatalog(sid);
    if (!cat.length) return [{ productId: '', quantity: 1, unitCost: 0, tax: 20 }];
    return cat.map((c) => ({ productId: c.productId, quantity: 1, unitCost: c.purchasePrice, tax: c.vatRate }));
  };

  const openQuickAdd = (dateKey: string) => {
    setQaDate(dateKey);
    const mode: 'purchase' | 'delivery' = canWritePurchase ? 'purchase' : 'delivery';
    setQaMode(mode);
    const sid = suppliers[0]?.id || '';
    setQaSupplierId(sid);
    setQaLines(linesForSupplier(sid));
    setQaClientId(clients[0]?.id || '');
    setQaType('moto');
    setQaFee(defaultFeeFor('moto'));
    setQaDriver('');
  };
  const onQaSupplier = (sid: string) => { setQaSupplierId(sid); setQaLines(linesForSupplier(sid)); };
  const setQaLine = (i: number, patch: Partial<QLine>) => setQaLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submitQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaDate) return;
    setQaBusy(true);
    try {
      if (qaMode === 'purchase') {
        const items: PurchaseItem[] = qaLines
          .filter((l) => l.productId && Number(l.quantity) > 0)
          .map((l) => {
            const prod = products.find((p) => p.id === l.productId);
            const quantity = Number(l.quantity) || 0;
            const unitCost = Number(l.unitCost) || 0;
            return { productId: l.productId, productName: prod?.name, sku: prod?.sku, quantity, unitCost, tax: Number(l.tax) || 0, total: quantity * unitCost };
          });
        if (!qaSupplierId) { showAlert('Sélectionnez un fournisseur.', { variant: 'warning' }); setQaBusy(false); return; }
        if (!items.length) { showAlert('Ajoutez au moins un article.', { variant: 'warning' }); setQaBusy(false); return; }
        const sup = suppliers.find((s) => s.id === qaSupplierId);
        await createPurchase({ supplierId: qaSupplierId, supplierName: sup?.name, items, expectedDate: qaDate });
        showToast('Commande d\'achat créée (réception prévue).', { title: 'Calendrier' });
      } else {
        const cli = clients.find((c) => c.id === qaClientId);
        await createDelivery({
          saleId: null,
          clientId: qaClientId || null,
          clientName: cli?.name || null,
          address: cli?.address || null,
          type: qaType,
          fee: Number(qaFee) || 0,
          status: 'pending',
          driverName: qaDriver || null,
          scheduledDate: qaDate,
          notes: null,
        });
        showToast('Livraison planifiée.', { title: 'Calendrier' });
      }
      setQaDate(null);
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la création.', { variant: 'error' });
    } finally {
      setQaBusy(false);
    }
  };

  const qaTotals = useMemo(() => {
    let subtotal = 0;
    qaLines.forEach((l) => { subtotal += (Number(l.quantity) || 0) * (Number(l.unitCost) || 0); });
    return subtotal;
  }, [qaLines]);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Regroupe les événements par jour (clé YYYY-MM-DD).
  const events = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    const add = (dateStr: string | null | undefined, ev: Ev) => {
      if (!dateStr) return;
      const k = dateStr.slice(0, 10);
      (m[k] ||= []).push(ev);
    };
    deliveries.forEach((d) => {
      if (d.status === 'cancelled') return;
      add(d.scheduledDate, { kind: 'delivery', label: d.clientName || 'Livraison', sub: deliveryTypeLabel(d.type) });
    });
    purchases.forEach((p) => {
      if (p.status === 'ordered') add(p.expectedDate, { kind: 'purchase', label: p.supplierName || 'Commande', sub: 'Réception prévue' });
    });
    sales.forEach((s) => {
      if (s.type === 'return') return; // pas les avoirs
      const reste = (Number(s.totalAmount) || 0) - (Number(s.paidAmount) || 0);
      if (reste > 0.5 && s.dueDate) {
        add(s.dueDate, { kind: 'receivable', label: s.clientName || 'Créance', sub: `Échéance ${format(reste)}` });
      }
    });
    return m;
  }, [deliveries, purchases, sales, format]);

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const monthLabel = anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // lundi en tête

  const cells: (number | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (dir: number) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));

  // Totaux du mois affiché (pour le sous-titre).
  const monthKeys = Object.keys(events).filter((k) => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
  const nbDeliv = monthKeys.reduce((a, k) => a + events[k].filter((e) => e.kind === 'delivery').length, 0);
  const nbPurch = monthKeys.reduce((a, k) => a + events[k].filter((e) => e.kind === 'purchase').length, 0);
  const nbCrea = monthKeys.reduce((a, k) => a + events[k].filter((e) => e.kind === 'receivable').length, 0);

  return (
    <div className="space-y-6">
      {/* En-tête + navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-cyan-500" />
            Calendrier
          </h2>
          <p className="text-xs text-slate-400">Commandes fournisseurs (réception prévue) et livraisons planifiées.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-3 text-[10px] font-mono mr-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block"></span> Livraisons</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Commandes</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> Créances</span>
          </div>
          <button onClick={() => setAnchor(new Date())} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">Aujourd'hui</button>
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg px-1">
            <button onClick={() => shift(-1)} className="p-1.5 text-slate-400 hover:text-cyan-500"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-semibold text-slate-900 dark:text-white min-w-[130px] text-center capitalize">{monthLabel}</span>
            <button onClick={() => shift(1)} className="p-1.5 text-slate-400 hover:text-cyan-500"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 font-mono">{nbDeliv} livraison(s) · {nbPurch} commande(s) · {nbCrea} échéance(s) de créance ce mois-ci</p>

      {/* Grille */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-950/20">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-mono uppercase text-slate-400 tracking-wider">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-[92px] border-b border-r border-slate-100 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-950/10" />;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const evs = events[key] || [];
            const isToday = key === todayKey;
            return (
              <div key={i} className="group min-h-[92px] border-b border-r border-slate-100 dark:border-slate-800/40 p-1.5 space-y-1 align-top">
                <div className="flex items-center justify-between">
                  <div className={`text-[11px] font-mono ${isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500 text-white font-bold' : 'text-slate-400'}`}>{day}</div>
                  {canAdd && (
                    <button
                      onClick={() => openQuickAdd(key)}
                      title="Ajouter une commande fournisseur ou une livraison à cette date"
                      className="opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 transition text-slate-400 hover:text-cyan-500 rounded hover:bg-cyan-500/10 p-0.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {evs.slice(0, 3).map((e, j) => {
                  const tab = e.kind === 'delivery' ? 'deliveries' : e.kind === 'purchase' ? 'purchases' : 'receivables';
                  const cls = e.kind === 'delivery'
                    ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/20'
                    : e.kind === 'purchase'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20'
                    : 'bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20';
                  return (
                    <button
                      key={j}
                      onClick={() => onNavigate(tab)}
                      title={`${e.label} — ${e.sub}`}
                      className={`w-full text-left px-1.5 py-0.5 rounded text-[9px] truncate flex items-center gap-1 cursor-pointer transition ${cls}`}
                    >
                      {e.kind === 'delivery' ? <Truck className="w-2.5 h-2.5 shrink-0" /> : e.kind === 'purchase' ? <ShoppingBag className="w-2.5 h-2.5 shrink-0" /> : <HandCoins className="w-2.5 h-2.5 shrink-0" />}
                      <span className="truncate">{e.label}</span>
                    </button>
                  );
                })}
                {evs.length > 3 && <div className="text-[9px] text-slate-400 pl-1">+{evs.length - 3} autre(s)</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal d'ajout rapide (commande fournisseur / livraison) */}
      {qaDate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in text-xs">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-cyan-500" />
                Ajouter au {new Date(qaDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              <button onClick={() => setQaDate(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={submitQuickAdd} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Sélecteur de type (selon les droits) */}
              {canWritePurchase && canWriteDelivery && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setQaMode('purchase')} className={`py-2 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-1.5 ${qaMode === 'purchase' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' : 'bg-white dark:bg-slate-950/20 text-slate-500 border-slate-200 dark:border-slate-800'}`}>
                    <ShoppingBag className="w-3.5 h-3.5" /> Commande fournisseur
                  </button>
                  <button type="button" onClick={() => setQaMode('delivery')} className={`py-2 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-1.5 ${qaMode === 'delivery' ? 'bg-cyan-500/15 text-cyan-500 border-cyan-500/30' : 'bg-white dark:bg-slate-950/20 text-slate-500 border-slate-200 dark:border-slate-800'}`}>
                    <Truck className="w-3.5 h-3.5" /> Livraison
                  </button>
                </div>
              )}

              {qaMode === 'purchase' ? (
                <>
                  <div>
                    <label className="text-slate-500 dark:text-slate-400 block mb-1">Fournisseur *</label>
                    <select value={qaSupplierId} onChange={(e) => onQaSupplier(e.target.value)} className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500">
                      <option value="">— Sélectionner —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-slate-500 dark:text-slate-400">Articles</label>
                      <button type="button" onClick={() => setQaLines((p) => [...p, { productId: '', quantity: 1, unitCost: 0, tax: 20 }])} className="text-[11px] text-cyan-500 hover:underline flex items-center gap-0.5"><Plus className="w-3 h-3" /> Ligne</button>
                    </div>
                    {qaLines.map((l, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <select value={l.productId} onChange={(e) => { const pid = e.target.value; const cat = buildCatalog(qaSupplierId).find((c) => c.productId === pid); const prod = products.find((p) => p.id === pid); setQaLine(i, { productId: pid, unitCost: cat ? cat.purchasePrice : prod ? prod.purchasePrice : 0, tax: cat ? cat.vatRate : prod ? prod.vatRate : 20 }); }} className="col-span-6 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none">
                          <option value="">— Article —</option>
                          {(buildCatalog(qaSupplierId).length ? buildCatalog(qaSupplierId).map((c) => ({ id: c.productId, name: c.name })) : products.map((p) => ({ id: p.id, name: p.name }))).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input type="number" min={0} step="any" value={l.quantity} onChange={(e) => setQaLine(i, { quantity: Number(e.target.value) })} className="col-span-2 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none" title="Quantité" />
                        <input type="number" min={0} value={l.unitCost} onChange={(e) => setQaLine(i, { unitCost: Number(e.target.value) })} className="col-span-3 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none" title="Coût unitaire" />
                        <button type="button" onClick={() => setQaLines((p) => p.filter((_, idx) => idx !== i))} className="col-span-1 text-slate-400 hover:text-red-500 flex justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-2 flex justify-between font-mono text-sm font-bold text-slate-900 dark:text-white">
                    <span>Total HT</span><span className="text-cyan-500">{format(qaTotals)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">La réception prévue sera fixée à cette date (visible sur le calendrier).</p>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-slate-500 dark:text-slate-400 block mb-1">Client (optionnel)</label>
                    <select value={qaClientId} onChange={(e) => setQaClientId(e.target.value)} className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500">
                      <option value="">— Aucun —</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 dark:text-slate-400 block mb-1">Type de transport</label>
                      <select value={qaType} onChange={(e) => { const t = e.target.value as DeliveryType; setQaType(t); setQaFee(defaultFeeFor(t)); }} className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500">
                        {DELIVERY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-500 dark:text-slate-400 block mb-1">Tarif (Ar)</label>
                      <input type="number" min={0} value={qaFee} onChange={(e) => setQaFee(Number(e.target.value))} className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-slate-500 dark:text-slate-400 block mb-1">Chauffeur (optionnel)</label>
                    <input type="text" value={qaDriver} onChange={(e) => setQaDriver(e.target.value)} className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500" placeholder="Nom du chauffeur" />
                  </div>
                  <p className="text-[10px] text-slate-400">La livraison sera planifiée à cette date (visible sur le calendrier).</p>
                </>
              )}

              <div className="flex justify-end gap-2 font-semibold pt-1">
                <button type="button" onClick={() => setQaDate(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer">Annuler</button>
                <button type="submit" disabled={qaBusy} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg cursor-pointer transition">{qaBusy ? 'Création...' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
