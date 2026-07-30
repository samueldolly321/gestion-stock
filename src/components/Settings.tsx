import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  Building,
  DollarSign,
  Languages,
  ShieldCheck,
  Percent,
  Bell,
  Trash2,
  RefreshCw,
  Eye,
  Lock,
  Info,
  AlertTriangle
} from 'lucide-react';
import { Setting, User } from '../types';
import { useMoney } from '../services/CurrencyContext';
import { saveSettings } from '../services/settingsService';
import { resetFigures } from '../services/adminService';
import { showAlert } from '../services/dialog';
import { showToast } from '../services/toast';
import { setExportCompany } from '../services/exportContext';
import { ROLES, ALL_TABS, TAB_LABELS, DEFAULT_ROLE_TABS, WRITE_SCOPES, WRITE_LABELS, DEFAULT_WRITE_PERMS } from '../services/permissions';

interface SettingsProps {
  settings: Setting | null;
  user: User;
  onRefresh: () => void;
  currencySymbol: string;
  setCurrencySymbol: (s: string) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}

export default function Settings({
  settings,
  user,
  onRefresh,
  currencySymbol,
  setCurrencySymbol,
  theme,
  setTheme
}: SettingsProps) {
  
  // Local inputs
  const [companyName, setCompanyName] = useState(settings?.companyName || 'Vokatra-ko');
  const [brandName, setBrandName] = useState(settings?.brandName || '');
  const [logoInitials, setLogoInitials] = useState(settings?.logoInitials || '');
  const [taxId, setTaxId] = useState(settings?.taxId || 'FR-993821034');
  const [address, setAddress] = useState(settings?.address || '42 Avenue de la République, 75011 Paris');
  const [phone, setPhone] = useState(settings?.phone || '+33 1 42 34 56 78');
  const [email, setEmail] = useState(settings?.email || 'contact@vokatra.mg');
  const [defaultVatRate, setDefaultVatRate] = useState(settings?.defaultVatRate || 20);
  const [alertExpirationDays, setAlertExpirationDays] = useState(settings?.alertExpirationDays || 30);
  const [invoicePrefix, setInvoicePrefix] = useState(settings?.invoicePrefix || 'FAC');
  const [creditNotePrefix, setCreditNotePrefix] = useState(settings?.creditNotePrefix || 'AV');
  const [invoicePadding, setInvoicePadding] = useState(settings?.invoicePadding || 6);
  const [aboutText, setAboutText] = useState(settings?.aboutText || '');
  const [privacyText, setPrivacyText] = useState(settings?.privacyText || '');
  // Matrice RBAC : rôle -> onglets autorisés (repli sur les défauts).
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(
    settings?.rolePermissions || DEFAULT_ROLE_TABS,
  );
  const [writePermissions, setWritePermissions] = useState<Record<string, string[]>>(
    settings?.writePermissions || DEFAULT_WRITE_PERMS,
  );

  const [saveLoading, setSaveLoading] = useState(false);

  // Remise à zéro des chiffres (Super Admin uniquement).
  const isSuperAdmin = user.role === 'Super Admin';
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const RESET_PHRASE = 'REINITIALISER';

  const handleResetFigures = async () => {
    if (resetConfirm.trim().toUpperCase() !== RESET_PHRASE) return;
    setResetBusy(true);
    try {
      await resetFigures(resetConfirm.trim().toUpperCase());
      showToast('Chiffres remis à zéro. Rechargement…', { title: 'Configuration' });
      // Rechargement complet pour refléter les données remises à zéro partout.
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la remise à zéro.', { variant: 'error' });
      setResetBusy(false);
    }
  };

  const canManage = ['Super Admin', 'Admin', 'Manager'].includes(user.role);

  const togglePerm = (role: string, tab: string) => {
    setRolePermissions((prev) => {
      const cur = prev[role] || DEFAULT_ROLE_TABS[role] || [];
      const next = cur.includes(tab) ? cur.filter((t) => t !== tab) : [...cur, tab];
      return { ...prev, [role]: next };
    });
  };

  const toggleWrite = (role: string, scope: string) => {
    setWritePermissions((prev) => {
      const cur = prev[role] || DEFAULT_WRITE_PERMS[role] || [];
      const next = cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope];
      return { ...prev, [role]: next };
    });
  };

  // Devise (Ariary base / Euro) + taux de conversion
  const { displayCurrency, setDisplayCurrency, eurRate, setEurRate } = useMoney();

  // Synchronise le formulaire quand les réglages arrivent/évoluent depuis l'API.
  useEffect(() => {
    if (!settings) return;
    setCompanyName(settings.companyName || '');
    setBrandName(settings.brandName || '');
    setLogoInitials(settings.logoInitials || '');
    setTaxId(settings.taxId || '');
    setAddress(settings.address || '');
    setPhone(settings.phone || '');
    setEmail(settings.email || '');
    setDefaultVatRate(settings.defaultVatRate ?? 20);
    setAlertExpirationDays(settings.alertExpirationDays ?? 30);
    setInvoicePrefix(settings.invoicePrefix || 'FAC');
    setCreditNotePrefix(settings.creditNotePrefix || 'AV');
    setInvoicePadding(settings.invoicePadding ?? 6);
    setAboutText(settings.aboutText || '');
    setPrivacyText(settings.privacyText || '');
    setRolePermissions(settings.rolePermissions || DEFAULT_ROLE_TABS);
    setWritePermissions(settings.writePermissions || DEFAULT_WRITE_PERMS);
  }, [settings]);

  // Toggle Dark Mode
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', nextTheme);
  };

  // Submit settings save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!['Super Admin', 'Admin', 'Manager'].includes(user.role)) {
      showAlert('Seul un administrateur ou un gérant peut modifier les réglages globaux de l\'ERP.', { variant: 'warning' });
      return;
    }

    setSaveLoading(true);
    try {
      // Informations d'entreprise persistées en base ; devise/taux/thème restent en localStorage.
      await saveSettings({
        companyName,
        brandName: brandName || null,
        logoInitials: logoInitials || null,
        taxId,
        address,
        phone,
        email,
        defaultVatRate: Number(defaultVatRate),
        alertExpirationDays: Number(alertExpirationDays),
        invoicePrefix,
        creditNotePrefix,
        invoicePadding: Number(invoicePadding),
        aboutText: aboutText || null,
        privacyText: privacyText || null,
        currency: displayCurrency,
        currencySymbol: displayCurrency === 'EUR' ? '€' : 'Ar',
        defaultLanguage: 'fr',
        alertLowStock: true,
        rolePermissions,
        writePermissions,
      });
      onRefresh();
      setExportCompany(companyName); // maj immédiate de l'en-tête des exports PDF/Excel
      showToast('Réglages enregistrés avec succès !', { title: 'Réglages' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur d\'enregistrement des réglages.', { variant: 'error' });
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">

      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Paramètres Généraux de l'ERP</h2>
        <p className="text-xs text-slate-400">Configurez votre identité d'entreprise, vos devises et ajustez vos paramètres visuels.</p>
      </div>

      {/* Profil utilisateur + thème */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
        <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <img
            src={user.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=Admin'}
            alt={user.name}
            className="w-14 h-14 rounded-full border border-slate-700/50 bg-slate-800/10 shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900 dark:text-white truncate">{user.name}</h4>
            <span className="text-[10px] px-2 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-md font-mono inline-block mt-1">
              Rôle : {user.role}
            </span>
            <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">ID: {user.uid}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
          <h4 className="font-bold text-slate-950 dark:text-white mb-2">Thème d'affichage</h4>
          <button
            onClick={toggleTheme}
            className="w-full py-2.5 px-3 bg-slate-100 dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between font-semibold text-slate-700 dark:text-gray-300 transition duration-150 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {theme === 'dark' ? <Moon className="w-4 h-4 text-cyan-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
              Mode {theme === 'dark' ? 'Sombre' : 'Clair'}
            </span>
            <span className="text-[9px] font-mono uppercase text-slate-500">Changer</span>
          </button>
        </div>
      </div>

      {/* Entreprise (gauche) + Permissions (droite), côte à côte */}
      <form onSubmit={handleSaveSettings} className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 text-xs">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            
            <h3 className="font-bold text-slate-950 dark:text-white flex items-center gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
              <Building className="w-4 h-4 text-cyan-400" />
              Informations d'Entreprise Facturées
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 block mb-1">Raison Sociale *</label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Nom de marque (barre latérale)</label>
                <input
                  type="text"
                  maxLength={40}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Vokatra-ko"
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">Titre affiché en haut de la barre latérale (au-dessus de la raison sociale). Vide = « Vokatra-ko ».</p>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Initiales du logo (1-2 lettres)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={2}
                    value={logoInitials}
                    onChange={(e) => setLogoInitials(e.target.value.toUpperCase())}
                    placeholder={(companyName.trim()[0] || 'S').toUpperCase()}
                    className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none uppercase font-bold tracking-wider"
                  />
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-cyan-500 text-white font-extrabold text-sm flex items-center justify-center">
                    {(logoInitials || companyName.trim().slice(0, 1) || 'S').toUpperCase()}
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Vide = 1re lettre du nom. Affiché en haut à gauche.</p>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">NIF / Stat</label>
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="text-slate-400 block mb-1">Adresse Siège Social</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Téléphone Secrétariat</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Email Principal de Gestion</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <h3 className="font-bold text-slate-950 dark:text-white flex items-center gap-1.5 pt-4 pb-2 border-b border-slate-200 dark:border-slate-800">
              <DollarSign className="w-4 h-4 text-cyan-400" />
              Paramètres Financiers & Alerte
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 block mb-1">Devise d'affichage :</label>
                <select
                  value={displayCurrency}
                  onChange={(e) => setDisplayCurrency(e.target.value as 'MGA' | 'EUR')}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-200 focus:outline-none"
                >
                  <option value="MGA">Ariary (Ar) — devise de base</option>
                  <option value="EUR">Euro (€) — converti</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                  Les montants sont stockés en Ariary. En Euro, ils sont convertis selon le taux ci-contre.
                </p>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Taux de conversion (1 € = ? Ar) :</label>
                <input
                  type="number"
                  min={1}
                  value={eurRate}
                  onChange={(e) => setEurRate(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                  Exemple : 1 € = {eurRate.toLocaleString('fr-FR')} Ar.
                </p>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">TVA par défaut (%) :</label>
                <input
                  type="number"
                  value={defaultVatRate}
                  onChange={(e) => setDefaultVatRate(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Alerte d'expiration (jours) :</label>
                <input
                  type="number"
                  value={alertExpirationDays}
                  onChange={(e) => setAlertExpirationDays(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Préfixe de facture :</label>
                <input
                  type="text"
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase().slice(0, 8))}
                  placeholder="FAC"
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Préfixe d'avoir :</label>
                <input
                  type="text"
                  value={creditNotePrefix}
                  onChange={(e) => setCreditNotePrefix(e.target.value.toUpperCase().slice(0, 8))}
                  placeholder="AV"
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Chiffres du n° de facture :</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={invoicePadding}
                  onChange={(e) => setInvoicePadding(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Aperçu : {(invoicePrefix || 'FAC')}-{String(1).padStart(Math.min(10, Math.max(1, Number(invoicePadding) || 6)), '0')}</p>
              </div>
            </div>

            {/* Pages institutionnelles éditables (affichées sur le portail de connexion) */}
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-4 h-4 text-cyan-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Pages « À propos » &amp; « Confidentialité »</h4>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">
                Ces textes sont accessibles publiquement depuis le portail de connexion (liens en bas de page). Laissez vide pour masquer le lien.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 tracking-wider block mb-1">À propos</label>
                  <textarea
                    value={aboutText}
                    onChange={(e) => setAboutText(e.target.value)}
                    rows={5}
                    placeholder="Présentez votre entreprise, votre activité, votre mission…"
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 leading-relaxed"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 tracking-wider block mb-1">Confidentialité</label>
                  <textarea
                    value={privacyText}
                    onChange={(e) => setPrivacyText(e.target.value)}
                    rows={5}
                    placeholder="Décrivez votre politique de confidentialité et le traitement des données…"
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 leading-relaxed"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Colonne droite : permissions */}
          <div>
            {/* Matrice de permissions par rôle (accès aux onglets) */}
            {canManage ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="w-4 h-4 text-cyan-500" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Permissions par rôle</h4>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Cochez les onglets accessibles à chaque rôle. Le <strong>Super Admin</strong> conserve toujours l'accès complet.
                </p>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950/30 text-[9px] uppercase text-slate-400 tracking-wider">
                        <th className="p-2.5 text-left sticky left-0 bg-slate-50 dark:bg-slate-950/30">Rôle</th>
                        {ALL_TABS.map((t) => (
                          <th key={t} className="p-2.5 text-center whitespace-nowrap font-medium">{TAB_LABELS[t]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                      {ROLES.map((role) => {
                        const locked = role === 'Super Admin';
                        const perms = locked ? ALL_TABS : (rolePermissions[role] || DEFAULT_ROLE_TABS[role] || []);
                        return (
                          <tr key={role} className="hover:bg-slate-50 dark:hover:bg-slate-800/10">
                            <td className="p-2.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900">
                              {role}
                            </td>
                            {ALL_TABS.map((tab) => (
                              <td key={tab} className="p-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={perms.includes(tab)}
                                  disabled={locked}
                                  onChange={() => togglePerm(role, tab)}
                                  className="accent-cyan-500 w-4 h-4 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Droits d'écriture (créer / éditer / supprimer) par module */}
                <div className="flex items-center gap-2 mt-6 mb-1">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Droits d'écriture (créer / éditer / supprimer)</h4>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Cochez les modules où chaque rôle peut <strong>créer, modifier et supprimer</strong>. Décoché = consultation seule.
                </p>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950/30 text-[9px] uppercase text-slate-400 tracking-wider">
                        <th className="p-2.5 text-left sticky left-0 bg-slate-50 dark:bg-slate-950/30">Rôle</th>
                        {WRITE_SCOPES.map((s) => (
                          <th key={s} className="p-2.5 text-center whitespace-nowrap font-medium">{WRITE_LABELS[s]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                      {ROLES.map((role) => {
                        const locked = role === 'Super Admin';
                        const perms = locked ? WRITE_SCOPES : (writePermissions[role] || DEFAULT_WRITE_PERMS[role] || []);
                        return (
                          <tr key={role} className="hover:bg-slate-50 dark:hover:bg-slate-800/10">
                            <td className="p-2.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900">
                              {role}
                            </td>
                            {WRITE_SCOPES.map((scope) => (
                              <td key={scope} className="p-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={perms.includes(scope)}
                                  disabled={locked}
                                  onChange={() => toggleWrite(role, scope)}
                                  className="accent-amber-500 w-4 h-4 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-[10px] text-slate-400 mt-2">
                  Astuce : les changements s'appliquent après « Sauvegarder » — le menu et les boutons d'action s'adaptent immédiatement au rôle actif.
                </p>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <Lock className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                La gestion des permissions est réservée aux administrateurs.
              </div>
            )}
          </div>
        </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saveLoading}
                className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                {saveLoading ? 'Sauvegarde...' : 'Sauvegarder les Réglages'}
              </button>
            </div>

          </form>

          {/* Zone de danger — Super Admin uniquement */}
          {isSuperAdmin && (
            <div className="mt-8 border border-red-300 dark:border-red-900/60 rounded-2xl overflow-hidden">
              <div className="bg-red-50 dark:bg-red-950/20 px-5 py-3 border-b border-red-200 dark:border-red-900/60 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-bold text-red-700 dark:text-red-300">Zone de danger</h3>
              </div>
              <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-300 max-w-xl">
                  <p className="font-semibold text-slate-900 dark:text-white mb-1">Remettre les chiffres à zéro</p>
                  <p>
                    Pour démarrer « propre ». <strong>Conserve</strong> le catalogue produits, les clients
                    et les fournisseurs ; <strong>remet à zéro</strong> le stock, les soldes/fidélité clients,
                    et efface ventes, achats, règlements, dépenses, livraisons, inventaires, mouvements,
                    journal et compteurs de factures. <strong>Irréversible.</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setResetConfirm(''); setResetOpen(true); }}
                  className="shrink-0 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Remettre à zéro
                </button>
              </div>
            </div>
          )}

          {/* Modale de confirmation de la remise à zéro */}
          {resetOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !resetBusy && setResetOpen(false)}>
              <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-red-200 dark:border-red-900/60" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h3 className="font-bold text-slate-900 dark:text-white">Confirmer la remise à zéro</h3>
                </div>
                <div className="p-5 space-y-4 text-xs text-slate-600 dark:text-slate-300">
                  <p>
                    Cette action est <strong className="text-red-600 dark:text-red-400">irréversible</strong>.
                    Les clients, fournisseurs et le catalogue produits sont conservés ; tout le reste
                    (stock, ventes, achats, règlements, soldes clients…) est remis à zéro.
                  </p>
                  <div>
                    <label className="block mb-1 text-slate-500 dark:text-slate-400">
                      Pour confirmer, tape <strong className="text-slate-900 dark:text-white font-mono">{RESET_PHRASE}</strong> :
                    </label>
                    <input
                      type="text"
                      value={resetConfirm}
                      onChange={(e) => setResetConfirm(e.target.value)}
                      autoFocus
                      disabled={resetBusy}
                      placeholder={RESET_PHRASE}
                      className="w-full bg-white dark:bg-slate-950/40 p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono tracking-wider focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setResetOpen(false)}
                    disabled={resetBusy}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleResetFigures}
                    disabled={resetBusy || resetConfirm.trim().toUpperCase() !== RESET_PHRASE}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    {resetBusy ? 'En cours…' : 'Confirmer la remise à zéro'}
                  </button>
                </div>
              </div>
            </div>
          )}

    </div>
  );
}
