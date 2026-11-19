/**
 * Articles à livrer : lignes « article + quantité » (décimales avec virgule acceptées).
 * Utilisé par l'ajout rapide du Calendrier et par le formulaire des Livraisons.
 * Les lignes sont gardées en texte pendant la saisie ; `toDeliveryItems()` les convertit.
 */
import React from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import type { DeliveryItem, Product, Sale } from '../types';
import { parseDecimal, fmtQty } from '../services/pack';

export interface ItemLine { productId: string; qty: string }

export const emptyLine = (): ItemLine => ({ productId: '', qty: '1' });

/** Lignes d'édition → articles enregistrés (lignes vides ou quantité ≤ 0 ignorées). */
export function toDeliveryItems(lines: ItemLine[], products: Product[]): DeliveryItem[] {
  return lines
    .map((l) => {
      const p = products.find((x) => x.id === l.productId);
      const quantity = parseDecimal(l.qty);
      return p && quantity > 0 ? { productId: p.id, productName: p.name, quantity, unit: p.unit || null } : null;
    })
    .filter(Boolean) as DeliveryItem[];
}

/** Articles enregistrés → lignes d'édition (articles supprimés du catalogue ignorés). */
export function toItemLines(items: DeliveryItem[] | null | undefined): ItemLine[] {
  return (items || []).filter((i) => i.productId).map((i) => ({ productId: i.productId!, qty: fmtQty(i.quantity) }));
}

/** Articles d'une livraison : les siens, sinon ceux de la vente liée (livraisons créées en caisse). */
export function deliveryItemsOf(d: { items?: DeliveryItem[] | null; saleId?: string | null }, sales: Sale[]): DeliveryItem[] {
  if (d.items && d.items.length) return d.items;
  const sale = d.saleId ? sales.find((s) => s.id === d.saleId) : null;
  return (sale?.items || []).map((it) => ({
    productId: it.productId,
    productName: it.productName,
    quantity: it.packQty && it.unitLabel ? it.packQty : it.quantity,
    unit: it.packQty && it.unitLabel ? it.unitLabel : null,
  }));
}

/** « Riz 25 kg × 2, Huile 1 L × 3 » */
export function itemsSummary(items: DeliveryItem[]): string {
  return items.map((i) => `${i.productName} × ${fmtQty(i.quantity)}${i.unit && !['Pièces', 'Unités'].includes(i.unit) ? ` ${i.unit}` : ''}`).join(', ');
}

const fieldCls =
  'bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

export default function DeliveryItemsEditor({
  lines, onChange, products,
}: {
  lines: ItemLine[];
  onChange: (l: ItemLine[]) => void;
  products: Product[];
}) {
  const set = (i: number, patch: Partial<ItemLine>) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-slate-500 dark:text-slate-400 flex items-center gap-1"><Package className="w-3.5 h-3.5" /> Articles à livrer</label>
        <button type="button" onClick={() => onChange([...lines, emptyLine()])} className="text-[11px] text-cyan-500 hover:underline flex items-center gap-0.5">
          <Plus className="w-3 h-3" /> Ligne
        </button>
      </div>
      {lines.length === 0 && <p className="text-[11px] text-slate-400">Aucun article : cliquez sur « Ligne » pour en ajouter.</p>}
      {lines.map((l, i) => {
        const p = products.find((x) => x.id === l.productId);
        return (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <select value={l.productId} onChange={(e) => set(i, { productId: e.target.value })} className={`col-span-7 ${fieldCls}`} aria-label="Article">
              <option value="">— Article —</option>
              {sorted.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={l.qty}
              onChange={(e) => set(i, { qty: e.target.value })}
              className={`col-span-2 ${fieldCls}`}
              aria-label="Quantité"
              title="Quantité"
            />
            <span className="col-span-2 text-[10px] text-slate-400 truncate">{p?.unit || ''}</span>
            <button type="button" onClick={() => onChange(lines.filter((_, idx) => idx !== i))} className="col-span-1 text-slate-400 hover:text-red-500 flex justify-center" aria-label="Retirer la ligne">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
