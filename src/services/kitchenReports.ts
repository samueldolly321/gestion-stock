/**
 * Restauration — rapports cuisine (phase 2). Fonctions pures, calculées à partir :
 *  - des ventes : chaque ligne de plat porte sa recette et son coût figés au moment de la vente
 *    (`kind: 'dish'`, `cost`, `recipe`, `shortages`) ; les avoirs (type 'return') ont des
 *    quantités et montants négatifs ;
 *  - des mouvements de stock : sorties de vente (« Vente « X » ×N »), pertes de plats
 *    (« Perte « X » ×N : motif »), pertes d'ingrédients, ajustements d'inventaire.
 */
import type { Product, Sale, StockMovement } from '../types';
import { isDish, recipeCost } from './recipes';

export interface Period { from: Date; to: Date }

const inPeriod = (iso: string | undefined, p: Period) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= p.from.getTime() && t <= p.to.getTime();
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const periodDays = (p: Period) => Math.max(1, Math.round((p.to.getTime() - p.from.getTime()) / 86400000));

// ---------------------------------------------------------------- Marge par plat

export interface DishMarginRow {
  dishId: string;
  name: string;
  portions: number;      // vendues, nettes des avoirs
  revenue: number;       // CA HT, net des avoirs
  cost: number;          // coût des ingrédients consommés (les avoirs ne le réduisent pas)
  margin: number;
  marginPct: number | null;   // marge / CA
  costRatio: number | null;   // coût matière / CA
  lossPortions: number;  // pertes déclarées (« Déclarer une perte »)
  lossCost: number;
}

export function dishMargins(sales: Sale[], movements: StockMovement[], products: Product[], period: Period): DishMarginRow[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const dishIds = new Set(products.filter(isDish).map((p) => p.id));
  const rows = new Map<string, DishMarginRow>();
  const row = (id: string, name: string) => {
    if (!rows.has(id)) rows.set(id, { dishId: id, name, portions: 0, revenue: 0, cost: 0, margin: 0, marginPct: null, costRatio: null, lossPortions: 0, lossCost: 0 });
    return rows.get(id)!;
  };

  for (const s of sales) {
    if (!inPeriod(s.createdAt, period)) continue;
    if (s.type !== 'invoice' && s.type !== 'return') continue;
    for (const it of (s.items || []) as any[]) {
      const isDishLine = it.kind === 'dish' || dishIds.has(it.productId);
      if (!isDishLine) continue;
      // Une ligne de rapport par plat ET par taille (« Soupe chinoise (Grande) »).
      const baseName = it.productName || byId.get(it.productId)?.name || 'Plat';
      const r = it.size
        ? row(`${it.productId}@${it.size.id}`, `${baseName} (${it.size.label})`)
        : row(it.productId, baseName);
      const qty = Number(it.quantity) || 0;
      r.portions += qty;
      const amount = Number(it.total ?? qty * (Number(it.unitPrice) || 0)) || 0;
      // Lignes TVA comprise : on ramène au HT (part de TVA retirée).
      r.revenue += it.vatIncluded ? amount * 100 / (100 + (Number(it.tax) || 0)) : amount;
      if (s.type === 'invoice') {
        // Coût figé à la vente ; repli : coût actuel de la recette (ventes antérieures à la fonction).
        const unitCost = it.cost != null ? Number(it.cost) : recipeCost(byId.get(it.productId)?.recipe, byId);
        r.cost += unitCost * qty;
      }
    }
  }

  // Pertes de plats : mouvements « Perte « Nom » ×N : motif » regroupés par plat (référence LOSS-…).
  const lossRefs = new Map<string, { name: string; portions: number }>();
  for (const m of movements) {
    if (m.type !== 'waste_loss' || !inPeriod(m.createdAt, period)) continue;
    const match = /^Perte « (.+) » ×([\d.]+)/.exec(m.reason || '');
    if (!match) continue;
    // « Nom » ou « Nom (Taille) »
    let id = `name:${match[1]}`;
    const exact = products.find((p) => isDish(p) && p.name === match[1]);
    if (exact) id = exact.id;
    else {
      for (const p of products.filter(isDish)) {
        const s = (p.sizes || []).find((sz) => `${p.name} (${sz.label})` === match[1]);
        if (s) { id = `${p.id}@${s.id}`; break; }
      }
    }
    const r = row(id, match[1]);
    r.lossCost += Number(m.costTotal) || 0;
    const ref = m.referenceId || m.id;
    if (!lossRefs.has(ref)) { lossRefs.set(ref, { name: match[1], portions: Number(match[2]) || 0 }); r.lossPortions += Number(match[2]) || 0; }
  }

  return [...rows.values()]
    .map((r) => {
      const revenue = round2(r.revenue), cost = round2(r.cost), margin = round2(revenue - cost);
      return {
        ...r,
        portions: round3(r.portions),
        revenue, cost, margin,
        marginPct: revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null,
        costRatio: revenue > 0 ? Math.round((cost / revenue) * 1000) / 10 : null,
        lossPortions: round3(r.lossPortions),
        lossCost: round2(r.lossCost),
      };
    })
    .sort((a, b) => b.margin - a.margin);
}

// ---------------------------------------------------------- Suppléments vendus

export interface SupplementRow {
  label: string;
  count: number;    // nombre de suppléments vendus (portions × quantité de la ligne)
  revenue: number;  // prix des suppléments
  cost: number;     // coût de l'ingrédient au jour de la vente
  margin: number;
}

export function supplementsSold(sales: Sale[], period: Period): SupplementRow[] {
  const rows = new Map<string, SupplementRow>();
  for (const s of sales) {
    if (s.type !== 'invoice' || !inPeriod(s.createdAt, period)) continue;
    for (const it of (s.items || []) as any[]) {
      const qty = Number(it.quantity) || 0;
      for (const o of it.options || []) {
        const key = String(o.label).replace(/^\+\s*/, '').toLowerCase();
        if (!rows.has(key)) rows.set(key, { label: String(o.label), count: 0, revenue: 0, cost: 0, margin: 0 });
        const r = rows.get(key)!;
        r.count += qty;
        r.revenue += (Number(o.price) || 0) * qty;
        r.cost += (Number(o.cost) || 0) * qty;
      }
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, count: round3(r.count), revenue: round2(r.revenue), cost: round2(r.cost), margin: round2(r.revenue - r.cost) }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------- Consommation d'ingrédients

export interface ConsumptionRow {
  productId: string;
  name: string;
  unit: string;
  viaDishes: number;   // consommé par les plats vendus
  direct: number;      // vendu tel quel (ex. boisson)
  losses: number;      // pertes (plats jetés + pertes d'ingrédients)
  total: number;
  cost: number;
  stock: number;       // stock actuel
  perDay: number;      // consommation moyenne / jour sur la période
  daysLeft: number | null; // jours de stock au rythme actuel
}

export function ingredientConsumption(movements: StockMovement[], products: Product[], period: Period): ConsumptionRow[] {
  const days = periodDays(period);
  const rows = new Map<string, ConsumptionRow>();
  for (const p of products) {
    if (isDish(p)) continue;
    rows.set(p.id, { productId: p.id, name: p.name, unit: p.unit, viaDishes: 0, direct: 0, losses: 0, total: 0, cost: 0, stock: Number(p.quantity) || 0, perDay: 0, daysLeft: null });
  }
  for (const m of movements) {
    if (!inPeriod(m.createdAt, period)) continue;
    const r = rows.get(m.productId);
    if (!r) continue;
    const q = Math.abs(Number(m.quantity) || 0);
    if (m.type === 'exit_sale') {
      if (/^Vente « /.test(m.reason || '')) r.viaDishes += q; else r.direct += q;
      r.cost += Number(m.costTotal) || 0;
    } else if (m.type === 'waste_loss') {
      r.losses += q;
      r.cost += Number(m.costTotal) || 0;
    }
  }
  return [...rows.values()]
    .map((r) => {
      const total = round3(r.viaDishes + r.direct + r.losses);
      const perDay = round3(total / days);
      return { ...r, viaDishes: round3(r.viaDishes), direct: round3(r.direct), losses: round3(r.losses), total, cost: round2(r.cost), perDay, daysLeft: perDay > 0 ? Math.floor(r.stock / perDay) : null };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.cost - a.cost);
}

// ------------------------------------------------------------------------ Écarts

export interface GapRow {
  productId: string;
  name: string;
  unit: string;
  inventoryGap: number;   // somme des ajustements d'inventaire (négatif = manquant)
  inventoryCost: number;  // valeur du manquant (prix d'achat actuel), positif
  saleShortage: number;   // quantités manquantes au moment de vendre des plats
  saleShortageCost: number;
}

export function stockGaps(sales: Sale[], movements: StockMovement[], products: Product[], period: Period): GapRow[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = new Map<string, GapRow>();
  const row = (id: string, name: string, unit: string) => {
    if (!rows.has(id)) rows.set(id, { productId: id, name, unit, inventoryGap: 0, inventoryCost: 0, saleShortage: 0, saleShortageCost: 0 });
    return rows.get(id)!;
  };
  for (const m of movements) {
    if (m.type !== 'adjustment' || !inPeriod(m.createdAt, period) || !/inventaire/i.test(m.reason || '')) continue;
    const p = byId.get(m.productId);
    if (!p || isDish(p)) continue;
    const r = row(p.id, p.name, p.unit);
    r.inventoryGap += Number(m.quantity) || 0;
  }
  for (const s of sales) {
    if (s.type !== 'invoice' || !inPeriod(s.createdAt, period)) continue;
    for (const it of (s.items || []) as any[]) {
      for (const sh of it.shortages || []) {
        const p = byId.get(sh.ingredientId);
        const r = row(sh.ingredientId, p?.name || sh.name, p?.unit || sh.unit);
        r.saleShortage += Number(sh.missing) || 0;
      }
    }
  }
  return [...rows.values()]
    .map((r) => {
      const price = Number(byId.get(r.productId)?.purchasePrice) || 0;
      return {
        ...r,
        inventoryGap: round3(r.inventoryGap),
        inventoryCost: round2(Math.max(0, -r.inventoryGap) * price),
        saleShortage: round3(r.saleShortage),
        saleShortageCost: round2(r.saleShortage * price),
      };
    })
    .filter((r) => r.inventoryGap !== 0 || r.saleShortage > 0)
    .sort((a, b) => (b.inventoryCost + b.saleShortageCost) - (a.inventoryCost + a.saleShortageCost));
}
