import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { register, login, isRegistrationOpen } from '../services/authService';
import { getPublicPages, type PublicPages } from '../services/settingsService';
import {
  LogIn,
  Boxes,
  AlertCircle,
  ShieldAlert,
  Mail,
  Lock,
  UserPlus,
  Info,
  ShoppingCart,
  BarChart3,
  ShieldCheck,
  ScanBarcode,
  X,
} from 'lucide-react';

// Atouts de la plateforme affichés dans le panneau gauche du portail.
const FEATURES = [
  { icon: Boxes, title: 'Stock & multi-entrepôts', desc: 'Articles, seuils d’alerte, code-barres EAN-13, ventes en gros (carton).' },
  { icon: ShoppingCart, title: 'Caisse & ventes', desc: 'Point de vente rapide, impression de tickets, tarifs par client.' },
  { icon: BarChart3, title: 'Pilotage & comptabilité', desc: 'Tableau de bord, TVA, résultat, résumé d’activité par IA.' },
  { icon: ShieldCheck, title: 'Sécurité & rôles', desc: 'Contrôle d’accès (RBAC) par module et par utilisateur.' },
];

interface AuthPageProps {
  onLoginSuccess: (user: User) => void;
}

// Image de fond libre de droits (Unsplash) — thème entrepôt / logistique.
const LOGIN_BG = 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1600&q=80';

export default function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [isSignUp, setIsSignUp] = useState(false);
  // L'inscription n'est ouverte que pour le tout premier compte (bootstrap propriétaire).
  const [regOpen, setRegOpen] = useState(false);
  useEffect(() => {
    isRegistrationOpen().then((open) => {
      setRegOpen(open);
      if (!open) setIsSignUp(false); // force le mode connexion si l'inscription est fermée
    });
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  // Aide « mot de passe oublié » (récupération sans e-mail).
  const [showForgot, setShowForgot] = useState(false);

  // Pages publiques éditables (À propos / Confidentialité) + modale de lecture.
  const [pages, setPages] = useState<PublicPages | null>(null);
  const [modalPage, setModalPage] = useState<null | 'about' | 'privacy'>(null);
  useEffect(() => {
    getPublicPages().then(setPages).catch(() => setPages(null));
  }, []);

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Veuillez remplir tous les champs requis.');
      return;
    }

    if (isSignUp) {
      if (!fullName) {
        setError('Veuillez renseigner votre nom complet.');
        return;
      }
      if (password.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }
    }

    setLoading(true);
    try {
      const user = isSignUp
        ? await register({ name: fullName, email, password })
        : await login(email, password);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err?.message || "Une erreur est survenue lors de l'authentification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-[#0b0f19] text-gray-100 font-sans selection:bg-cyan-500 selection:text-black">

      {/* Left pane: Branding & Design */}
      <div className="w-full md:w-1/2 bg-gradient-to-br from-slate-900 via-[#0d1527] to-[#080d1a] p-8 md:p-12 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800/80 relative overflow-hidden">
        {/* Image de fond + voiles pour garder le texte lisible */}
        <div className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${LOGIN_BG})` }} aria-hidden="true"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/85 via-[#0d1527]/85 to-[#080d1a]/95" aria-hidden="true"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full filter blur-3xl opacity-40"></div>
        <div className="absolute -bottom-10 -left-10 w-96 h-96 bg-indigo-500/10 rounded-full filter blur-3xl opacity-40"></div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl shadow-lg shadow-cyan-500/20">
            <Boxes className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Vokatra<span className="text-cyan-400 font-medium">-ko</span>
            </h1>
            <p className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">v2.5 Enterprise</p>
          </div>
        </div>

        <div className="my-12 md:my-0 relative z-10">
          <h2 className="text-3xl md:text-4xl font-extrabold leading-tight text-white tracking-tight">
            Maîtrisez vos flux de <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">stocks & ventes</span> en temps réel.
          </h2>
          <p className="mt-4 text-sm text-gray-400 leading-relaxed max-w-sm">
            Une plateforme conçue pour automatiser vos inventaires, centraliser vos terminaux de vente, et sécuriser votre comptabilité.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="flex gap-3 items-start text-xs text-gray-300 bg-slate-800/40 p-3 rounded-xl border border-slate-700/30 hover:border-cyan-500/40 transition">
                  <div className="p-2 rounded-lg bg-cyan-400/10 text-cyan-400 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <strong className="text-white block leading-tight">{f.title}</strong>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-start gap-3 text-xs text-gray-300 bg-cyan-950/20 p-3 rounded-xl border border-cyan-500/20 max-w-xl">
            <div className="p-2 rounded-lg bg-cyan-400/10 text-cyan-400 shrink-0">
              <ScanBarcode className="w-4 h-4" />
            </div>
            <div>
              <strong className="text-white">Vos données restent chez vous</strong>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">Hébergement sur votre propre base de données, en local ou sur votre serveur — sans dépendance à un cloud tiers.</p>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-mono relative z-10 flex flex-wrap gap-x-4 gap-y-1 justify-between items-center">
          <span>© 2026 {pages?.brandName || 'Vokatra-ko'}</span>
          <div className="flex items-center gap-3">
            {pages?.aboutText && (
              <button type="button" onClick={() => setModalPage('about')} className="hover:text-cyan-400 transition cursor-pointer">À propos</button>
            )}
            {pages?.privacyText && (
              <button type="button" onClick={() => setModalPage('privacy')} className="hover:text-cyan-400 transition cursor-pointer">Confidentialité</button>
            )}
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
              PostgreSQL
            </span>
          </div>
        </div>
      </div>

      {/* Right pane: Login inputs */}
      <div className="flex-1 flex flex-col justify-center p-6 md:p-16 bg-[#070b12] relative overflow-y-auto">
        {/* Fond visuel très discret derrière le formulaire */}
        <div className="absolute inset-0 bg-cover bg-center opacity-[0.05]" style={{ backgroundImage: `url(${LOGIN_BG})` }} aria-hidden="true"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#070b12] via-[#070b12]/70 to-transparent" aria-hidden="true"></div>
        <div className="max-w-md w-full mx-auto space-y-6 relative z-10">

          {/* Main heading */}
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {isSignUp ? 'Créer un compte' : 'Portail de connexion'}
            </h2>
            <p className="mt-1.5 text-xs text-gray-400">
              {isSignUp
                ? 'Inscrivez-vous pour obtenir votre espace de gestion ERP personnalisé.'
                : 'Connectez-vous à votre compte Vokatra-ko.'}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-xl flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="space-y-1">{error}</div>
            </div>
          )}

          {/* STANDARD EMAIL/PASSWORD AUTH */}
          <form onSubmit={handleEmailAuthSubmit} className="space-y-4">

            {isSignUp && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                  Nom complet
                </label>
                <div className="relative">
                  <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Jean Dupont"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={loading}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white outline-none transition"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                Adresse e-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  placeholder="jean.dupont@entreprise.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white outline-none transition"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white outline-none transition"
                />
              </div>
              {!isSignUp && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowForgot((v) => !v)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono transition"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              )}
            </div>

            {!isSignUp && showForgot && (
              <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl space-y-2">
                <p className="text-[11px] text-cyan-200 leading-relaxed">
                  <strong>Vous êtes un employé ?</strong> Demandez à un <strong>Administrateur</strong> de
                  réinitialiser votre mot de passe depuis l'onglet <em>Utilisateurs</em>.
                </p>
                <p className="text-[11px] text-cyan-200 leading-relaxed">
                  <strong>Vous êtes le Super Admin</strong> et personne ne peut vous débloquer ? Le
                  responsable technique lance la commande de secours sur le serveur :
                </p>
                <code className="block bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[10px] text-cyan-300 font-mono select-all">
                  npm run reset-password -- votre@email NouveauMotDePasse
                </code>
              </div>
            )}

            {isSignUp && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      required
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white outline-none transition"
                    />
                  </div>
                </div>

                <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                  <p className="text-[10px] text-cyan-300 leading-normal font-mono">
                    Ce compte est le <strong>propriétaire</strong> de l'ERP : il sera créé en « Super Admin ».
                    Les comptes suivants se créent ensuite depuis l'onglet Utilisateurs.
                  </p>
                </div>
              </>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-800/50 text-white font-bold rounded-xl text-sm transition duration-200 shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
              ) : isSignUp ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Créer mon compte ERP</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Se connecter</span>
                </>
              )}
            </button>

            {/* Toggle Login/Signup Mode — visible seulement si l'inscription est ouverte (bootstrap) */}
            {regOpen && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError(null);
                  }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline font-medium transition cursor-pointer"
                >
                  {isSignUp
                    ? 'Déjà un compte ? Connectez-vous ici'
                    : 'Créer le compte propriétaire (première installation)'}
                </button>
              </div>
            )}
          </form>

          {/* Info notice */}
          <div className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl flex items-start gap-2 text-[10px] text-slate-400 leading-relaxed">
            <Info className="w-3.5 h-3.5 shrink-0 text-cyan-400 mt-0.5" />
            <span>
              Vos identifiants sont vérifiés par l'API et stockés de façon sécurisée (mots de passe hachés) dans votre base <strong>PostgreSQL</strong>.
            </span>
          </div>

          {/* Security disclaimer */}
          <div className="p-3.5 bg-cyan-950/20 border border-cyan-500/20 rounded-xl flex items-start gap-2.5 text-[11px] text-cyan-300/80">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Note :</strong> assurez-vous que l'API (<code>npm run server</code>) est démarrée sur le port 3001.
            </span>
          </div>

        </div>
      </div>

      {/* Modale « À propos » / « Confidentialité » (contenu éditable dans Configuration ERP) */}
      {modalPage && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalPage(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h3 className="font-bold text-white flex items-center gap-2">
                {modalPage === 'about' ? <Info className="w-4 h-4 text-cyan-400" /> : <ShieldCheck className="w-4 h-4 text-cyan-400" />}
                {modalPage === 'about' ? 'À propos' : 'Confidentialité'}
              </h3>
              <button onClick={() => setModalPage(null)} className="text-slate-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {(modalPage === 'about' ? pages?.aboutText : pages?.privacyText) || 'Aucun contenu.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
