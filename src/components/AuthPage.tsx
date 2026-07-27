import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { register, login, isRegistrationOpen } from '../services/authService';
import {
  LogIn,
  Sparkles,
  AlertCircle,
  ShieldAlert,
  Mail,
  Lock,
  UserPlus,
  Info,
} from 'lucide-react';

interface AuthPageProps {
  onLoginSuccess: (user: User) => void;
}

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
      <div className="w-full md:w-5/12 bg-gradient-to-br from-slate-900 via-[#0d1527] to-[#080d1a] p-8 md:p-12 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800/80 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full filter blur-3xl opacity-40"></div>
        <div className="absolute -bottom-10 -left-10 w-96 h-96 bg-indigo-500/10 rounded-full filter blur-3xl opacity-40"></div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
            <Sparkles className="w-6 h-6 text-cyan-400 animate-pulse" />
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

          <div className="mt-8 space-y-4 max-w-sm">
            <div className="flex gap-3 items-start text-xs text-gray-300 bg-slate-800/40 p-3 rounded-lg border border-slate-700/30">
              <div className="p-1 rounded bg-cyan-400/10 text-cyan-400 mt-0.5">✔</div>
              <div>
                <strong className="text-white">Sécurité RBAC Granulaire</strong>
                <p className="text-[11px] text-gray-400 mt-0.5">8 rôles métier distincts de Magasinier à Auditeur fiscal.</p>
              </div>
            </div>
            <div className="flex gap-3 items-start text-xs text-gray-300 bg-slate-800/40 p-3 rounded-lg border border-slate-700/30">
              <div className="p-1 rounded bg-indigo-400/10 text-indigo-400 mt-0.5">✔</div>
              <div>
                <strong className="text-white">Base PostgreSQL dédiée</strong>
                <p className="text-[11px] text-gray-400 mt-0.5">Vos données hébergées sur votre propre base, sans dépendance cloud.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-mono relative z-10 flex justify-between items-center">
          <span>© 2026 Vokatra-ko</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            PostgreSQL
          </span>
        </div>
      </div>

      {/* Right pane: Login inputs */}
      <div className="flex-1 flex flex-col justify-center p-6 md:p-16 bg-[#070b12] relative overflow-y-auto">
        <div className="max-w-md w-full mx-auto space-y-6">

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
            </div>

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
    </div>
  );
}
