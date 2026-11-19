/**
 * « Votre société » — affiché juste après « Quel est votre commerce ? » au 1er démarrage :
 * raison sociale, logo, NIF, STAT, adresse, téléphone, email. Ces informations figurent sur
 * les reçus et factures ; elles restent modifiables dans Configuration ERP.
 */
import React, { useState } from 'react';
import { Building, X } from 'lucide-react';
import type { Setting } from '../types';
import LogoPicker from './LogoPicker';
import { saveCompany } from '../services/settingsService';
import { setExportCompany } from '../services/exportContext';
import { showAlert } from '../services/dialog';
import { showToast } from '../services/toast';

const DEFAULT_NAME = 'Vokatra-ko';

const inputCls =
  'w-full bg-white dark:bg-slate-950/20 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

export default function CompanySetup({
  settings, onClose, onSaved,
}: {
  settings: Setting | null;
  onClose: () => void;
  onSaved: (s: Setting) => void;
}) {
  // Nom proposé par défaut : « Vokatra-ko », à remplacer par celui de la société.
  const [companyName, setCompanyName] = useState(settings?.companyName?.trim() || DEFAULT_NAME);
  const [logo, setLogo] = useState<string | null>(settings?.logo || null);
  const [taxId, setTaxId] = useState(settings?.taxId || '');
  const [statNumber, setStatNumber] = useState(settings?.statNumber || '');
  const [address, setAddress] = useState(settings?.address || '');
  const [phone, setPhone] = useState(settings?.phone || '');
  const [email, setEmail] = useState(settings?.email || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setBusy(true);
    try {
      const s = await saveCompany({ companyName, logo, taxId, statNumber, address, phone, email });
      setExportCompany(s.companyName);
      showToast('Informations de la société enregistrées.', { title: 'Configuration' });
      onSaved(s);
    } catch (err: any) {
      showAlert(err?.message || 'Enregistrement impossible.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const initials = (settings?.logoInitials || companyName.trim().slice(0, 1) || 'S').toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[90] flex items-center justify-center p-3 sm:p-4">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-title"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0"><Building className="w-5 h-5" /></span>
            <div>
              <h2 id="company-title" className="text-base font-bold text-slate-900 dark:text-white">Votre société</h2>
              <p className="text-xs text-slate-500">
                Ces informations apparaissent sur vos reçus et factures. Modifiables à tout moment dans Configuration ERP.
              </p>
            </div>
          </div>
          {!busy && (
            <button type="button" onClick={onClose} aria-label="Fermer" className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-5 h-5" /></button>
          )}
        </div>

        <div className="p-5 sm:p-6 space-y-4 text-xs">
          <div>
            <label className="text-slate-500 font-semibold block mb-1.5">Logo</label>
            <LogoPicker value={logo} onChange={setLogo} fallback={initials} />
          </div>

          <div>
            <label htmlFor="co-name" className="text-slate-500 font-semibold block mb-1">Nom de la société (raison sociale) *</label>
            <input id="co-name" required autoFocus maxLength={120} value={companyName} onChange={(e) => setCompanyName(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Ex. : Épicerie Rasoa SARL" className={inputCls} />
            <p className="text-[10px] text-slate-500 mt-1">« {DEFAULT_NAME} » par défaut : tapez simplement le nom de votre société pour le remplacer.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="co-nif" className="text-slate-500 font-semibold block mb-1">NIF</label>
              <input id="co-nif" maxLength={40} value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Numéro d’identification fiscale" className={inputCls} />
            </div>
            <div>
              <label htmlFor="co-stat" className="text-slate-500 font-semibold block mb-1">STAT</label>
              <input id="co-stat" maxLength={40} value={statNumber} onChange={(e) => setStatNumber(e.target.value)} placeholder="Numéro statistique" className={inputCls} />
            </div>
          </div>

          <div>
            <label htmlFor="co-address" className="text-slate-500 font-semibold block mb-1">Adresse</label>
            <input id="co-address" maxLength={250} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Lot, rue, quartier, ville" className={inputCls} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="co-phone" className="text-slate-500 font-semibold block mb-1">Téléphone</label>
              <input id="co-phone" type="tel" maxLength={60} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+261 34 00 000 00" className={inputCls} />
            </div>
            <div>
              <label htmlFor="co-email" className="text-slate-500 font-semibold block mb-1">Adresse email</label>
              <input id="co-email" type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@masociete.mg" className={inputCls} />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">
              Plus tard
            </button>
            <button type="submit" disabled={busy || !companyName.trim()} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-xs font-bold disabled:opacity-50">
              {busy ? 'Enregistrement…' : 'Enregistrer et commencer'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
