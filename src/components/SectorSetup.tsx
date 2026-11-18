/**
 * « Quel est votre commerce ? » — choix des secteurs d'activité (plusieurs possibles), puis
 * proposition de catégories toutes prêtes. Affiché au 1er démarrage (Super Admin / Admin)
 * et depuis Configuration ERP.
 */
import React, { useMemo, useState } from 'react';
import { Store, Check, ArrowLeft, X } from 'lucide-react';
import type { Category, Setting } from '../types';
import { SECTORS, categoriesFor, featuresFor, type SectorId } from '../services/sectors';
import { saveSectors } from '../services/settingsService';
import { showAlert } from '../services/dialog';
import { showToast } from '../services/toast';

const FEATURE_TEXT: Record<string, string> = {
  variants: 'Tailles et couleurs (variantes)',
  packs: 'Vente en gros (carton, caisse, sac…) et au détail',
  expiry: 'Dates de péremption et lots',
  serials: 'Numéros de série / IMEI et garantie',
};

export default function SectorSetup({
  initial, categories, firstRun, onClose, onSaved,
}: {
  initial?: string[] | null;
  categories: Category[];
  /** 1er démarrage : textes d'accueil, bouton « Plus tard » */
  firstRun?: boolean;
  onClose: () => void;
  onSaved: (s: Setting) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [chosen, setChosen] = useState<SectorId[]>((initial || []) as SectorId[]);
  const [busy, setBusy] = useState(false);

  const proposals = useMemo(() => categoriesFor(chosen), [chosen]);
  const key = (s: string) => s.toLowerCase();
  const topExisting = (name: string) => categories.find((c) => !c.parentId && key(c.name) === key(name));
  const childExists = (parent: string, child: string) => {
    const p = topExisting(parent);
    return !!p && categories.some((c) => c.parentId === p.id && key(c.name) === key(child));
  };
  // Cases cochées : « Parent » ou « Parent > Enfant ». Tout ce qui n'existe pas est coché par défaut.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const defaultPicked = useMemo(() => {
    const s = new Set<string>();
    for (const c of proposals) {
      if (!topExisting(c.name)) s.add(c.name);
      for (const ch of c.children || []) if (!childExists(c.name, ch)) s.add(`${c.name}>${ch}`);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals, categories]);
  const sel = picked ?? defaultPicked;
  const toggle = (k: string) => {
    const next = new Set(sel);
    if (next.has(k)) next.delete(k); else next.add(k);
    setPicked(next);
  };

  const toggleSector = (id: SectorId) => {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    setPicked(null);
  };
  const feats = featuresFor(chosen.length ? chosen : null);

  const finish = async (withCategories: boolean) => {
    const cats = withCategories
      ? proposals
          .map((c) => ({
            name: c.name,
            children: (c.children || []).filter((ch) => sel.has(`${c.name}>${ch}`)),
            parentPicked: sel.has(c.name),
          }))
          // une sous-catégorie cochée crée aussi son parent s'il manque
          .filter((c) => c.parentPicked || c.children.length > 0)
          .map(({ name, children }) => ({ name, children }))
      : [];
    setBusy(true);
    try {
      const r = await saveSectors(chosen, cats);
      showToast(
        r.createdCategories
          ? `Secteur enregistré — ${r.createdCategories} catégorie${r.createdCategories > 1 ? 's' : ''} créée${r.createdCategories > 1 ? 's' : ''}.`
          : 'Secteur d’activité enregistré.',
        { title: 'Configuration' },
      );
      onSaved(r.settings);
    } catch (err: any) {
      showAlert(err?.message || 'Enregistrement impossible.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const nothingToCreate = chosen.length > 0 && proposals.length === 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[90] flex items-center justify-center p-3 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="sector-title" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0"><Store className="w-5 h-5" /></span>
            <div>
              <h2 id="sector-title" className="text-base font-bold text-slate-900 dark:text-white">
                {step === 1 ? 'Quel est votre commerce ?' : 'Catégories proposées'}
              </h2>
              <p className="text-xs text-slate-500">
                {step === 1
                  ? (firstRun ? 'Bienvenue ! ' : '') + 'Cochez un ou plusieurs secteurs : l’application n’affichera que les fonctions utiles. Modifiable à tout moment dans Configuration ERP.'
                  : 'Décochez ce que vous ne voulez pas. Les catégories qui existent déjà ne sont pas recréées.'}
              </p>
            </div>
          </div>
          {!busy && (
            <button type="button" onClick={onClose} aria-label="Fermer" className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-5 h-5" /></button>
          )}
        </div>

        {step === 1 ? (
          <div className="p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SECTORS.map((s) => {
                const on = chosen.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSector(s.id)}
                    aria-pressed={on}
                    className={`text-left p-4 rounded-xl border-2 transition flex gap-3 ${
                      on ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <span className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {on && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900 dark:text-white">{s.label}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">{s.examples}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {chosen.length > 0 && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 p-3 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Fonctions activées :</span>{' '}
                <span className="text-slate-600 dark:text-slate-400">
                  {Object.entries(feats).filter(([, v]) => v).map(([k]) => FEATURE_TEXT[k]).join(' · ') || 'Gestion standard (articles, caisse, achats, comptabilité)'}
                </span>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              {firstRun && (
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">
                  Plus tard
                </button>
              )}
              <button
                type="button"
                disabled={chosen.length === 0 || busy}
                onClick={() => (nothingToCreate ? finish(false) : setStep(2))}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
              >
                {nothingToCreate ? (busy ? 'Enregistrement…' : 'Valider') : 'Continuer'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {proposals.map((c) => {
                const parentExists = !!topExisting(c.name);
                return (
                  <div key={c.name} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <input type="checkbox" disabled={parentExists} checked={parentExists || sel.has(c.name)} onChange={() => toggle(c.name)} className="w-4 h-4 accent-cyan-600" />
                      {c.name}
                      {parentExists && <span className="text-[10px] font-normal text-slate-400">existe déjà</span>}
                    </label>
                    {(c.children || []).map((ch) => {
                      const k = `${c.name}>${ch}`;
                      const exists = childExists(c.name, ch);
                      return (
                        <label key={k} className="flex items-center gap-2 pl-6 text-xs text-slate-600 dark:text-slate-300">
                          <input type="checkbox" disabled={exists} checked={exists || sel.has(k)} onChange={() => toggle(k)} className="w-3.5 h-3.5 accent-cyan-600" />
                          {ch}
                          {exists && <span className="text-[10px] text-slate-400">existe déjà</span>}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button type="button" onClick={() => setStep(1)} disabled={busy} className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Retour
              </button>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => finish(false)} disabled={busy} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Ne pas créer de catégories
                </button>
                <button type="button" onClick={() => finish(true)} disabled={busy} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-xs font-bold disabled:opacity-60">
                  {busy ? 'Enregistrement…' : `Créer ${[...sel].length} catégorie${[...sel].length > 1 ? 's' : ''} et terminer`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
