import React, { useState, useMemo } from 'react';
import { Wallet, Plus, Edit2, Trash2, X, Download } from 'lucide-react';
import { Expense, ExpenseCategory, Supplier, User } from '../types';
import { useMoney } from '../services/CurrencyContext';
import {
  EXPENSE_CATEGORIES, expenseCategoryLabel, createExpense, updateExpense, deleteExpense,
} from '../services/expensesService';
import { canWrite as hasWritePerm } from '../services/permissions';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import Pagination, { usePagination } from './Pagination';

interface ExpensesProps {
  expenses: Expense[];
  suppliers: Supplier[];
  user: User;
  onRefresh: () => void;
  writePerms?: Record<string, string[]> | null;
}

export default function Expenses({ expenses, suppliers, user, onRefresh, writePerms }: ExpensesProps) {
  const { format } = useMoney();
  const canWrite = useMemo(() => hasWritePerm(user.role, 'expenses', writePerms), [user.role, writePerms]);

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return expenses.filter((e) => {
      const m = e.label.toLowerCase().includes(s) || (e.supplierName || '').toLowerCase().includes(s) || e.id.toLowerCase().includes(s);
      const c = catFilter === 'all' || e.category === catFilter;
      return m && c;
    });
  }, [expenses, search, catFilter]);
  const page = usePagination<Expense>(filtered);

  const total = useMemo(() => filtered.reduce((a, e) => a + e.amount, 0), [filtered]);
  const unpaidTotal = useMemo(
    () => expenses.filter((e) => e.paymentStatus === 'unpaid').reduce((a, e) => a + e.amount, 0),
    [expenses],
  );

  // Modal
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('transport');
  const [amount, setAmount] = useState(0);
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState('');
  const [paid, setPaid] = useState(true);
  const [notes, setNotes] = useState('');

  const openCreate = () => {
    setEditing(null);
    setLabel(''); setCategory('transport'); setAmount(0); setSupplierId(''); setDate(''); setPaid(true); setNotes('');
    setIsOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setLabel(e.label); setCategory(e.category); setAmount(e.amount); setSupplierId(e.supplierId || '');
    setDate(e.date || ''); setPaid(e.paymentStatus === 'paid'); setNotes(e.notes || '');
    setIsOpen(true);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!label.trim() || amount <= 0) {
      showAlert('Libellé et montant (> 0) sont requis.', { variant: 'warning' });
      return;
    }
    const sup = suppliers.find((s) => s.id === supplierId);
    const data = {
      label: label.trim(), category, amount: Number(amount),
      supplierId: supplierId || null, supplierName: sup?.name || null,
      paymentStatus: paid ? 'paid' as const : 'unpaid' as const,
      date: date || null, notes: notes.trim() || null,
    };
    try {
      if (editing) { await updateExpense(editing.id, data); showToast('Dépense mise à jour.', { title: 'Dépenses' }); }
      else { await createExpense(data); showToast('Dépense enregistrée.', { title: 'Dépenses' }); }
      setIsOpen(false);
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de l\'enregistrement.', { variant: 'error' });
    }
  };

  const handleDelete = async (e: Expense) => {
    if (!(await showConfirm(`Supprimer la dépense « ${e.label} » ?`, { title: 'Supprimer', confirmText: 'Supprimer' }))) return;
    try {
      await deleteExpense(e.id);
      showToast('Dépense supprimée.', { title: 'Dépenses', type: 'info' });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Suppression refusée.', { variant: 'error' });
    }
  };

  const cols = [
    { label: 'Réf', value: (e: Expense) => e.id },
    { label: 'Libellé', value: (e: Expense) => e.label },
    { label: 'Catégorie', value: (e: Expense) => expenseCategoryLabel(e.category) },
    { label: 'Fournisseur', value: (e: Expense) => e.supplierName || '' },
    { label: 'Montant', value: (e: Expense) => e.amount },
    { label: 'Statut', value: (e: Expense) => (e.paymentStatus === 'paid' ? 'Payé' : 'Non payé') },
    { label: 'Date', value: (e: Expense) => e.date || new Date(e.createdAt).toLocaleDateString() },
  ];
  const handleExport = (fmt: 'pdf' | 'excel') => {
    if (fmt === 'excel') exportExcel('depenses', 'Dépenses', cols, filtered);
    else exportPdf('depenses', 'Dépenses Diverses', cols, filtered);
    showToast(`${filtered.length} dépense(s) exportée(s) (${fmt.toUpperCase()}).`, { title: 'Export' });
  };

  const inputCls = 'w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

  return (
    <div className="space-y-6">
      {/* Title + totaux */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-cyan-500" />
            Dépenses Diverses
          </h2>
          <p className="text-xs text-slate-400">Frais liés aux achats (transport, douane, taxes…) et autres dépenses.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-right">
            <span className="text-[9px] uppercase font-mono text-slate-400 block">Total (filtré)</span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{format(total)}</span>
          </div>
          {unpaidTotal > 0 && (
            <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-right">
              <span className="text-[9px] uppercase font-mono text-red-400 block">À payer</span>
              <span className="text-sm font-bold font-mono text-red-500">{format(unpaidTotal)}</span>
            </div>
          )}
          <button onClick={() => handleExport('pdf')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5">
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
          <button onClick={() => handleExport('excel')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5">
            <Download className="w-4 h-4 text-green-700" /> Excel
          </button>
          {canWrite && (
            <button onClick={openCreate} className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition">
              <Plus className="w-4 h-4" /> Nouvelle Dépense
            </button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col sm:flex-row gap-3">
        <input type="text" placeholder="Rechercher un libellé, fournisseur..." value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} flex-1`} />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className={`${inputCls} sm:w-48`}>
          <option value="all">Toutes catégories</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Libellé</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4 hidden md:table-cell">Fournisseur</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 hidden lg:table-cell">Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs text-slate-600 dark:text-gray-300">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">Aucune dépense enregistrée.</td></tr>
              ) : (
                page.paged.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{e.label}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">
                        {EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.icon} {expenseCategoryLabel(e.category)}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-slate-500 dark:text-slate-300">{e.supplierName || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">{format(e.amount)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${e.paymentStatus === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        {e.paymentStatus === 'paid' ? 'PAYÉ' : 'NON PAYÉ'}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell font-mono text-[11px] text-slate-400">{e.date || new Date(e.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        {canWrite && (
                          <>
                            <button onClick={() => openEdit(e)} title="Modifier" className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(e)} title="Supprimer" className="p-1.5 bg-slate-100 hover:bg-red-500/10 text-slate-500 hover:text-red-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page.page} pageCount={page.pageCount} total={page.total} from={page.from} to={page.to} onChange={page.setPage} />
      </div>

      {/* Modal création/édition */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in text-xs">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-cyan-500" />{editing ? 'Modifier la dépense' : 'Nouvelle dépense'}</h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Libellé *</label>
                <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="ex. Transport marchandises port" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Catégorie *</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputCls}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Montant (Ar) *</label>
                  <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputCls} />
                </div>
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Fournisseur (optionnel)</label>
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
                    <option value="">— Aucun —</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="accent-cyan-500 w-3.5 h-3.5" />
                <span className="text-slate-700 dark:text-slate-200">Déjà payée</span>
              </label>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Notes</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 font-semibold">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer">Annuler</button>
                <button type="submit" className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg cursor-pointer transition">{editing ? 'Enregistrer' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
