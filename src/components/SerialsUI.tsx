/**
 * Écrans des numéros de série / IMEI (high-tech) :
 *  - SerialPanel       : dans la fiche article — compteurs, ajout par scan, liste, transfert, retrait
 *  - SerialLookupModal : « Numéro de série / garantie » — retrouve un appareil, sa vente, sa garantie
 *  - SerialPicker      : en caisse — choix (ou scan) des appareils vendus
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ScanLine, Plus, ShieldCheck, ShieldAlert, ArrowRightLeft, Trash2, Ban, Search } from 'lucide-react';
import type { Product, ProductSerial, ProductStock, Warehouse } from '../types';
import { listSerials, lookupSerial, registerSerials, transferSerial, retireSerial, deleteSerial, splitSerials, type SerialLookup } from '../services/serialsService';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';

const field =
  'w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

const STATUS: Record<ProductSerial['status'], { label: string; cls: string }> = {
  in_stock: { label: 'En stock', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  sold: { label: 'Vendu', cls: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  lost: { label: 'Retiré', cls: 'bg-slate-500/10 text-slate-500' },
  defective: { label: 'Défectueux', cls: 'bg-red-500/10 text-red-500' },
};

/** « 2027-11-18 » → « 18/11/2027 » */
export const frDate = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const todayIso = () => new Date().toISOString().slice(0, 10);

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><ScanLine className="w-4 h-4 text-cyan-400" />{title}</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 text-xs">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Ajout de numéros (scan douchette : chaque code + Entrée = une ligne)
// ---------------------------------------------------------------------------------------
function AddSerialsModal({ product, warehouses, unassignedIn, onClose, onDone }: {
  product: Product;
  warehouses: Warehouse[];
  unassignedIn: (warehouseId: string) => number;
  onClose: () => void;
  onDone: () => void;
}) {
  const active = warehouses.filter((w) => w.status !== 'inactive');
  const [warehouseId, setWarehouseId] = useState(() => active.find((w) => unassignedIn(w.id) > 0)?.id || active[0]?.id || '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = splitSerials(text);
  const fill = Math.min(unassignedIn(warehouseId), list.length);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = async () => {
    if (list.length === 0) return;
    setBusy(true);
    try {
      const r = await registerSerials({ productId: product.id, warehouseId, serials: list });
      showToast(`${r.registered} numéro${r.registered > 1 ? 's' : ''} enregistré${r.registered > 1 ? 's' : ''}${r.addedToStock ? ` (+${r.addedToStock} en stock)` : ''}.`, { title: 'Numéros de série' });
      onDone();
    } catch (err: any) {
      showAlert(err?.message || 'Enregistrement impossible.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Ajouter des numéros — ${product.name}`} onClose={() => !busy && onClose()}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-slate-400 block mb-1">Entrepôt</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={field}>
            {active.map((w) => <option key={w.id} value={w.id}>{w.name}{unassignedIn(w.id) > 0 ? ` — ${unassignedIn(w.id)} pièce(s) sans numéro` : ''}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-slate-400 block mb-1">Numéros de série / IMEI — scannez-les à la suite (un par ligne)</span>
          <textarea ref={ref} rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'356938035643809\n356938035643817\n…'} className={`${field} font-mono`} />
        </label>
        <p className="text-[11px] text-slate-500">
          {list.length} numéro{list.length > 1 ? 's' : ''}
          {list.length > 0 && (fill > 0
            ? ` — ${fill} pour des pièces déjà en stock sans numéro${list.length - fill > 0 ? `, ${list.length - fill} nouvelle(s) entrée(s) en stock` : ''}.`
            : ` — nouvelle${list.length > 1 ? 's' : ''} entrée${list.length > 1 ? 's' : ''} en stock.`)}
        </p>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-semibold">Annuler</button>
          <button type="button" onClick={submit} disabled={busy || list.length === 0 || !warehouseId} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-semibold disabled:opacity-50">
            {busy ? 'Enregistrement…' : `Enregistrer ${list.length || ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------
// Panneau de la fiche article
// ---------------------------------------------------------------------------------------
export function SerialPanel({ product, warehouses, productStock, canWrite, onChanged }: {
  product: Product;
  warehouses: Warehouse[];
  productStock: ProductStock[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [serials, setSerials] = useState<ProductSerial[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState('');
  const [moving, setMoving] = useState<ProductSerial | null>(null);
  const load = () => listSerials({ productId: product.id }).then(setSerials).catch(() => setSerials([]));
  useEffect(() => { setSerials(null); load(); }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const whName = (id?: string | null) => warehouses.find((w) => w.id === id)?.name || '—';
  const inStock = (serials || []).filter((s) => s.status === 'in_stock');
  const unassignedIn = (whId: string) => {
    const qty = Number(productStock.find((s) => s.productId === product.id && s.warehouseId === whId)?.quantity) || 0;
    return Math.max(0, Math.floor(qty) - inStock.filter((s) => s.warehouseId === whId).length);
  };
  const unassigned = warehouses.reduce((n, w) => n + unassignedIn(w.id), 0);
  const shown = (serials || [])
    .filter((s) => showAll || s.status === 'in_stock')
    .filter((s) => !filter || s.serial.toUpperCase().includes(filter.trim().toUpperCase()) || (s.clientName || '').toLowerCase().includes(filter.toLowerCase()));
  const refresh = () => { load(); onChanged(); };

  const retire = async (s: ProductSerial) => {
    const ok = await showConfirm(`Retirer l'appareil ${s.serial} du stock (perdu, volé, cassé) ? Le stock diminue de 1.`, { title: 'Retirer du stock', confirmText: 'Retirer', variant: 'danger' });
    if (!ok) return;
    try { await retireSerial(s.id, 'Perte / casse', false); showToast(`Appareil ${s.serial} retiré du stock.`, { title: 'Numéros de série' }); refresh(); }
    catch (err: any) { showAlert(err?.message || 'Retrait impossible.', { variant: 'error' }); }
  };
  const remove = async (s: ProductSerial) => {
    const ok = await showConfirm(`Supprimer le numéro ${s.serial} (erreur de saisie) ? Le stock ne change pas : la pièce redevient « sans numéro ».`, { title: 'Supprimer le numéro', confirmText: 'Supprimer', variant: 'danger' });
    if (!ok) return;
    try { await deleteSerial(s.id); refresh(); }
    catch (err: any) { showAlert(err?.message || 'Suppression impossible.', { variant: 'error' }); }
  };

  return (
    <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800/60 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">Numéros de série / IMEI</h4>
        <span className="text-[10px] text-slate-400">
          {inStock.length} en stock · {(serials || []).filter((s) => s.status === 'sold').length} vendu(s)
          {product.warrantyMonths ? ` · garantie ${product.warrantyMonths} mois` : ''}
        </span>
      </div>
      {unassigned > 0 && (
        <p className="p-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px]">
          {unassigned} pièce{unassigned > 1 ? 's' : ''} en stock sans numéro : enregistrez leurs numéros pour pouvoir les vendre.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {canWrite && (
          <button type="button" onClick={() => setAdding(true)} className="px-2 py-1 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[10px] font-semibold flex items-center gap-1">
            <Plus className="w-3 h-3" /> Ajouter des numéros
          </button>
        )}
        <label className="flex items-center gap-1 text-[10px] text-slate-500 ml-auto">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-cyan-600" /> Voir vendus / retirés
        </label>
      </div>
      {(serials?.length || 0) > 6 && (
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer un numéro ou un client…" className={field} />
      )}
      <ul className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-800/60">
        {serials === null && <li className="p-3 text-slate-400 text-center">Chargement…</li>}
        {serials && shown.length === 0 && <li className="p-3 text-slate-400 text-center">{inStock.length === 0 && !showAll ? 'Aucun appareil en stock.' : 'Aucun numéro.'}</li>}
        {shown.map((s) => (
          <li key={s.id} className="p-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-mono font-semibold text-slate-900 dark:text-white break-all">{s.serial}</span>
              <span className="block text-[10px] text-slate-400">
                <span className={`inline-block px-1 rounded mr-1 ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                {s.status === 'in_stock' ? whName(s.warehouseId) : s.status === 'sold' ? `${s.invoiceNumber || ''} · ${frDate(s.soldAt)}${s.clientName ? ` · ${s.clientName}` : ''}${s.warrantyUntil ? ` · garantie → ${frDate(s.warrantyUntil)}` : ''}` : s.events[s.events.length - 1]?.label}
              </span>
            </div>
            {canWrite && s.status === 'in_stock' && (
              <div className="flex gap-1 shrink-0">
                {warehouses.length > 1 && <button type="button" title="Transférer vers un autre entrepôt" onClick={() => setMoving(s)} className="p-1 rounded hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-500"><ArrowRightLeft className="w-3.5 h-3.5" /></button>}
                <button type="button" title="Retirer du stock (perdu, cassé)" onClick={() => retire(s)} className="p-1 rounded hover:bg-amber-500/10 text-slate-400 hover:text-amber-500"><Ban className="w-3.5 h-3.5" /></button>
                <button type="button" title="Supprimer (erreur de saisie)" onClick={() => remove(s)} className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding && <AddSerialsModal product={product} warehouses={warehouses} unassignedIn={unassignedIn} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
      {moving && (
        <Modal title={`Transférer ${moving.serial}`} onClose={() => setMoving(null)}>
          <p className="text-slate-500 mb-3">Depuis <b>{whName(moving.warehouseId)}</b> vers :</p>
          <div className="grid gap-2">
            {warehouses.filter((w) => w.id !== moving.warehouseId && w.status !== 'inactive').map((w) => (
              <button key={w.id} type="button" onClick={async () => {
                try { await transferSerial(moving.id, w.id); showToast(`Appareil ${moving.serial} transféré vers ${w.name}.`, { title: 'Numéros de série' }); setMoving(null); refresh(); }
                catch (err: any) { showAlert(err?.message || 'Transfert impossible.', { variant: 'error' }); }
              }} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-left font-semibold text-slate-800 dark:text-slate-100">{w.name}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Recherche d'un appareil : statut, vente, client, garantie, historique
// ---------------------------------------------------------------------------------------
export function SerialLookupModal({ onClose, initial = '' }: { onClose: () => void; initial?: string }) {
  const [q, setQ] = useState(initial);
  const [res, setRes] = useState<SerialLookup | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setErr(''); setRes(null);
    try { setRes(await lookupSerial(q)); } catch (x: any) { setErr(x?.message || 'Introuvable.'); } finally { setBusy(false); }
  };
  useEffect(() => { if (initial) search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = res?.serial;
  const daysLeft = s?.warrantyUntil ? Math.ceil((new Date(s.warrantyUntil).getTime() - new Date(todayIso()).getTime()) / 86400000) : null;

  return (
    <Modal title="Numéro de série / garantie" onClose={onClose} wide>
      <form onSubmit={search} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scannez ou tapez le numéro de série / IMEI…" aria-label="Numéro de série" className={`${field} pl-9 font-mono`} />
        </div>
        <button type="submit" disabled={busy} className="px-4 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-semibold disabled:opacity-50">{busy ? '…' : 'Rechercher'}</button>
      </form>
      {err && <p role="alert" className="p-3 rounded-lg bg-red-500/10 text-red-500">{err}</p>}
      {s && res && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold text-slate-900 dark:text-white break-all">{s.serial}</p>
              <p className="text-slate-600 dark:text-slate-300">{res.product?.name || 'Article supprimé'} <span className="font-mono text-slate-400">{res.product?.sku}</span></p>
              <span className={`inline-block mt-1 px-1.5 py-0.5 rounded font-semibold ${STATUS[s.status].cls}`}>{STATUS[s.status].label}{s.status === 'in_stock' && res.warehouseName ? ` — ${res.warehouseName}` : ''}</span>
            </div>
            {s.status === 'sold' && (
              s.warrantyUntil ? (
                <div className={`p-2.5 rounded-lg flex items-center gap-2 ${res.warrantyActive ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                  {res.warrantyActive ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                  <div>
                    <p className="font-bold">{res.warrantyActive ? 'Sous garantie' : 'Garantie expirée'}</p>
                    <p className="text-[11px]">jusqu'au {frDate(s.warrantyUntil)}{res.warrantyActive && daysLeft !== null ? ` (${daysLeft} jour${daysLeft > 1 ? 's' : ''})` : ''}</p>
                  </div>
                </div>
              ) : <span className="text-slate-400">Vendu sans garantie</span>
            )}
          </div>
          {s.status === 'sold' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/30"><span className="text-slate-400 block text-[10px]">Facture</span><b>{s.invoiceNumber || s.saleId}</b></div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/30"><span className="text-slate-400 block text-[10px]">Date de vente</span><b>{frDate(s.soldAt)}</b></div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/30 col-span-2"><span className="text-slate-400 block text-[10px]">Client</span><b>{s.clientName || 'Client de passage'}</b></div>
            </div>
          )}
          <div>
            <h4 className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest mb-1.5">Historique de l'appareil</h4>
            <ol className="space-y-1.5 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
              {[...s.events].reverse().map((e, i) => (
                <li key={i}><span className="text-slate-400 font-mono text-[10px]">{frDate(e.at)}</span> <span className="text-slate-700 dark:text-slate-200">{e.label}</span>{e.by ? <span className="text-slate-400"> — {e.by}</span> : null}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------
// Caisse : choix des appareils vendus
// ---------------------------------------------------------------------------------------
export function SerialPicker({ product, available, already, onConfirm, onClose }: {
  product: Product;
  /** Numéros en stock dans l'entrepôt actif */
  available: ProductSerial[];
  /** Déjà dans le panier */
  already: string[];
  onConfirm: (serials: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(already);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const list = useMemo(() => available.filter((s) => !q || s.serial.toUpperCase().includes(q.trim().toUpperCase())), [available, q]);
  const toggle = (sn: string) => setPicked((p) => (p.includes(sn) ? p.filter((x) => x !== sn) : [...p, sn]));
  const onScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = q.trim();
    const hit = available.find((s) => s.serial.toUpperCase() === code.toUpperCase());
    if (hit) { if (!picked.includes(hit.serial)) setPicked((p) => [...p, hit.serial]); setQ(''); }
  };
  return (
    <Modal title={`Choisir les appareils — ${product.name}`} onClose={onClose}>
      <div className="space-y-3">
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onScan} placeholder="Scanner l'IMEI (douchette) ou filtrer…" aria-label="Scanner ou filtrer un numéro" className={`${field} font-mono`} />
        {available.length === 0 ? (
          <p className="p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">Aucun appareil avec numéro dans cet entrepôt. Enregistrez les numéros dans la fiche article (Articles &amp; Stocks).</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-800/60">
            {list.map((s) => (
              <li key={s.id}>
                <label className="p-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <input type="checkbox" checked={picked.includes(s.serial)} onChange={() => toggle(s.serial)} className="w-4 h-4 accent-cyan-600" />
                  <span className="font-mono font-semibold text-slate-900 dark:text-white break-all">{s.serial}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <span className="text-slate-500">{picked.length} appareil{picked.length > 1 ? 's' : ''} choisi{picked.length > 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-semibold">Annuler</button>
            <button type="button" onClick={() => onConfirm(picked)} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-semibold">Valider</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
