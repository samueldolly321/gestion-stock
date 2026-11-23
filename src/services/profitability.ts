/**
 * Comptabilité : résultat d'une période (fonction UNIQUE, utilisée par les États et par la
 * Rentabilité) et suivi du retour sur investissement (fonds de départ).
 *
 * Résultat = ventes HT (nettes des avoirs, hors frais de livraison)
 *          − coût des produits vendus (coût historique des mouvements de vente − retours)
 *          − dépenses de la période.
 *
 * Les frais de livraison encaissés sur une facture sont reversés au prestataire : ils ne
 * font jamais partie du chiffre d'affaires (voir saleRevenue).
 */
import type { Sale, Purchase, Expense, StockMovement } from '../types';

/** Chiffre d'affaires TTC d'une vente / d'un avoir : total moins les frais de livraison. */
export const saleRevenue = (s: Pick<Sale, 'totalAmount' | 'deliveryFee'>) =>
  (Number(s.totalAmount) || 0) - (Number(s.deliveryFee) || 0);

export interface AccountingData {
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  movements: StockMovement[];
}

export interface PeriodFigures {
  caHT: number;
  tvaCollectee: number;
  cogs: number;
  margeBrute: number;
  tauxMarge: number;
  tvaDeductible: number;
  charges: number;
  resultatNet: number;
  tvaNette: number;
  nbFactures: number;
  nbAvoirs: number;
  nbAchats: number;
  nbFrais: number;
}

export function periodFigures(d: AccountingData, start: Date, end: Date): PeriodFigures {
  const s0 = start.getTime(), s1 = end.getTime();
  const inR = (ds?: string | null) => { if (!ds) return false; const t = new Date(ds).getTime(); return t >= s0 && t <= s1; };
  const salesIn = d.sales.filter((s) => inR(s.createdAt));
  const invoices = salesIn.filter((s) => s.type !== 'return');
  const avoirs = salesIn.filter((s) => s.type === 'return');
  const caHT = salesIn.reduce((a, s) => a + (saleRevenue(s) - (Number(s.vatAmount) || 0)), 0);
  const tvaCollectee = salesIn.reduce((a, s) => a + (Number(s.vatAmount) || 0), 0);
  // Coût des produits vendus au COÛT HISTORIQUE (mouvements de vente), moins les retours réintégrés.
  const cogs = d.movements.filter((m) => inR(m.createdAt)).reduce((a, m) => {
    if (m.type === 'exit_sale') return a + (Number(m.costTotal) || 0);
    if (m.type === 'entry_return') return a - (Number(m.costTotal) || 0);
    return a;
  }, 0);
  const margeBrute = caHT - cogs;
  const purchasesIn = d.purchases.filter((p) => p.status !== 'cancelled' && inR(p.createdAt));
  const tvaDeductible = purchasesIn.reduce((a, p) => a + (Number(p.vatAmount) || 0), 0);
  const expensesIn = d.expenses.filter((e) => inR(e.date || e.createdAt));
  const charges = expensesIn.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const resultatNet = margeBrute - charges;
  return {
    caHT, tvaCollectee, cogs, margeBrute, tauxMarge: caHT > 0 ? (margeBrute / caHT) * 100 : 0, tvaDeductible, charges,
    resultatNet, tvaNette: tvaCollectee - tvaDeductible, nbFactures: invoices.length, nbAvoirs: avoirs.length, nbAchats: purchasesIn.length, nbFrais: expensesIn.length,
  };
}

// ------------------------------------------------------------------ Retour sur investissement

export interface InvestmentItem { label: string; amount: number }
export interface Investment { openingDate: string; items: InvestmentItem[] }

export const investmentTotal = (inv?: Investment | null) => (inv?.items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0);

export interface MonthRow {
  key: string;        // AAAA-MM
  label: string;      // « nov. 2026 »
  start: Date;
  end: Date;
  partial: boolean;   // mois en cours (ou mois d'ouverture commencé en cours de route)
  result: number;     // résultat du mois
  cumulative: number; // cumul depuis l'ouverture
  caHT: number;
  charges: number;
}

export interface Payback {
  total: number;            // fonds de départ
  recovered: number;        // cumul des résultats depuis l'ouverture
  remaining: number;        // reste à récupérer (≥ 0)
  pct: number;              // % récupéré (0–100, plafonné)
  monthlyRate: number;      // bénéfice moyen / mois retenu pour l'estimation
  rateBasis: string;        // explication du rythme retenu
  monthsLeft: number | null;// mois restants estimés (null si impossible)
  estimatedDate: Date | null;
  paidBackOn: string | null;// mois où le cumul a dépassé le fonds (si déjà amorti)
  daysOpen: number;
  months: MonthRow[];
}

const DAY = 86400000;
const monthLabel = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });

/** Mois depuis l'ouverture jusqu'à `now`, avec résultat mensuel et cumul. */
export function monthlyResults(d: AccountingData, openingDate: string, now = new Date()): MonthRow[] {
  const open = new Date(`${openingDate}T00:00:00`);
  if (Number.isNaN(open.getTime()) || open > now) return [];
  const rows: MonthRow[] = [];
  let cursor = new Date(open.getFullYear(), open.getMonth(), 1);
  let cumulative = 0;
  while (cursor <= now) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    const start = monthStart < open ? open : monthStart;
    const end = monthEnd > now ? now : monthEnd;
    const f = periodFigures(d, start, end);
    cumulative += f.resultatNet;
    rows.push({
      key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      label: monthLabel(monthStart),
      start, end,
      partial: start > monthStart || end < monthEnd,
      result: f.resultatNet,
      cumulative,
      caHT: f.caHT,
      charges: f.charges,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return rows;
}

/**
 * Où en est l'amortissement du fonds de départ, et dans combien de temps sera-t-il récupéré ?
 * Rythme retenu : moyenne des 3 derniers mois COMPLETS ; à défaut (moins d'un mois complet),
 * le bénéfice depuis l'ouverture ramené à un mois de 30,4 jours.
 */
export function payback(d: AccountingData, inv: Investment | null | undefined, now = new Date()): Payback | null {
  if (!inv?.openingDate) return null;
  const total = investmentTotal(inv);
  const months = monthlyResults(d, inv.openingDate, now);
  const recovered = months.length ? months[months.length - 1].cumulative : 0;
  const open = new Date(`${inv.openingDate}T00:00:00`);
  const daysOpen = Math.max(1, Math.round((now.getTime() - open.getTime()) / DAY));
  const complete = months.filter((m) => !m.partial);
  let monthlyRate: number;
  let rateBasis: string;
  if (complete.length) {
    const last = complete.slice(-3);
    monthlyRate = last.reduce((a, m) => a + m.result, 0) / last.length;
    rateBasis = last.length === 1 ? `bénéfice du dernier mois complet (${last[0].label})` : `moyenne des ${last.length} derniers mois complets`;
  } else {
    monthlyRate = (recovered / daysOpen) * 30.4;
    rateBasis = `bénéfice des ${daysOpen} jour${daysOpen > 1 ? 's' : ''} depuis l'ouverture, ramené à un mois`;
  }
  const remaining = Math.max(0, total - recovered);
  let monthsLeft: number | null = null;
  let estimatedDate: Date | null = null;
  if (remaining === 0) monthsLeft = 0;
  else if (monthlyRate > 0) {
    monthsLeft = remaining / monthlyRate;
    estimatedDate = new Date(now.getTime() + monthsLeft * 30.4 * DAY);
  }
  const crossed = total > 0 ? months.find((m) => m.cumulative >= total) : undefined;
  return {
    total, recovered, remaining,
    pct: total > 0 ? Math.max(0, Math.min(100, (recovered / total) * 100)) : 0,
    monthlyRate, rateBasis, monthsLeft, estimatedDate,
    paidBackOn: crossed ? crossed.label : null,
    daysOpen, months,
  };
}

/** « 14 mois », « 2 ans et 3 mois », « moins d'un mois ». */
export function formatDuration(months: number): string {
  if (months < 1) return "moins d'un mois";
  const m = Math.ceil(months);
  if (m < 12) return `${m} mois`;
  const y = Math.floor(m / 12), r = m % 12;
  return `${y} an${y > 1 ? 's' : ''}${r ? ` et ${r} mois` : ''}`;
}
