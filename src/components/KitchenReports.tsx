/**
 * Restauration — rapports cuisine : marge par plat, consommation d'ingrédients, écarts.
 * Données : ventes (recette et coût figés par ligne de plat) + mouvements de stock.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import type { Product, Sale, StockMovement } from '../types';
import { listSales } from '../services/salesService';
import { listMovements } from '../services/movementsService';
import { exportExcel } from '../services/exportExcel';
import { fmtQty } from '../services/pack';
import { dishMargins, ingredientConsumption, stockGaps, periodDays, type Period, type DishMarginRow, type ConsumptionRow, type GapRow } from '../services/kitchenReports';

type Preset = '7' | '30' | 'month' | 'custom';

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pct = (v: number | null) => (v == null ? '—' : `${String(v).replace('.', ',')} %`);

const th = 'py-2.5 px-3 text-[10px] font-mono text-slate-400 uppercase tracking-wider';
const td = 'py-2.5 px-3';
const card = 'bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm';

export default function KitchenReports({ products, format }: { products: Product[]; format: (n: number) => string }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('30');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([listSales(), listMovements()]);
      setSales(s);
      setMovements(m);
    } catch (e: any) {
      setError(e?.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const period: Period = useMemo(() => {
    const now = new Date();
    if (preset === '7') return { from: dayStart(new Date(now.getTime() - 6 * 86400000)), to: dayEnd(now) };
    if (preset === '30') return { from: dayStart(new Date(now.getTime() - 29 * 86400000)), to: dayEnd(now) };
    if (preset === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: dayEnd(now) };
    const f = new Date(from + 'T00:00:00'), t = new Date(to + 'T00:00:00');
    return { from: dayStart(f <= t ? f : t), to: dayEnd(f <= t ? t : f) };
  }, [preset, from, to]);

  const margins = useMemo(() => dishMargins(sales, movements, products, period), [sales, movements, products, period]);
  const consumption = useMemo(() => ingredientConsumption(movements, products, period), [movements, products, period]);
  const gaps = useMemo(() => stockGaps(sales, movements, products, period), [sales, movements, products, period]);

  const totals = useMemo(() => {
    const revenue = margins.reduce((s, r) => s + r.revenue, 0);
    const cost = margins.reduce((s, r) => s + r.cost, 0);
    const losses = margins.reduce((s, r) => s + r.lossCost, 0); // plats déclarés perdus
    return {
      revenue, cost, margin: revenue - cost,
      marginPct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null,
      costRatio: revenue > 0 ? Math.round((cost / revenue) * 1000) / 10 : null,
      portions: margins.reduce((s, r) => s + r.portions, 0),
      lossCost: losses,
      gapCost: gaps.reduce((s, r) => s + r.inventoryCost + r.saleShortageCost, 0),
    };
  }, [margins, consumption, gaps]);

  const label = `${period.from.toLocaleDateString('fr-FR')} → ${period.to.toLocaleDateString('fr-FR')}`;
  const fileTag = `${iso(period.from)}_${iso(period.to)}`;

  const exportMargins = () => exportExcel<DishMarginRow>(`marge-par-plat_${fileTag}`, 'Marge par plat', [
    { label: 'Plat', value: (r) => r.name },
    { label: 'Portions vendues', value: (r) => r.portions },
    { label: 'CA HT', value: (r) => Math.round(r.revenue) },
    { label: 'Coût matière', value: (r) => Math.round(r.cost) },
    { label: 'Marge', value: (r) => Math.round(r.margin) },
    { label: 'Marge %', value: (r) => r.marginPct ?? '' },
    { label: 'Coût matière %', value: (r) => r.costRatio ?? '' },
    { label: 'Portions perdues', value: (r) => r.lossPortions },
    { label: 'Coût des pertes', value: (r) => Math.round(r.lossCost) },
  ], margins);
  const exportConsumption = () => exportExcel<ConsumptionRow>(`consommation-ingredients_${fileTag}`, 'Consommation', [
    { label: 'Ingrédient', value: (r) => r.name },
    { label: 'Unité', value: (r) => r.unit },
    { label: 'Pour les plats', value: (r) => r.viaDishes },
    { label: 'Vendu tel quel', value: (r) => r.direct },
    { label: 'Pertes', value: (r) => r.losses },
    { label: 'Total', value: (r) => r.total },
    { label: 'Coût', value: (r) => Math.round(r.cost) },
    { label: 'Moyenne / jour', value: (r) => r.perDay },
    { label: 'Stock actuel', value: (r) => r.stock },
    { label: 'Jours de stock', value: (r) => r.daysLeft ?? '' },
  ], consumption);
  const exportGaps = () => exportExcel<GapRow>(`ecarts_${fileTag}`, 'Écarts', [
    { label: 'Ingrédient', value: (r) => r.name },
    { label: 'Unité', value: (r) => r.unit },
    { label: 'Écart inventaire', value: (r) => r.inventoryGap },
    { label: 'Valeur manquante', value: (r) => Math.round(r.inventoryCost) },
    { label: 'Manque à la vente', value: (r) => r.saleShortage },
    { label: 'Valeur manque vente', value: (r) => Math.round(r.saleShortageCost) },
  ], gaps);

  const exportBtn = (onClick: () => void, disabled: boolean) => (
    <button onClick={onClick} disabled={disabled} className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1">
      <Download className="w-3.5 h-3.5 text-emerald-500" /> Excel
    </button>
  );

  return (
    <div className="space-y-5" data-testid="kitchen-reports">
      {/* Période */}
      <div className={`${card} p-4 flex flex-wrap items-center gap-2 text-xs`}>
        <BarChart3 className="w-4 h-4 text-cyan-500" />
        <span className="font-bold text-slate-900 dark:text-white mr-2">Période</span>
        {([['7', '7 jours'], ['30', '30 jours'], ['month', 'Ce mois-ci'], ['custom', 'Dates…']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setPreset(k)} aria-pressed={preset === k}
            className={`px-3 py-1.5 rounded-lg font-semibold ${preset === k ? 'bg-cyan-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
            {l}
          </button>
        ))}
        {preset === 'custom' && (
          <span className="flex items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Du" className="bg-white dark:bg-slate-950/20 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" />
            <span className="text-slate-400">au</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Au" className="bg-white dark:bg-slate-950/20 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" />
          </span>
        )}
        <span className="text-slate-400 ml-auto">{label} · {periodDays(period)} j</span>
        <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-500" title="Actualiser" aria-label="Actualiser"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      {/* Indicateurs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="kitchen-kpis">
        {[
          ['CA des plats (HT)', format(Math.round(totals.revenue)), `${fmtQty(totals.portions)} portions`, 'text-slate-900 dark:text-white'],
          ['Coût matière', format(Math.round(totals.cost)), pct(totals.costRatio) + ' du CA', totals.costRatio != null && totals.costRatio > 40 ? 'text-amber-500' : 'text-slate-900 dark:text-white'],
          ['Marge brute', format(Math.round(totals.margin)), pct(totals.marginPct) + ' du CA', totals.margin < 0 ? 'text-red-500' : 'text-emerald-500'],
          ['Pertes de plats', format(Math.round(totals.lossCost)), 'plats déclarés perdus', totals.lossCost > 0 ? 'text-amber-500' : 'text-slate-900 dark:text-white'],
          ['Écarts de stock', format(Math.round(totals.gapCost)), 'inventaire + manques', totals.gapCost > 0 ? 'text-red-500' : 'text-slate-900 dark:text-white'],
        ].map(([t, v, sub, cls]) => (
          <div key={t} className={`${card} p-3.5`}>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{t}</p>
            <p className={`text-lg font-bold font-mono mt-1 ${cls}`}>{v}</p>
            <p className="text-[10px] text-slate-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Marge par plat */}
      <section className={card}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Marge par plat</h3>
            <p className="text-[11px] text-slate-400">CA HT net des avoirs, hors remise globale du ticket. Coût = ingrédients au prix d'achat du jour de la vente.</p>
          </div>
          {exportBtn(exportMargins, margins.length === 0)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="report-margins">
            <thead><tr className="border-b border-slate-200 dark:border-slate-800/60">
              <th className={th}>Plat</th><th className={`${th} text-right`}>Portions</th><th className={`${th} text-right`}>CA HT</th>
              <th className={`${th} text-right`}>Coût matière</th><th className={`${th} text-right`}>Marge</th><th className={`${th} text-right`}>Marge %</th>
              <th className={`${th} text-right`}>Coût matière %</th><th className={`${th} text-right`}>Pertes</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40">
              {margins.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-500">{loading ? 'Chargement…' : 'Aucun plat vendu sur cette période.'}</td></tr>
              ) : margins.map((r) => (
                <tr key={r.dishId}>
                  <td className={`${td} font-semibold text-slate-900 dark:text-white`}>{r.name}</td>
                  <td className={`${td} text-right font-mono`}>{fmtQty(r.portions)}</td>
                  <td className={`${td} text-right font-mono`}>{format(Math.round(r.revenue))}</td>
                  <td className={`${td} text-right font-mono`}>{format(Math.round(r.cost))}</td>
                  <td className={`${td} text-right font-mono ${r.margin < 0 ? 'text-red-500' : 'text-emerald-500'}`}>{format(Math.round(r.margin))}</td>
                  <td className={`${td} text-right font-mono`}>{pct(r.marginPct)}</td>
                  <td className={`${td} text-right font-mono ${r.costRatio != null && r.costRatio > 60 ? 'text-red-500' : r.costRatio != null && r.costRatio > 40 ? 'text-amber-500' : ''}`}>{pct(r.costRatio)}</td>
                  <td className={`${td} text-right font-mono ${r.lossPortions ? 'text-amber-500' : 'text-slate-400'}`}>{r.lossPortions ? `${fmtQty(r.lossPortions)} · ${format(Math.round(r.lossCost))}` : '—'}</td>
                </tr>
              ))}
            </tbody>
            {margins.length > 0 && (
              <tfoot><tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white">
                <td className={td}>Total</td><td className={`${td} text-right font-mono`}>{fmtQty(totals.portions)}</td>
                <td className={`${td} text-right font-mono`}>{format(Math.round(totals.revenue))}</td><td className={`${td} text-right font-mono`}>{format(Math.round(totals.cost))}</td>
                <td className={`${td} text-right font-mono`}>{format(Math.round(totals.margin))}</td><td className={`${td} text-right font-mono`}>{pct(totals.marginPct)}</td>
                <td className={`${td} text-right font-mono`}>{pct(totals.costRatio)}</td><td className={`${td} text-right font-mono`}>{totals.lossCost ? format(Math.round(totals.lossCost)) : '—'}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Consommation d'ingrédients */}
      <section className={card}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Consommation d'ingrédients</h3>
            <p className="text-[11px] text-slate-400">Sorties réelles du stock sur la période. « Jours de stock » = stock actuel ÷ consommation moyenne par jour.</p>
          </div>
          {exportBtn(exportConsumption, consumption.length === 0)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="report-consumption">
            <thead><tr className="border-b border-slate-200 dark:border-slate-800/60">
              <th className={th}>Ingrédient</th><th className={`${th} text-right`}>Pour les plats</th><th className={`${th} text-right`}>Vendu tel quel</th>
              <th className={`${th} text-right`}>Pertes</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Coût</th>
              <th className={`${th} text-right`}>Moy. / jour</th><th className={`${th} text-right`}>Stock</th><th className={`${th} text-right`}>Jours de stock</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40">
              {consumption.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-slate-500">{loading ? 'Chargement…' : 'Aucune sortie de stock sur cette période.'}</td></tr>
              ) : consumption.map((r) => (
                <tr key={r.productId}>
                  <td className={`${td} font-semibold text-slate-900 dark:text-white`}>{r.name}</td>
                  <td className={`${td} text-right font-mono`}>{r.viaDishes ? `${fmtQty(r.viaDishes)} ${r.unit}` : '—'}</td>
                  <td className={`${td} text-right font-mono`}>{r.direct ? `${fmtQty(r.direct)} ${r.unit}` : '—'}</td>
                  <td className={`${td} text-right font-mono ${r.losses ? 'text-amber-500' : 'text-slate-400'}`}>{r.losses ? `${fmtQty(r.losses)} ${r.unit}` : '—'}</td>
                  <td className={`${td} text-right font-mono font-semibold`}>{fmtQty(r.total)} {r.unit}</td>
                  <td className={`${td} text-right font-mono`}>{format(Math.round(r.cost))}</td>
                  <td className={`${td} text-right font-mono text-slate-500`}>{fmtQty(r.perDay)}</td>
                  <td className={`${td} text-right font-mono`}>{fmtQty(r.stock)} {r.unit}</td>
                  <td className={`${td} text-right font-mono font-semibold ${r.daysLeft == null ? 'text-slate-400' : r.daysLeft <= 2 ? 'text-red-500' : r.daysLeft <= 7 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {r.daysLeft == null ? '—' : `${r.daysLeft} j`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Écarts */}
      <section className={card}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Écarts de stock</h3>
            <p className="text-[11px] text-slate-400">
              <b>Écart inventaire</b> : différence trouvée lors d'un inventaire (négatif = il manque de la marchandise : perte non déclarée, portions trop généreuses…).
              {' '}<b>Manque à la vente</b> : quantités qui n'étaient pas en stock au moment de vendre un plat (réception ou inventaire oublié).
            </p>
          </div>
          {exportBtn(exportGaps, gaps.length === 0)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="report-gaps">
            <thead><tr className="border-b border-slate-200 dark:border-slate-800/60">
              <th className={th}>Ingrédient</th><th className={`${th} text-right`}>Écart inventaire</th><th className={`${th} text-right`}>Valeur manquante</th>
              <th className={`${th} text-right`}>Manque à la vente</th><th className={`${th} text-right`}>Valeur</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40">
              {gaps.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">{loading ? 'Chargement…' : 'Aucun écart sur cette période.'}</td></tr>
              ) : gaps.map((r) => (
                <tr key={r.productId}>
                  <td className={`${td} font-semibold text-slate-900 dark:text-white`}>{r.name}</td>
                  <td className={`${td} text-right font-mono ${r.inventoryGap < 0 ? 'text-red-500' : r.inventoryGap > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {r.inventoryGap ? `${r.inventoryGap > 0 ? '+' : ''}${fmtQty(r.inventoryGap)} ${r.unit}` : '—'}
                  </td>
                  <td className={`${td} text-right font-mono`}>{r.inventoryCost ? format(Math.round(r.inventoryCost)) : '—'}</td>
                  <td className={`${td} text-right font-mono ${r.saleShortage ? 'text-amber-500' : 'text-slate-400'}`}>{r.saleShortage ? `${fmtQty(r.saleShortage)} ${r.unit}` : '—'}</td>
                  <td className={`${td} text-right font-mono`}>{r.saleShortageCost ? format(Math.round(r.saleShortageCost)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
