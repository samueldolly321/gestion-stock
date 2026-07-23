import React, { useState, useMemo } from 'react';
import { UserCog, Plus, Trash2, KeyRound, X, ShieldCheck, ShieldOff } from 'lucide-react';
import { User } from '../types';
import { ROLES } from '../services/permissions';
import { createUser, updateUser, resetUserPassword, deleteUser } from '../services/usersService';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import Pagination, { usePagination } from './Pagination';

interface UsersProps {
  users: User[];
  currentUser: User;
  onRefresh: () => void;
}

export default function Users({ users, currentUser, onRefresh }: UsersProps) {
  const isSuperAdmin = currentUser.role === 'Super Admin';

  // Rôles attribuables : un non-Super-Admin ne peut pas créer/attribuer Admin/Super Admin.
  const assignableRoles = useMemo(
    () => (isSuperAdmin ? ROLES : ROLES.filter((r) => r !== 'Super Admin' && r !== 'Admin')),
    [isSuperAdmin],
  );

  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return users.filter(
      (u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || u.role.toLowerCase().includes(s),
    );
  }, [users, search]);
  const page = usePagination<User>(filtered);

  // Modal création
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Magasinier');
  const [busy, setBusy] = useState(false);

  // Modal réinitialisation de mot de passe
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const canEditRow = (u: User) => {
    if (u.uid === currentUser.uid) return false; // pas soi-même (rôle/statut)
    if (u.role === 'Super Admin' && !isSuperAdmin) return false;
    return true;
  };

  const openCreate = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('Magasinier');
    setIsCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 6) {
      showAlert('Nom, e-mail et mot de passe (≥ 6 caractères) sont requis.', { variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await createUser({ name: name.trim(), email: email.trim(), password, role, active: true });
      setIsCreateOpen(false);
      showToast(`Compte « ${name.trim()} » créé (${role}).`, { title: 'Utilisateurs' });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la création du compte.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (u: User, newRole: string) => {
    try {
      await updateUser(u.uid, { role: newRole });
      showToast(`Rôle de ${u.name} → ${newRole}.`, { title: 'Utilisateurs' });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors du changement de rôle.', { variant: 'error' });
    }
  };

  const toggleActive = async (u: User) => {
    try {
      await updateUser(u.uid, { active: !u.active });
      showToast(`${u.name} ${u.active ? 'désactivé' : 'réactivé'}.`, { title: 'Utilisateurs', type: 'info' });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors du changement de statut.', { variant: 'error' });
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || newPassword.length < 6) {
      showAlert('Le nouveau mot de passe doit contenir au moins 6 caractères.', { variant: 'warning' });
      return;
    }
    try {
      await resetUserPassword(resetTarget.uid, newPassword);
      showToast(`Mot de passe réinitialisé pour ${resetTarget.name}.`, { title: 'Utilisateurs' });
      setResetTarget(null);
      setNewPassword('');
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la réinitialisation.', { variant: 'error' });
    }
  };

  const handleDelete = async (u: User) => {
    if (!(await showConfirm(`Supprimer définitivement le compte « ${u.name} » ?`, { title: 'Supprimer le compte', confirmText: 'Supprimer' }))) return;
    try {
      await deleteUser(u.uid);
      showToast(`Compte « ${u.name} » supprimé.`, { title: 'Utilisateurs', type: 'info' });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Suppression refusée.', { variant: 'error' });
    }
  };

  const inputCls =
    'w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserCog className="w-5 h-5 text-cyan-500" />
            Gestion des Utilisateurs
          </h2>
          <p className="text-xs text-slate-400">Créez les comptes, attribuez les rôles et gérez les accès.</p>
        </div>
        <button
          onClick={openCreate}
          className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition"
        >
          <Plus className="w-4 h-4" />
          Nouvel Utilisateur
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <input
          type="text"
          placeholder="Rechercher un nom, e-mail ou rôle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Utilisateur</th>
                <th className="py-3 px-4 hidden md:table-cell">E-mail</th>
                <th className="py-3 px-4">Rôle</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 hidden lg:table-cell">Créé le</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs text-slate-600 dark:text-gray-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">Aucun utilisateur.</td>
                </tr>
              ) : (
                page.paged.map((u) => {
                  const self = u.uid === currentUser.uid;
                  const editable = canEditRow(u);
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700/50 shrink-0" referrerPolicy="no-referrer" />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 dark:text-white block truncate">
                              {u.name} {self && <span className="text-[9px] text-cyan-500 font-normal">(vous)</span>}
                            </span>
                            <span className="text-[10px] text-slate-400 md:hidden truncate block">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell text-slate-500 dark:text-slate-300">{u.email}</td>
                      <td className="py-3 px-4">
                        <select
                          value={u.role}
                          disabled={!editable}
                          onChange={(e) => changeRole(u, e.target.value)}
                          className="text-[11px] font-semibold rounded-md px-2 py-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30 text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {/* Toujours afficher le rôle courant même s'il n'est pas attribuable */}
                          {(assignableRoles.includes(u.role) ? assignableRoles : [u.role, ...assignableRoles]).map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${u.active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-300/40 dark:bg-slate-700/50 text-slate-500'}`}>
                          {u.active ? 'ACTIF' : 'INACTIF'}
                        </span>
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell font-mono text-[11px] text-slate-400">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={self}
                            title={u.active ? 'Désactiver' : 'Réactiver'}
                            className="p-1.5 bg-slate-100 hover:bg-amber-500/10 text-slate-500 hover:text-amber-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {u.active ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => { setResetTarget(u); setNewPassword(''); }}
                            disabled={u.role === 'Super Admin' && !isSuperAdmin}
                            title="Réinitialiser le mot de passe"
                            className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={self}
                            title="Supprimer"
                            className="p-1.5 bg-slate-100 hover:bg-red-500/10 text-slate-500 hover:text-red-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page.page} pageCount={page.pageCount} total={page.total} from={page.from} to={page.to} onChange={page.setPage} />
      </div>

      {/* Modal création */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in text-xs">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCog className="w-4 h-4 text-cyan-500" />
                Nouvel Utilisateur
              </h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Nom complet *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">E-mail *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Mot de passe provisoire * (≥ 6 caractères)</label>
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="À communiquer à l'utilisateur" />
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Rôle *</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 font-semibold">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer">
                  Annuler
                </button>
                <button type="submit" disabled={busy} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg cursor-pointer transition">
                  {busy ? 'Création...' : 'Créer le compte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal réinitialisation mot de passe */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-fade-in text-xs">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-500" />
                Réinitialiser le mot de passe
              </h3>
              <button onClick={() => setResetTarget(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleReset} className="p-5 space-y-4">
              <p className="text-slate-500 dark:text-slate-400">
                Nouveau mot de passe pour <strong className="text-slate-900 dark:text-white">{resetTarget.name}</strong>.
              </p>
              <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} placeholder="Mot de passe provisoire (≥ 6 caractères)" />
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 font-semibold">
                <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer">
                  Annuler
                </button>
                <button type="submit" className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg cursor-pointer transition">
                  Réinitialiser
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
