import React, { useMemo, useState } from 'react';
import { Landmark, Receipt, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Download, Scale, Info } from 'lucide-react';
import { Sale, Purchase, Expense, Product, StockMovement, Delivery } from '../types';
import { useMoney } from '../services/CurrencyContext';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import { showToast } from '../services/toast';
import { periodRange, shiftAnchor, type Gran } from '../services/period';

interface AccountingProps {
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  products: Product[];
  movements: StockMovement[];
  deliveries: Delivery[];
}

export default function Accounting({ sales, purchases, expenses, products, movements, deliveries }: AccountingProps) {
  const { format } = useMoney();
  const [gran, setGran] = useState<Gran>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const range = useMemo(() => periodRange(gran, anchor), [gran, anchor]);

  const shift = (dir: number) => setAnchor((a) => shiftAnchor(gran, a, dir));

  const f = useMemo(() => {
    const s0 = range.start.getTime(), s1 = range.end.getTime();
    const inR = (ds?: string | null) => { if (!ds) return false; const t = new Date(ds).getTime(); return t >= s0 && t <= s1; };
    // Frais de livraison facturés sur une vente (table deliveries) — à exclure du CA.
    const deliveryForSale = (saleId: string) => deliveries.filter((d) => d.saleId === saleId).reduce((a, d) => a + (Number(d.fee) || 0), 0);

    const salesIn = sales.filter((s) => inR(s.createdAt));
    const invoices = salesIn.filter((s) => s.type !== 'return');
    const avoirs = salesIn.filter((s) => s.type === 'return');

    // CA HT net : total TTC − TVA − frais de livraison (le transport n'est pas du CA
    // marchandises et n'a pas de COGS en face). Les avoirs (négatifs) se nettent.
    const caHT = salesIn.reduce((a, s) => a + ((Number(s.totalAmount) || 0) - (Number(s.vatAmount) || 0) - deliveryForSale(s.id)), 0);
    const tvaCollectee = salesIn.reduce((a, s) => a + (Number(s.vatAmount) || 0), 0);
    // COGS au COÛT HISTORIQUE : coût réel enregistré dans les mouvements de stock au moment
    // de la vente (exit_sale), diminué des retours réintégrés (entry_return) sur la période.
    // Robuste aux variations de prix d'achat (contrairement au prix « fiche » courant).
    const movementsIn = movements.filter((m) => inR(m.createdAt));
    const cogs = movementsIn.reduce((a, m) => {
      if (m.type === 'exit_sale') return a + (Number(m.costTotal) || 0);
      if (m.type === 'entry_return') return a - (Number(m.costTotal) || 0);
      return a;
    }, 0);
    const margeBrute = caHT - cogs;

    const purchasesIn = purchases.filter((p) => p.status !== 'cancelled' && inR(p.createdAt));
    const tvaDeductible = purchasesIn.reduce((a, p) => a + (Number(p.vatAmount) || 0), 0);

    const expensesIn = expenses.filter((e) => inR(e.date || e.createdAt));
    const charges = expensesIn.reduce((a, e) => a + (Number(e.amount) || 0), 0);

    const resultatNet = margeBrute - charges;
    const tvaNette = tvaCollectee - tvaDeductible;
    const tauxMarge = caHT > 0 ? (margeBrute / caHT) * 100 : 0;

    return { caHT, tvaCollectee, cogs, margeBrute, tauxMarge, tvaDeductible, charges, resultatNet, tvaNette, nbFactures: invoices.length, nbAvoirs: avoirs.length, nbAchats: purchasesIn.length, nbFrais: expensesIn.length };
  }, [sales, purchases, expenses, movements, deliveries, range]);

  const exportRows = [
    { poste: 'Ventes (hors taxe)', montant: format(f.caHT) },
    { poste: "Coût d'achat des produits vendus", montant: format(-f.cogs) },
    { poste: 'Marge brute', montant: format(f.margeBrute) },
    { poste: 'Frais divers', montant: format(-f.charges) },
    { poste: f.resultatNet >= 0 ? 'Bénéfice de la période' : 'Perte de la période', montant: format(f.resultatNet) },
    { poste: 'TVA encaissée sur ventes', montant: format(f.tvaCollectee) },
    { poste: 'TVA payée sur achats', montant: format(f.tvaDeductible) },
    { poste: f.tvaNette >= 0 ? "TVA à reverser à l'État" : 'Crédit de TVA', montant: format(f.tvaNette) },
  ];
  const cols = [
    { label: 'Poste', value: (r: { poste: string; montant: string }) => r.poste },
    { label: 'Montant', value: (r: { poste: string; montant: string }) => r.montant },
  ];
  const handleExport = (fmt: 'pdf' | 'excel') => {
    const name = `etat_comptable_${range.label.replace(/\s+/g, '_')}`;
    if (fmt === 'excel') exportExcel(name, 'État comptable', cols, exportRows);
    else exportPdf(name, `État comptable — ${range.label}`, cols, exportRows);
    showToast(`État comptable exporté (${fmt.toUpperCase()}).`, { title: 'Comptabilité' });
  };

  const Row = ({ label, value, kind = 'plain', hint }: { label: string; value: number; kind?: 'plain' | 'sub' | 'total' | 'result'; hint?: string }) => (
    <div className={`flex justify-between items-baseline gap-3 ${kind === 'total' || kind === 'result' ? 'border-t border-slate-200 dark:border-slate-800 pt-2 mt-1' : ''}`}>
      <span className={`${kind === 'total' || kind === 'result' ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'} text-xs`}>
        {label}{hint && <span className="text-[10px] text-slate-400 font-normal"> · {hint}</span>}
      </span>
      <span className={`font-mono ${kind === 'result' ? (value >= 0 ? 'text-cyan-500 text-base font-bold' : 'text-red-500 text-base font-bold') : kind === 'total' ? 'font-bold text-slate-900 dark:text-white' : value < 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>
        {format(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* En-tête + période */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-cyan-500" />
            Comptabilité — États
          </h2>
          <p className="text-xs text-slate-400">État de TVA et compte de résultat sur la période sélectionnée.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex bg-slate-100 dark:bg-slate-800/60 rounded-lg p-0.5">
            {(['month', 'quarter', 'year'] as Gran[]).map((g) => (
              <button key={g} onClick={() => setGran(g)} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${gran === g ? 'bg-cyan-500 text-white' : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                {g === 'month' ? 'Mois' : g === 'quarter' ? 'Trimestre' : 'Année'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg px-1">
            <button onClick={() => shift(-1)} title="Période précédente" className="p-1.5 text-slate-400 hover:text-cyan-500"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-semibold text-slate-900 dark:text-white min-w-[110px] text-center">{range.label}</span>
            <button onClick={() => shift(1)} title="Période suivante" className="p-1.5 text-slate-400 hover:text-cyan-500"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <button onClick={() => handleExport('pdf')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5"><Download className="w-4 h-4 text-red-500" /> PDF</button>
          <button onClick={() => handleExport('excel')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5"><Download className="w-4 h-4 text-green-700" /> Excel</button>
        </div>
      </div>

      {/* Bandeau explicatif (pour tout utilisateur, comptable ou non) */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4 flex gap-3 items-start">
        <Info className="w-4 h-4 text-cyan-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Cette page résume, sur la période choisie, <strong>ce que vous devez à l'État en TVA</strong> et <strong>si votre activité a gagné ou perdu de l'argent</strong>.
          « HT » = hors taxe (montant sans la TVA).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* État de TVA */}
        <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1"><Receipt className="w-4 h-4 text-cyan-500" />TVA — ce que vous devez à l'État</h3>
          <p className="text-[10px] text-slate-400 mb-4">La TVA que vous encaissez sur vos ventes, moins celle que vous payez sur vos achats.</p>
          <div className="space-y-2">
            <Row label="TVA encaissée sur vos ventes" value={f.tvaCollectee} hint={`payée par vos clients · ${f.nbFactures} facture(s)${f.nbAvoirs ? `, ${f.nbAvoirs} avoir(s)` : ''}`} />
            <Row label="TVA payée sur vos achats" value={-f.tvaDeductible} hint={`récupérable · ${f.nbAchats} achat(s)`} />
            <Row label={f.tvaNette >= 0 ? 'TVA à reverser à l\'État' : 'Crédit de TVA en votre faveur'} value={f.tvaNette} kind="result" />
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            {f.tvaNette >= 0
              ? 'C\'est le montant que vous devez verser à l\'administration fiscale pour la période.'
              : 'Vous avez payé plus de TVA (achats) que vous n\'en avez encaissée (ventes) : l\'État vous doit ce montant (reportable ou remboursable).'}
          </p>
        </div>

        {/* Compte de résultat */}
        <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1"><Scale className="w-4 h-4 text-cyan-500" />Résultat — avez-vous gagné de l'argent ?</h3>
          <p className="text-[10px] text-slate-400 mb-4">Vos ventes, moins ce que les produits vous ont coûté, moins vos frais.</p>
          <div className="space-y-2">
            <Row label="Ventes (hors taxe)" value={f.caHT} hint="net des avoirs" />
            <Row label="− Coût d'achat des produits vendus" value={-f.cogs} />
            <Row label="= Marge brute" value={f.margeBrute} kind="total" hint={`${f.tauxMarge.toFixed(1)} % des ventes`} />
            <Row label="− Frais divers (transport, douane…)" value={-f.charges} hint={`${f.nbFrais} poste(s)`} />
            <Row label={f.resultatNet >= 0 ? '= Bénéfice de la période' : '= Perte de la période'} value={f.resultatNet} kind="result" />
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            Le coût est estimé au prix d'achat actuel des articles vendus. Les achats de marchandises non encore vendues ne comptent pas ici : ils restent en stock tant qu'ils ne sont pas vendus.
          </p>
        </div>
      </div>

      {/* Bandeau résultat + marge */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-slate-400 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" />Ventes HT</span>
          <h3 className="text-lg font-bold font-mono text-emerald-500 mt-1">{format(f.caHT)}</h3>
        </div>
        <div className="bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-slate-400">Marge brute</span>
          <h3 className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">{format(f.margeBrute)}</h3>
        </div>
        <div className="bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-slate-400 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5 text-red-500" />{f.tvaNette >= 0 ? 'TVA à payer' : 'Crédit TVA'}</span>
          <h3 className="text-lg font-bold font-mono text-red-500 mt-1">{format(f.tvaNette)}</h3>
        </div>
        <div className="bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-slate-400">{f.resultatNet >= 0 ? 'Bénéfice' : 'Perte'}</span>
          <h3 className={`text-lg font-bold font-mono mt-1 ${f.resultatNet >= 0 ? 'text-cyan-500' : 'text-red-500'}`}>{format(f.resultatNet)}</h3>
        </div>
      </div>
    </div>
  );
}
