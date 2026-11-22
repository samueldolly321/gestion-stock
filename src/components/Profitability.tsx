/**
 * Comptabilité → Rentabilité : en combien de temps le fonds de départ sera-t-il récupéré ?
 * Cumul des résultats mensuels (même calcul que les États) depuis la date d'ouverture,
 * comparé au fonds de départ saisi ; estimation au rythme des derniers mois complets.
 */
import React, { useMemo, useState } from 'react';
import { PiggyBank, Pencil, Plus, Trash2, Info, Download, TrendingUp, CalendarClock, Wallet, Target } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import type { Setting } from '../types';
import { useMoney } from '../services/CurrencyContext';
import { payback, investmentTotal, formatDuration, type AccountingData, type Investment } from '../services/profitability';
import { saveInvestment } from '../services/settingsService';
import { exportExcel } from '../services/exportExcel';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import { parseDecimal } from '../services/pack';

const LINE = '#0891b2'; // cyan validé (clair et sombre)
const field = 'w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';
const PRESETS = ['Équipement et matériel', 'Travaux et aménagement', 'Stock de départ', "Frais d'ouverture (enseigne, licences…)"];
const today = () => new Date().toISOString().slice(0, 10);
const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString('fr-FR')} k`;
  return String(Math.round(n));
};

export default function Profitability({ data, settings, canEdit, onSaved }: {
  data: AccountingData;
  settings: Setting | null;
  canEdit: boolean;
  onSaved: (s: Setting) => void;
}) {
  const { format } = useMoney();
  const inv = (settings?.investment || null) as Investment | null;
  const p = useMemo(() => payback(data, inv), [data, inv]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openingDate, setOpeningDate] = useState('');
  const [lines, setLines] = useState<{ label: string; amount: string }[]>([]);

  const startEdit = () => {
    setOpeningDate(inv?.openingDate || today());
    setLines(inv?.items?.length
      ? inv.items.map((i) => ({ label: i.label, amount: String(i.amount) }))
      : PRESETS.map((label) => ({ label, amount: '' })));
    setEditing(true);
  };
  const formTotal = lines.reduce((a, l) => a + (parseDecimal(l.amount) || 0), 0);

  const save = async () => {
    if (!openingDate) return showAlert("Indiquez la date d'ouverture de votre commerce.", { variant: 'warning' });
    const items = lines.map((l) => ({ label: l.label.trim() || 'Autre', amount: parseDecimal(l.amount) || 0 })).filter((l) => l.amount > 0);
    if (!items.length) return showAlert('Indiquez au moins un montant investi.', { variant: 'warning' });
    setBusy(true);
    try {
      onSaved(await saveInvestment({ openingDate, items }));
      setEditing(false);
      showToast(`Fonds de départ enregistré : ${format(items.reduce((a, i) => a + i.amount, 0))}.`, { title: 'Rentabilité' });
    } catch (err: any) {
      showAlert(err?.message || "Erreur d'enregistrement.", { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (!(await showConfirm('Effacer le fonds de départ ? Vos ventes et dépenses ne sont pas touchées.', { title: 'Effacer le fonds de départ', confirmText: 'Effacer' }))) return;
    try { onSaved(await saveInvestment(null)); setEditing(false); } catch (err: any) { showAlert(err?.message || 'Erreur.', { variant: 'error' }); }
  };

  const exportMonths = () => {
    if (!p) return;
    exportExcel<{ mois: string; ventes: number; depenses: number; resultat: number; cumul: number; pct: string }>(
      'rentabilite_fonds_de_depart', 'Rentabilité',
      [
        { label: 'Mois', value: (r) => r.mois },
        { label: 'Ventes HT', value: (r) => r.ventes },
        { label: 'Dépenses', value: (r) => r.depenses },
        { label: 'Résultat du mois', value: (r) => r.resultat },
        { label: 'Cumul depuis l’ouverture', value: (r) => r.cumul },
        { label: '% du fonds récupéré', value: (r) => r.pct },
      ],
      p.months.map((m) => ({ mois: m.label + (m.partial ? ' (partiel)' : ''), ventes: Math.round(m.caHT), depenses: Math.round(m.charges), resultat: Math.round(m.result), cumul: Math.round(m.cumulative), pct: p.total > 0 ? `${Math.round((m.cumulative / p.total) * 100)} %` : '—' })),
    );
    showToast('Tableau de rentabilité exporté (Excel).', { title: 'Rentabilité' });
  };

  // ------------------------------------------------------------------ Formulaire
  if (editing || !inv) {
    if (!editing) {
      return (
        <div className="bg-white dark:bg-slate-900/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm text-center space-y-3" data-testid="profit-empty">
          <PiggyBank className="w-10 h-10 text-cyan-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">En combien de temps votre fonds de départ sera-t-il récupéré ?</h3>
          <p className="text-xs text-slate-500 max-w-xl mx-auto">
            Indiquez ce que vous avez investi pour ouvrir votre commerce (matériel, travaux, premier stock…) et la date d'ouverture.
            Vokatra-ko additionne ensuite vos bénéfices de chaque mois et estime la date à laquelle votre mise de départ sera remboursée.
          </p>
          {canEdit
            ? <button onClick={startEdit} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-lg">Saisir mon fonds de départ</button>
            : <p className="text-[11px] text-slate-400">Seul un administrateur ou un manager peut saisir le fonds de départ.</p>}
        </div>
      );
    }
    return (
      <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-4 text-xs" data-testid="profit-form">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><PiggyBank className="w-4 h-4 text-cyan-500" />Votre fonds de départ</h3>
        <div className="max-w-xs">
          <label className="text-slate-400 block mb-1">Date d'ouverture du commerce *</label>
          <input type="date" value={openingDate} max={today()} onChange={(e) => setOpeningDate(e.target.value)} className={field} aria-label="Date d'ouverture" />
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_180px_auto] gap-2 text-[10px] uppercase text-slate-400"><span>Ce que vous avez investi</span><span>Montant (Ar)</span><span /></div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_180px_auto] gap-2 items-center">
              <input value={l.label} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={field} aria-label="Poste investi" />
              <input inputMode="decimal" value={l.amount} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className={`${field} text-right font-mono`} placeholder="0" aria-label={`Montant : ${l.label}`} />
              <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="p-1.5 text-slate-400 hover:text-red-500" aria-label="Retirer la ligne"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setLines((ls) => [...ls, { label: '', amount: '' }])} className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Ajouter une ligne</button>
        </div>
        <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-3">
          <span className="font-bold text-slate-900 dark:text-white">Total du fonds de départ : <span className="font-mono text-cyan-600 dark:text-cyan-400" data-testid="profit-form-total">{format(formTotal)}</span></span>
          <div className="flex gap-2">
            {inv && <button type="button" onClick={clear} className="px-3 py-2 rounded-lg text-red-500 hover:bg-red-500/10">Effacer</button>}
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">Annuler</button>
            <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-50">{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
        <p className="text-[10px] text-slate-400">Le stock de départ compte ici une seule fois : quand il sera vendu, son coût sera déduit de vos ventes dans le calcul du bénéfice (pas en double).</p>
      </div>
    );
  }

  if (!p) return null;
  // ------------------------------------------------------------------ Tableau de bord
  const done = p.remaining <= 0;
  const provisional = p.daysOpen < 60;
  const chartData = [
    { label: 'Ouverture', cumul: 0, result: 0 },
    ...p.months.map((m) => ({ label: m.label + (m.partial ? ' *' : ''), cumul: Math.round(m.cumulative), result: Math.round(m.result) })),
  ];
  const Tile = ({ icon, label, value, sub, tone = 'plain' }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'plain' | 'good' | 'bad' }) => (
    <div className="bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
      <span className="text-[10px] uppercase font-mono text-slate-400 flex items-center gap-1">{icon}{label}</span>
      <h3 className={`text-lg font-bold font-mono mt-1 ${tone === 'bad' ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>{value}</h3>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="profit-view">
      {/* Chiffre principal + progression */}
      <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-3">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <p className="text-[11px] uppercase font-mono text-slate-400">Fonds de départ récupéré</p>
            <p className="text-4xl font-bold font-mono text-slate-900 dark:text-white" data-testid="profit-pct">{Math.floor(p.pct)} %</p>
          </div>
          {canEdit && <button onClick={startEdit} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Modifier le fonds de départ</button>}
        </div>
        <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(p.pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Part du fonds de départ récupérée">
          <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: LINE }} />
        </div>
        <div className="flex justify-between text-[11px] text-slate-500">
          <span>Récupéré : <b className="font-mono text-slate-800 dark:text-slate-100">{format(Math.max(0, p.recovered))}</b></span>
          <span>Fonds de départ : <b className="font-mono text-slate-800 dark:text-slate-100">{format(p.total)}</b></span>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed" data-testid="profit-message">
          {done
            ? <>Votre fonds de départ est <b>entièrement récupéré</b>{p.paidBackOn ? <> depuis <b>{p.paidBackOn}</b></> : null}. Tout bénéfice est désormais du gain net.</>
            : p.monthlyRate > 0 && p.monthsLeft != null
              ? <>Au rythme actuel (<b>{format(p.monthlyRate)}</b> de bénéfice par mois, {p.rateBasis}), il sera récupéré dans environ <b>{formatDuration(p.monthsLeft)}</b>, vers <b>{p.estimatedDate!.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b>.</>
              : <>Au rythme actuel, votre activité <b>ne dégage pas de bénéfice</b> ({format(p.monthlyRate)} par mois, {p.rateBasis}) : le fonds de départ ne se rembourse pas. Vérifiez vos prix de vente, vos coûts et vos dépenses.</>}
        </p>
        {provisional && !done && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" />Estimation provisoire : seulement {p.daysOpen} jour{p.daysOpen > 1 ? 's' : ''} d'activité. Elle devient fiable après 3 à 6 mois.</p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={<Wallet className="w-3.5 h-3.5 text-cyan-500" />} label="Fonds de départ" value={format(p.total)} sub={`ouverture le ${new Date(`${inv.openingDate}T00:00:00`).toLocaleDateString('fr-FR')}`} />
        <Tile icon={<TrendingUp className="w-3.5 h-3.5 text-cyan-500" />} label="Déjà récupéré" value={format(p.recovered)} sub="bénéfices cumulés depuis l'ouverture" tone={p.recovered < 0 ? 'bad' : 'plain'} />
        <Tile icon={<Target className="w-3.5 h-3.5 text-cyan-500" />} label="Reste à récupérer" value={format(p.remaining)} />
        <Tile icon={<CalendarClock className="w-3.5 h-3.5 text-cyan-500" />} label="Bénéfice moyen / mois" value={format(p.monthlyRate)} sub={p.rateBasis} tone={p.monthlyRate < 0 ? 'bad' : 'plain'} />
      </div>

      {/* Graphique : cumul des bénéfices vs fonds de départ (un seul axe) */}
      <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Bénéfices cumulés depuis l'ouverture</h4>
        <p className="text-[11px] text-slate-400 mb-3">Quand la courbe atteint la ligne en pointillés, le fonds de départ est récupéré. * = mois en cours ou incomplet.</p>
        <div className="h-64 w-full" data-testid="profit-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 18, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#94a3b8" strokeOpacity={0.15} vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} tickFormatter={compact} domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(max, p.total) * 1.08]} />
              <Tooltip
                cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                formatter={(v: any, name: any) => [format(Number(v)), name === 'cumul' ? 'Cumul des bénéfices' : String(name)]}
                labelFormatter={(l: any) => {
                  const row = chartData.find((r) => r.label === l);
                  return row && l !== 'Ouverture' ? `${l} — bénéfice du mois : ${format(row.result)}` : String(l);
                }}
              />
              <ReferenceLine y={p.total} stroke="#94a3b8" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: `Fonds de départ : ${compact(p.total)} Ar`, position: 'insideTopRight', fill: '#94a3b8', fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeOpacity={0.4} />
              <Line type="monotone" dataKey="cumul" stroke={LINE} strokeWidth={2} dot={{ r: 4, fill: LINE, stroke: LINE }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tableau mois par mois */}
      <div className="bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm overflow-hidden">
        <div className="p-4 flex justify-between items-center">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Mois par mois</h4>
          <button onClick={exportMonths} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5"><Download className="w-4 h-4 text-green-700" /> Excel</button>
        </div>
        <table className="w-full text-xs" data-testid="profit-table">
          <thead className="bg-slate-50 dark:bg-slate-950/40 text-slate-400 uppercase text-[10px]">
            <tr><th className="text-left p-3">Mois</th><th className="text-right p-3">Ventes HT</th><th className="text-right p-3">Dépenses</th><th className="text-right p-3">Bénéfice du mois</th><th className="text-right p-3">Cumul</th><th className="text-right p-3">% récupéré</th></tr>
          </thead>
          <tbody>
            {p.months.map((m) => (
              <tr key={m.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-3 text-slate-800 dark:text-slate-100">{m.label}{m.partial && <span className="text-[10px] text-slate-400"> (partiel)</span>}</td>
                <td className="p-3 text-right font-mono">{format(m.caHT)}</td>
                <td className="p-3 text-right font-mono">{format(m.charges)}</td>
                <td className={`p-3 text-right font-mono ${m.result < 0 ? 'text-red-500' : 'text-slate-800 dark:text-slate-100'}`}>{format(m.result)}</td>
                <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">{format(m.cumulative)}</td>
                <td className="p-3 text-right font-mono">{p.total > 0 ? `${Math.max(0, Math.floor((m.cumulative / p.total) * 100))} %` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm text-xs">
          <h4 className="font-bold text-slate-900 dark:text-white mb-2">Détail du fonds de départ</h4>
          {inv.items.map((i, k) => (
            <div key={k} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0"><span className="text-slate-500">{i.label}</span><span className="font-mono text-slate-800 dark:text-slate-100">{format(i.amount)}</span></div>
          ))}
          <div className="flex justify-between pt-2 font-bold text-slate-900 dark:text-white"><span>Total</span><span className="font-mono">{format(investmentTotal(inv))}</span></div>
        </div>
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4 text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5">
          <p className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 text-cyan-500" />Pour un chiffre juste</p>
          <p>• Enregistrez <b>toutes vos dépenses</b> (loyer, salaires, électricité, gaz…) dans <b>Dépenses</b> : une dépense oubliée fait croire à un remboursement plus rapide.</p>
          <p>• Passez vos marchandises par <b>Achats</b> avec le bon prix d'achat : c'est lui qui calcule le coût de ce que vous vendez.</p>
          <p>• Si vous vous versez un salaire, enregistrez-le en dépense <b>Salaires</b>.</p>
          <p>• Le bénéfice est calculé comme dans <b>États</b> : ventes HT − coût des produits vendus − dépenses.</p>
        </div>
      </div>
    </div>
  );
}
