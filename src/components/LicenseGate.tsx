/**
 * Licence de la version .exe : écran d'activation (essai terminé ou date du PC incorrecte)
 * et bandeau « Version d'essai : N jours restants ». Sans effet hors .exe (required = false).
 * Tous les postes du réseau passent par le serveur du PC principal : c'est sa licence qui compte.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KeyRound, Copy, Check, Loader2, ShieldCheck } from 'lucide-react';

interface Status {
  required: boolean;
  state: 'licensed' | 'trial' | 'expired' | 'clock';
  machineCode: string;
  licensee?: string;
  trialDays: number;
  trialDaysLeft?: number;
}

/** Signal envoyé par apiFetch quand le serveur répond 402 (essai terminé en cours d'usage). */
export const LICENSE_EVENT = 'vokatra:license-required';

async function fetchStatus(): Promise<Status | null> {
  try {
    const r = await fetch('/api/license/status', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showActivate, setShowActivate] = useState(false);

  const refresh = useCallback(async () => {
    const s = await fetchStatus();
    setStatus(s);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
    const onBlocked = () => refresh();
    window.addEventListener(LICENSE_EVENT, onBlocked);
    const t = setInterval(refresh, 30 * 60 * 1000); // revérifie toutes les 30 min (fin d'essai)
    return () => { window.removeEventListener(LICENSE_EVENT, onBlocked); clearInterval(t); };
  }, [refresh]);

  // Hauteur du bandeau d'essai réservée à l'application (variable CSS lue par App.tsx),
  // pour que le bandeau reste visible en haut sans couper le bas de l'écran.
  const bannerRef = useRef<HTMLDivElement>(null);
  const inTrial = status?.required && status.state === 'trial';
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = bannerRef.current;
    if (!inTrial || !el) { root.style.setProperty('--license-banner-h', '0px'); return; }
    const apply = () => root.style.setProperty('--license-banner-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.setProperty('--license-banner-h', '0px'); };
  }, [inTrial, status?.trialDaysLeft]);

  if (!loaded) return null;
  // Version web / dev, ou serveur injoignable : l'application gère elle-même ses erreurs.
  if (!status || !status.required) return <>{children}</>;

  const blocked = status.state === 'expired' || status.state === 'clock';
  if (blocked) return <ActivationScreen status={status} onActivated={setStatus} />;

  const left = status.trialDaysLeft ?? 0;
  const urgent = left <= 2;

  return (
    <>
      {status.state === 'trial' && (
        <div
          ref={bannerRef}
          role="status"
          data-testid="trial-banner"
          className={`sticky top-0 z-[60] text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-3 flex-wrap shadow ${urgent ? 'bg-red-600 text-white' : 'bg-amber-500 text-slate-950'}`}
        >
          <span>
            {left <= 1
              ? "Version d'essai : dernier jour !"
              : `Version d'essai : ${left} jours restants sur ${status.trialDays}.`}
            {' '}
            <span className="font-normal">
              {urgent ? "Sans licence, l'application sera bloquée à la fin de l'essai (vos données sont conservées)." : 'Toutes les fonctions sont disponibles pendant l’essai.'}
            </span>
          </span>
          <button type="button" onClick={() => setShowActivate(true)} className={`px-2.5 py-0.5 rounded-md ${urgent ? 'bg-white text-red-700 hover:bg-red-50' : 'bg-slate-950 text-white hover:bg-slate-800'}`}>
            Activer une licence
          </button>
        </div>
      )}
      {children}
      {showActivate && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowActivate(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
            <ActivationCard status={status} onActivated={(s) => { setStatus(s); setShowActivate(false); }} onCancel={() => setShowActivate(false)} />
          </div>
        </div>
      )}
    </>
  );
}

function ActivationScreen({ status, onActivated }: { status: Status; onActivated: (s: Status) => void }) {
  return (
    <div className="min-h-dvh bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <ActivationCard status={status} onActivated={onActivated} />
      </div>
    </div>
  );
}

function ActivationCard({ status, onActivated, onCancel }: { status: Status; onActivated: (s: Status) => void; onCancel?: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<Status | null>(null);

  const copy = async () => {
    try { await navigator.clipboard.writeText(status.machineCode); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sélection manuelle */ }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/license/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Erreur ${r.status}`);
      setDone(data);
    } catch (err: any) {
      setError(err?.message || 'Activation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const title = status.state === 'clock'
    ? 'Date de l’ordinateur incorrecte'
    : status.state === 'expired' ? 'Période d’essai terminée' : 'Activer Vokatra-ko';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-slate-900 dark:text-white">
      {done ? (
        <div className="text-center space-y-3 py-4">
          <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto" />
          <h1 className="text-lg font-bold">Licence activée</h1>
          <p className="text-sm text-slate-500">Licence à vie au nom de <strong className="text-slate-800 dark:text-slate-200">{done.licensee}</strong>. Merci !</p>
          <button type="button" onClick={() => { onActivated(done); window.location.reload(); }} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-bold">
            Continuer
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0"><KeyRound className="w-5 h-5" /></span>
            <div>
              <h1 className="text-base font-bold">{title}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {status.state === 'clock'
                  ? 'La date de cet ordinateur est antérieure à sa dernière utilisation. Corrigez la date et l’heure de Windows, puis relancez l’application — ou activez une licence.'
                  : status.state === 'expired'
                  ? `Les ${status.trialDays} jours d’essai sont écoulés. Vos données sont conservées : activez une licence pour continuer.`
                  : 'Entrez la clé de licence reçue pour cet ordinateur.'}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <p className="text-xs text-slate-500">1. Envoyez ce <strong>code machine</strong> à votre vendeur :</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-center text-lg font-bold tracking-widest font-mono text-cyan-600 dark:text-cyan-400 select-all">{status.machineCode}</code>
              <button type="button" onClick={copy} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:border-cyan-500">
                {copied ? <><Check className="w-3.5 h-3.5 text-emerald-500" /> Copié</> : <><Copy className="w-3.5 h-3.5" /> Copier</>}
              </button>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-2">
            <label htmlFor="lic-key" className="text-xs text-slate-500 block">2. Collez la <strong>clé de licence</strong> reçue :</label>
            <textarea
              id="lic-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              rows={3}
              placeholder="VK1.…"
              spellCheck={false}
              className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-cyan-500 break-all"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              {onCancel && (
                <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">Plus tard</button>
              )}
              <button type="submit" disabled={busy || !key.trim()} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Activer
              </button>
            </div>
          </form>
          <p className="text-[10px] text-slate-400 text-center">Une licence est valable à vie, sur un seul ordinateur (le PC principal). Les autres postes du réseau en profitent.</p>
        </>
      )}
    </div>
  );
}
