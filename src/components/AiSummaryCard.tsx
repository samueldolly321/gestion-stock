import React, { useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { generateSummary } from '../services/aiService';
import { showAlert } from '../services/dialog';

/**
 * Carte « Résumé IA » : génère à la demande un résumé d'activité en langage naturel
 * (jour ou mois) via l'API Claude. Affichée en haut du Tableau de bord.
 */
export default function AiSummaryCard() {
  const [period, setPeriod] = useState<'day' | 'month'>('day');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [label, setLabel] = useState<string>('');

  const run = async (p: 'day' | 'month') => {
    setPeriod(p);
    setLoading(true);
    try {
      const res = await generateSummary(p);
      setSummary(res.summary);
      setLabel(res.label);
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la génération du résumé.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-cyan-500/5 to-indigo-500/5 dark:from-cyan-500/10 dark:to-indigo-500/10 border border-cyan-500/20 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-cyan-500" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Résumé d'activité (IA)</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Généré par l'IA à partir de tes chiffres{label ? ` — ${label}` : ''}.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1 bg-white dark:bg-slate-950/30 rounded-lg p-0.5 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setPeriod('day')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${period === 'day' ? 'bg-cyan-500/15 text-cyan-500' : 'text-slate-500'}`}
            >
              Jour
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${period === 'month' ? 'bg-cyan-500/15 text-cyan-500' : 'text-slate-500'}`}
            >
              Mois
            </button>
          </div>
          <button
            onClick={() => run(period)}
            disabled={loading}
            className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : summary ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            {loading ? 'Génération...' : summary ? 'Régénérer' : 'Générer'}
          </button>
        </div>
      </div>

      {summary && !loading && (
        <div className="mt-4 pt-4 border-t border-cyan-500/15 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
          {summary}
        </div>
      )}
      {!summary && !loading && (
        <p className="mt-4 pt-4 border-t border-cyan-500/15 text-[11px] text-slate-400 italic">
          Clique sur « Générer » pour obtenir un résumé de l'activité du {period === 'day' ? 'jour' : 'mois'}.
        </p>
      )}
    </div>
  );
}
