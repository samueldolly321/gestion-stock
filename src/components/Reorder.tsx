import React, { useState, useMemo } from 'react';
import { PackagePlus, ShoppingBag, AlertTriangle, Warehouse, Clock } from 'lucide-react';
import { Product, Supplier, User, Purchase } from '../types';
import { useMoney } from '../services/CurrencyContext';
import { createPurchase } from '../services/purchasesService';
import { canWrite as hasWritePerm } from '../services/permissions';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';

interface ReorderProps {
  products: Product[];
  suppliers: Supplier[];
  purchases: Purchase[];
  user: User;
  onRefresh: () => void;
  onNavigate: (tab: string) => void;
  writePerms?: Record<string, string[]> | null;
}

export default function Reorder({ products, suppliers, purchases, user, onRefresh, onNavigate, writePerms }: ReorderProps) {
  const { format } = useMoney();
  // Créer une commande = écrire dans le module Achats.
  const canWrite = useMemo(() => hasWritePerm(user.role, 'purchases', writePerms), [user.role, writePerms]);

  // Articles déjà présents dans une commande d'achat en cours (statut 'ordered', pas encore reçue).
  const pendingByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    purchases.forEach((po) => {
      if (po.status !== 'ordered') return;
      (po.items || []).forEach((it) => { m[it.productId] = (m[it.productId] || 0) + 1; });
    });
    return m;
  }, [purchases]);

  // Articles sous le seuil mini (à réapprovisionner).
  const lowStock = useMemo(
    () => products.filter((p) => p.quantity <= p.minStock).sort((a, b) => a.quantity - b.quantity),
    [products],
  );

  const suggestedQty = (p: Product) => Math.max(1, (p.maxStock || p.minStock * 2) - p.quantity);

  // Quantités à commander (modifiables).
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const getQty = (p: Product) => (qtys[p.id] !== undefined ? qtys[p.id] : suggestedQty(p));
  const setQty = (id: string, v: number) => setQtys((prev) => ({ ...prev, [id]: Math.max(0, v) }));

  // Regroupe par fournisseur (une commande = un fournisseur).
  const groups = useMemo(() => {
    const map: Record<string, { supplierId: string | null; supplierName: string; items: Product[] }> = {};
    lowStock.forEach((p) => {
      const key = p.supplierId || '__none__';
      if (!map[key]) map[key] = { supplierId: p.supplierId || null, supplierName: p.supplierName || 'Sans fournisseur', items: [] };
      map[key].items.push(p);
    });
    return Object.values(map).sort((a, b) => (a.supplierId ? -1 : 1));
  }, [lowStock]);

  const estimatedValue = useMemo(
    () => lowStock.reduce((a, p) => a + getQty(p) * p.purchasePrice, 0),
    [lowStock, qtys],
  );

  const createOrder = async (group: { supplierId: string | null; supplierName: string; items: Product[] }) => {
    if (!group.supplierId) {
      showAlert('Ces articles n\'ont pas de fournisseur. Assignez-en un dans la fiche produit avant de commander.', { variant: 'warning' });
      return;
    }
    const items = group.items
      .map((p) => {
        const q = getQty(p);
        return { productId: p.id, productName: p.name, sku: p.sku, quantity: q, unitCost: p.purchasePrice, tax: p.vatRate, total: q * p.purchasePrice };
      })
      .filter((it) => it.quantity > 0);
    if (items.length === 0) {
      showAlert('Aucune quantité à commander.', { variant: 'warning' });
      return;
    }
    const totalHt = items.reduce((a, it) => a + it.total, 0);
    const alreadyOrdered = items.filter((it) => pendingByProduct[it.productId]).length;
    const warn = alreadyOrdered > 0
      ? `\n\n⚠️ ${alreadyOrdered} de ces article(s) figurent déjà dans une commande en cours — vous risquez de commander en double.`
      : '';
    if (!(await showConfirm(
      `Créer une commande d'achat pour « ${group.supplierName} » — ${items.length} article(s), ${format(totalHt)} HT ?${warn}`,
      { title: 'Commande de réappro', variant: alreadyOrdered > 0 ? 'warning' : 'info', confirmText: 'Créer la commande' },
    ))) return;
    try {
      await createPurchase({ supplierId: group.supplierId, supplierName: group.supplierName, items, notes: 'Réapprovisionnement (seuil mini atteint)' });
      showToast(`Commande créée pour ${group.supplierName}.`, { title: 'Réapprovisionnement' });
      onRefresh();
      onNavigate('purchases');
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la création de la commande.', { variant: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Title + résumé */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-cyan-500" />
            Réapprovisionnement
          </h2>
          <p className="text-xs text-slate-400">Articles sous le seuil minimum — quantités suggérées et commandes fournisseurs.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-stretch">
          <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-right">
            <span className="text-[9px] uppercase font-mono text-amber-500 block">À réapprovisionner</span>
            <span className="text-sm font-bold font-mono text-amber-500">{lowStock.length} article(s)</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-right">
            <span className="text-[9px] uppercase font-mono text-slate-400 block">Valeur estimée (HT)</span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{format(estimatedValue)}</span>
          </div>
          {canWrite && (
            <button
              onClick={() => onNavigate('purchases')}
              title="Créer une commande d'achat pour n'importe quel article, même hors rupture"
              className="px-3 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition"
            >
              <ShoppingBag className="w-4 h-4" /> Commande libre
            </button>
          )}
        </div>
      </div>

      {lowStock.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/40 p-12 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
          ✔ Tous les stocks sont au-dessus de leur seuil minimum. Rien à réapprovisionner.
        </div>
      ) : (
        groups.map((group) => {
          const pendingInGroup = group.items.filter((p) => pendingByProduct[p.id]).length;
          return (
          <div key={group.supplierId || 'none'} className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800/60">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                <Warehouse className="w-4 h-4 text-cyan-500" />
                {group.supplierName}
                <span className="text-[10px] font-mono text-slate-400">({group.items.length})</span>
                {pendingInGroup > 0 && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{pendingInGroup} déjà commandé(s)
                  </span>
                )}
              </h3>
              {canWrite && group.supplierId && (
                <button
                  onClick={() => createOrder(group)}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition"
                >
                  <ShoppingBag className="w-4 h-4" /> Créer la commande
                </button>
              )}
              {!group.supplierId && (
                <span className="text-[10px] text-amber-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Fournisseur à assigner</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Article</th>
                    <th className="py-2.5 px-4 text-center">Stock / Seuil</th>
                    <th className="py-2.5 px-4 text-center">Statut</th>
                    <th className="py-2.5 px-4 text-center">Qté à commander</th>
                    <th className="py-2.5 px-4 text-right hidden sm:table-cell">Coût unit.</th>
                    <th className="py-2.5 px-4 text-right">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-600 dark:text-gray-300">
                  {group.items.map((p) => {
                    const q = getQty(p);
                    const out = p.quantity === 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition">
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {p.name}
                            {pendingByProduct[p.id] && (
                              <span title="Déjà présent dans une commande d'achat en cours" className="text-[8px] font-mono px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-500 flex items-center gap-0.5 shrink-0">
                                <Clock className="w-2.5 h-2.5" />EN COURS
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400">{p.sku}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span className={out ? 'text-red-500 font-bold' : 'text-amber-500 font-bold'}>{p.quantity}</span>
                          <span className="text-slate-400"> / {p.minStock}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${out ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {out ? 'RUPTURE' : 'STOCK FAIBLE'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={q}
                            onChange={(e) => setQty(p.id, Number(e.target.value))}
                            className="w-20 bg-white dark:bg-slate-950/20 p-1.5 text-xs text-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-mono"
                          />
                        </td>
                        <td className="py-3 px-4 text-right hidden sm:table-cell font-mono">{format(p.purchasePrice)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">{format(q * p.purchasePrice)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          );
        })
      )}
    </div>
  );
}
