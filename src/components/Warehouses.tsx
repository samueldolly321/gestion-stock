import React, { useMemo, useState } from 'react';
import {
  Warehouse as WarehouseIcon,
  ArrowRightLeft,
  Plus,
  Pencil,
  Trash2,
  Package,
  MapPin,
  Save,
  X,
  Search,
} from 'lucide-react';
import type { Warehouse, Product, ProductStock, User } from '../types';
import { createWarehouse, updateWarehouse, deleteWarehouse } from '../services/catalogService';
import { createMovement } from '../services/movementsService';
import { canWrite } from '../services/permissions';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';

interface WarehousesProps {
  warehouses: Warehouse[];
  products: Product[];
  productStock: ProductStock[];
  user: User;
  onRefresh: () => void;
  writePerms?: Record<string, string[]> | null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const emptyForm = { name: '', code: '', location: '', capacity: '', status: 'active' as 'active' | 'inactive' };

export default function Warehouses({ warehouses, products, productStock, user, onRefresh, writePerms }: WarehousesProps) {
  const canManage = canWrite(user.role, 'products', writePerms);

  // --- Répartition du stock : accès rapide qty(produit, entrepôt) ---
  const qtyOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of productStock) map.set(`${s.productId}::${s.warehouseId}`, Number(s.quantity) || 0);
    return (productId: string, warehouseId: string) => map.get(`${productId}::${warehouseId}`) || 0;
  }, [productStock]);

  // Totaux par entrepôt : nb de références en stock + total d'unités.
  const totalsByWarehouse = useMemo(() => {
    const t = new Map<string, { refs: number; units: number }>();
    for (const s of productStock) {
      const q = Number(s.quantity) || 0;
      const cur = t.get(s.warehouseId) || { refs: 0, units: 0 };
      if (q > 0) { cur.refs += 1; cur.units += q; }
      t.set(s.warehouseId, cur);
    }
    return t;
  }, [productStock]);

  // ---------------------------------------------------------------------------
  // 1. TRANSFERT DE STOCK (A → B)
  // ---------------------------------------------------------------------------
  const [tfProduct, setTfProduct] = useState('');
  const [tfFrom, setTfFrom] = useState('');
  const [tfTo, setTfTo] = useState('');
  const [tfQty, setTfQty] = useState('');
  const [tfSearch, setTfSearch] = useState('');
  const [transferring, setTransferring] = useState(false);

  const tfAvailable = tfProduct && tfFrom ? qtyOf(tfProduct, tfFrom) : 0;
  const tfProductObj = products.find((p) => p.id === tfProduct);

  const transferProducts = useMemo(() => {
    const q = tfSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').includes(q));
  }, [products, tfSearch]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tfProduct || !tfFrom || !tfTo) return showAlert('Choisissez le produit, l\'entrepôt source et l\'entrepôt destination.', { variant: 'warning' });
    if (tfFrom === tfTo) return showAlert('Les entrepôts source et destination doivent être différents.', { variant: 'warning' });
    const qty = round3(Number(tfQty) || 0);
    if (qty <= 0) return showAlert('La quantité à transférer doit être positive.', { variant: 'warning' });
    if (qty > tfAvailable) return showAlert(`Stock insuffisant dans l'entrepôt source (disponible : ${tfAvailable}).`, { variant: 'warning' });

    const fromW = warehouses.find((w) => w.id === tfFrom);
    const toW = warehouses.find((w) => w.id === tfTo);
    setTransferring(true);
    try {
      await createMovement({
        type: 'transfer',
        productId: tfProduct,
        productName: tfProductObj?.name,
        sku: tfProductObj?.sku,
        quantity: qty,
        fromWarehouseId: tfFrom,
        fromWarehouseName: fromW?.name ?? null,
        warehouseId: tfTo,
        warehouseName: toW?.name ?? null,
        reason: `Transfert ${fromW?.name || tfFrom} → ${toW?.name || tfTo}`,
      } as any);
      showToast(`${qty} × ${tfProductObj?.name || 'article'} transféré vers ${toW?.name || 'destination'}.`, { title: 'Transfert' });
      setTfQty('');
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors du transfert.', { variant: 'error' });
    } finally {
      setTransferring(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. CRUD ENTREPÔTS
  // ---------------------------------------------------------------------------
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (w: Warehouse) => {
    setEditingId(w.id);
    setForm({ name: w.name || '', code: w.code || '', location: w.location || '', capacity: w.capacity ? String(w.capacity) : '', status: w.status === 'inactive' ? 'inactive' : 'active' });
  };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm); };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return showAlert('Le nom de l\'entrepôt est requis.', { variant: 'warning' });
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      location: form.location.trim() || undefined,
      capacity: Number(form.capacity) || 0,
      status: form.status,
    };
    setSaving(true);
    try {
      if (editingId) {
        await updateWarehouse(editingId, payload);
        showToast(`Entrepôt « ${payload.name} » mis à jour.`, { title: 'Entrepôts' });
      } else {
        await createWarehouse(payload);
        showToast(`Entrepôt « ${payload.name} » créé.`, { title: 'Entrepôts' });
      }
      cancelEdit();
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de l\'enregistrement de l\'entrepôt.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWarehouse = async (w: Warehouse) => {
    const stored = totalsByWarehouse.get(w.id);
    if (stored && stored.units > 0) {
      return showAlert(`Impossible de supprimer « ${w.name} » : ${stored.units} unité(s) y sont encore stockées. Transférez-les d'abord.`, { variant: 'warning' });
    }
    if (!(await showConfirm(`Supprimer l'entrepôt « ${w.name} » ?`, { title: 'Supprimer l\'entrepôt', confirmText: 'Supprimer' }))) return;
    try {
      await deleteWarehouse(w.id);
      showToast(`Entrepôt « ${w.name} » supprimé.`, { title: 'Entrepôts', type: 'info' });
      if (editingId === w.id) cancelEdit();
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la suppression.', { variant: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // 3. RÉPARTITION DU STOCK (par entrepôt sélectionné)
  // ---------------------------------------------------------------------------
  const [viewWh, setViewWh] = useState<string>('all');
  const [stockSearch, setStockSearch] = useState('');

  const stockRows = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    return products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .map((p) => {
        const perWh = warehouses.map((w) => ({ warehouse: w, qty: qtyOf(p.id, w.id) }));
        const total = round3(perWh.reduce((s, x) => s + x.qty, 0));
        return { product: p, perWh, total };
      })
      .filter((r) => (viewWh === 'all' ? r.total > 0 : qtyOf(r.product.id, viewWh) > 0));
  }, [products, warehouses, qtyOf, viewWh, stockSearch]);

  const inputCls = 'w-full bg-white dark:bg-slate-950/40 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500';
  const labelCls = 'text-[11px] text-slate-500 dark:text-slate-400 block mb-1';

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <WarehouseIcon className="w-5 h-5 text-cyan-400" /> Entrepôts &amp; Localisations
          </h2>
          <p className="text-xs text-slate-400">Gérez vos entrepôts, suivez le stock par emplacement et transférez les produits d'un lieu à un autre.</p>
        </div>
        <span className="text-xs px-2.5 py-1 bg-cyan-500/10 text-cyan-400 font-mono rounded-lg border border-cyan-500/20">
          {warehouses.length} entrepôt(s)
        </span>
      </div>

      {/* 1. TRANSFERT */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
          <ArrowRightLeft className="w-4 h-4 text-cyan-400" /> Transférer du stock (A → B)
        </h3>
        {!canManage ? (
          <p className="text-xs text-slate-500">Vous n'avez pas les droits pour transférer du stock.</p>
        ) : warehouses.length < 2 ? (
          <p className="text-xs text-amber-500">Créez au moins deux entrepôts pour pouvoir transférer.</p>
        ) : (
          <form onSubmit={handleTransfer} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className={labelCls}>Produit</label>
                <div className="relative mb-1.5">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input type="text" value={tfSearch} onChange={(e) => setTfSearch(e.target.value)} placeholder="Filtrer par nom, SKU, code-barres…" className={`${inputCls} pl-8`} />
                </div>
                <select value={tfProduct} onChange={(e) => setTfProduct(e.target.value)} className={inputCls}>
                  <option value="">— Choisir un produit —</option>
                  {transferProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Entrepôt source</label>
                <select value={tfFrom} onChange={(e) => setTfFrom(e.target.value)} className={inputCls}>
                  <option value="">— Source —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}{tfProduct ? ` · ${qtyOf(tfProduct, w.id)} en stock` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Entrepôt destination</label>
                <select value={tfTo} onChange={(e) => setTfTo(e.target.value)} className={inputCls}>
                  <option value="">— Destination —</option>
                  {warehouses.filter((w) => w.id !== tfFrom).map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Quantité {tfProduct && tfFrom ? <span className="text-cyan-400">(dispo : {tfAvailable})</span> : null}</label>
                <input type="number" step="any" min="0" max={tfAvailable || undefined} value={tfQty} onChange={(e) => setTfQty(e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={transferring} className="w-full py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer">
                  <ArrowRightLeft className="w-4 h-4" /> {transferring ? 'Transfert…' : 'Transférer'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* 2. GESTION DES ENTREPÔTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Formulaire */}
        {canManage && (
          <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 h-fit">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              {editingId ? <Pencil className="w-4 h-4 text-cyan-400" /> : <Plus className="w-4 h-4 text-cyan-400" />}
              {editingId ? 'Modifier l\'entrepôt' : 'Nouvel entrepôt'}
            </h3>
            <form onSubmit={handleSaveWarehouse} className="space-y-2.5">
              <div>
                <label className={labelCls}>Nom *</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Entrepôt Central" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Code</label>
                  <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WH-01" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Capacité</label>
                  <input type="number" min="0" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="0" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Localisation / Adresse</label>
                <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Antananarivo" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Statut</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })} className={inputCls}>
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving} className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer">
                  <Save className="w-4 h-4" /> {saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Créer'}
                </button>
                {editingId && (
                  <button type="button" onClick={cancelEdit} className="py-2 px-3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer">
                    <X className="w-4 h-4" /> Annuler
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Liste des entrepôts */}
        <div className={`${canManage ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-2.5`}>
          {warehouses.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-xl">Aucun entrepôt. Créez-en un pour commencer.</p>
          ) : (
            warehouses.map((w) => {
              const t = totalsByWarehouse.get(w.id) || { refs: 0, units: 0 };
              return (
                <div key={w.id} className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{w.name}</span>
                      {w.code && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{w.code}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${w.status === 'inactive' ? 'bg-slate-200 dark:bg-slate-800 text-slate-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        {w.status === 'inactive' ? 'Inactif' : 'Actif'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                      {w.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {w.location}</span>}
                      <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {t.units} unité(s) · {t.refs} réf.</span>
                      {w.capacity > 0 && <span>Capacité : {w.capacity}</span>}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(w)} className="p-1.5 text-slate-500 hover:text-cyan-400 cursor-pointer" title="Modifier"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteWarehouse(w)} className="p-1.5 text-slate-500 hover:text-red-400 cursor-pointer" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. RÉPARTITION DU STOCK */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" /> Répartition du stock par entrepôt
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input type="text" value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} placeholder="Rechercher un article…" className={`${inputCls} pl-8 w-48`} />
            </div>
            <select value={viewWh} onChange={(e) => setViewWh(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="all">Tous les entrepôts</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-3 font-semibold">Article</th>
                <th className="py-2 px-3 font-semibold">SKU</th>
                {(viewWh === 'all' ? warehouses : warehouses.filter((w) => w.id === viewWh)).map((w) => (
                  <th key={w.id} className="py-2 px-3 font-semibold text-right whitespace-nowrap">{w.name}</th>
                ))}
                <th className="py-2 pl-3 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {stockRows.length === 0 ? (
                <tr><td colSpan={warehouses.length + 3} className="py-6 text-center text-slate-500">Aucun article en stock pour ce filtre.</td></tr>
              ) : (
                stockRows.map((r) => (
                  <tr key={r.product.id} className="border-b border-slate-100 dark:border-slate-800/50">
                    <td className="py-2 pr-3 font-medium text-slate-900 dark:text-white">{r.product.name}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{r.product.sku}</td>
                    {(viewWh === 'all' ? r.perWh : r.perWh.filter((x) => x.warehouse.id === viewWh)).map((x) => (
                      <td key={x.warehouse.id} className={`py-2 px-3 text-right font-mono ${x.qty > 0 ? 'text-slate-900 dark:text-slate-200' : 'text-slate-300 dark:text-slate-700'}`}>{x.qty}</td>
                    ))}
                    <td className="py-2 pl-3 text-right font-mono font-bold text-cyan-500">{r.total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
