import React, { useMemo, useState } from 'react';
import { Landmark, Receipt, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Download, Scale, Info } from 'lucide-react';
import { Sale, Purchase, Expense, Product, StockMovement, Setting } from '../types';
import { useMoney } from '../services/CurrencyContext';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import { showToast } from '../services/toast';
import { periodRange, shiftAnchor, type Gran } from '../services/period';
import { periodFigures } from '../services/profitability';
import Profitability from './Profitability';

interface AccountingProps {
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  products: Product[];
  movements: StockMovement[];
  /** Réglages (fonds de départ de l'écran Rentabilité) */
  settings?: Setting | null;
  /** Peut saisir / modifier le fonds de départ */
  canEditInvestment?: boolean;
  onSettingsSaved?: (s: Setting) => void;
}

export default function Accounting({ sales, purchases, expenses, products, movements, settings = null, canEditInvestment = false, onSettingsSaved }: AccountingProps) {
  const { format } = useMoney();
  const [view, setView] = useState<'etats' | 'rentabilite'>('etats');
  const [gran, setGran] = useState<Gran>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const range = useMemo(() => periodRange(gran, anchor), [gran, anchor]);

  const shift = (dir: number) => setAnchor((a) => shiftAnchor(gran, a, dir));

  // Calcul UNIQUE du résultat (partagé avec l'écran Rentabilité) : voir services/profitability.ts.
  const data = useMemo(() => ({ sales, purchases, expenses, movements }), [sales, purchases, expenses, movements]);
  const f = useMemo(() => periodFigures(data, range.start, range.end), [data, range]);

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

  const tabs = (
    <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 w-fit" role="tablist" aria-label="Comptabilité">
      {([['etats', 'États (TVA et résultat)'], ['rentabilite', 'Rentabilité (fonds de départ)']] as const).map(([k, label]) => (
        <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${view === k ? 'bg-cyan-500 text-white' : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
          {label}
        </button>
      ))}
    </div>
  );

  if (view === 'rentabilite') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-cyan-500" />
            Comptabilité — Rentabilité
          </h2>
          <p className="text-xs text-slate-400">En combien de temps votre fonds de départ sera-t-il récupéré ?</p>
        </div>
        {tabs}
        <Profitability data={data} settings={settings} canEdit={canEditInvestment} onSaved={(s) => onSettingsSaved?.(s)} />
      </div>
    );
  }

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

      {tabs}

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
