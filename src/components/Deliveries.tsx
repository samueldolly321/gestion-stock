import React, { useState, useMemo } from 'react';
import { Truck, Plus, Edit2, Trash2, MapPin, User as UserIcon, Download, X } from 'lucide-react';
import { Delivery, Client, User, DeliveryType, DeliveryStatus } from '../types';
import { useMoney } from '../services/CurrencyContext';
import {
  DELIVERY_TYPES,
  deliveryTypeLabel,
  defaultFeeFor,
  createDelivery,
  updateDelivery,
  deleteDelivery,
} from '../services/deliveriesService';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import Pagination, { usePagination } from './Pagination';
import { canWrite as hasWritePerm } from '../services/permissions';

interface DeliveriesProps {
  deliveries: Delivery[];
  clients: Client[];
  user: User;
  onRefresh: () => void;
  currencySymbol: string;
  writePerms?: Record<string, string[]> | null;
}

const STATUS_META: Record<DeliveryStatus, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-amber-500/10 text-amber-500' },
  in_transit: { label: 'En cours', cls: 'bg-cyan-500/10 text-cyan-500' },
  delivered: { label: 'Livré', cls: 'bg-emerald-500/10 text-emerald-500' },
  cancelled: { label: 'Annulé', cls: 'bg-red-500/10 text-red-500' },
};

export default function Deliveries({ deliveries, clients, user, onRefresh, writePerms }: DeliveriesProps) {
  const { format } = useMoney();

  const canWrite = useMemo(() => hasWritePerm(user.role, 'deliveries', writePerms), [user.role, writePerms]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Formulaire modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Delivery | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<DeliveryType>('moto');
  const [fee, setFee] = useState<number>(defaultFeeFor('moto'));
  const [status, setStatus] = useState<DeliveryStatus>('pending');
  const [driverName, setDriverName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');

  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      const s = search.toLowerCase();
      const matchSearch =
        (d.clientName || '').toLowerCase().includes(s) ||
        (d.address || '').toLowerCase().includes(s) ||
        (d.driverName || '').toLowerCase().includes(s) ||
        d.id.toLowerCase().includes(s);
      const matchStatus = statusFilter === 'all' || d.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [deliveries, search, statusFilter]);

  const page = usePagination<Delivery>(filtered);

  const openCreate = () => {
    setEditing(null);
    setClientId('');
    setClientName('');
    setAddress('');
    setType('moto');
    setFee(defaultFeeFor('moto'));
    setStatus('pending');
    setDriverName('');
    setScheduledDate('');
    setNotes('');
    setIsModalOpen(true);
  };

  const openEdit = (d: Delivery) => {
    setEditing(d);
    setClientId(d.clientId || '');
    setClientName(d.clientName || '');
    setAddress(d.address || '');
    setType(d.type);
    setFee(d.fee);
    setStatus(d.status);
    setDriverName(d.driverName || '');
    setScheduledDate(d.scheduledDate || '');
    setNotes(d.notes || '');
    setIsModalOpen(true);
  };

  const onSelectClient = (id: string) => {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) {
      setClientName(c.name);
      if (c.address) setAddress(c.address);
    }
  };

  const onSelectType = (t: DeliveryType) => {
    setType(t);
    // Pré-remplit le tarif par défaut si l'utilisateur n'a rien changé.
    if (!editing) setFee(defaultFeeFor(t));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      showAlert('Veuillez indiquer le client.', { variant: 'warning' });
      return;
    }
    const data = {
      saleId: editing?.saleId ?? null,
      clientId: clientId || null,
      clientName: clientName.trim(),
      address: address.trim() || null,
      type,
      fee: Number(fee) || 0,
      status,
      driverName: driverName.trim() || null,
      scheduledDate: scheduledDate || null,
      notes: notes.trim() || null,
    };
    try {
      if (editing) {
        await updateDelivery(editing.id, data);
        showToast('Livraison mise à jour.', { title: 'Livraisons' });
      } else {
        await createDelivery(data as any);
        showToast('Livraison créée.', { title: 'Livraisons' });
      }
      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || "Erreur lors de l'enregistrement de la livraison.", { variant: 'error' });
    }
  };

  const quickStatus = async (d: Delivery, s: DeliveryStatus) => {
    try {
      await updateDelivery(d.id, { ...d, status: s });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors du changement de statut.', { variant: 'error' });
    }
  };

  const handleDelete = async (d: Delivery) => {
    if (!(await showConfirm(`Supprimer cette livraison (${d.clientName || d.id}) ?`, { title: 'Supprimer', confirmText: 'Supprimer' }))) return;
    try {
      await deleteDelivery(d.id);
      showToast('Livraison supprimée.', { title: 'Livraisons', type: 'info' });
      onRefresh();
    } catch (err: any) {
      showAlert(err?.message || 'Action refusée.', { variant: 'error' });
    }
  };

  const exportColumns = [
    { label: 'ID', value: (d: Delivery) => d.id },
    { label: 'Client', value: (d: Delivery) => d.clientName || '' },
    { label: 'Adresse', value: (d: Delivery) => d.address || '' },
    { label: 'Type', value: (d: Delivery) => deliveryTypeLabel(d.type) },
    { label: 'Tarif', value: (d: Delivery) => d.fee },
    { label: 'Chauffeur', value: (d: Delivery) => d.driverName || '' },
    { label: 'Date prévue', value: (d: Delivery) => d.scheduledDate || '' },
    { label: 'Statut', value: (d: Delivery) => STATUS_META[d.status].label },
  ];
  const handleExport = (fmt: 'pdf' | 'excel') => {
    if (fmt === 'excel') exportExcel('livraisons', 'Livraisons', exportColumns, filtered);
    else exportPdf('livraisons', 'Livraisons', exportColumns, filtered);
    showToast(`${filtered.length} livraison(s) exportée(s) (${fmt.toUpperCase()}).`, { title: 'Export' });
  };

  const inputCls =
    'w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-cyan-500" />
            Livraisons Client
          </h2>
          <p className="text-xs text-slate-400">Planifiez et suivez les livraisons ; le tarif est ajouté à la facture.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleExport('pdf')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-red-500" />
            Exporter PDF
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-green-700" />
            Exporter Excel
          </button>
          {canWrite && (
            <button
              onClick={openCreate}
              className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              Nouvelle Livraison
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Rechercher client, adresse, chauffeur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputCls} flex-1`}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} sm:w-48`}>
          <option value="all">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="in_transit">En cours</option>
          <option value="delivered">Livré</option>
          <option value="cancelled">Annulé</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4 hidden md:table-cell">Adresse</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Tarif</th>
                <th className="py-3 px-4 hidden lg:table-cell">Chauffeur</th>
                <th className="py-3 px-4 hidden lg:table-cell">Date prévue</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs text-slate-600 dark:text-gray-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Aucune livraison enregistrée.
                  </td>
                </tr>
              ) : (
                page.paged.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition">
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{d.clientName || '—'}</td>
                    <td className="py-3.5 px-4 max-w-xs truncate hidden md:table-cell">
                      <span className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{d.address || '—'}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">
                        {DELIVERY_TYPES.find((t) => t.value === d.type)?.icon} {deliveryTypeLabel(d.type)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">{format(d.fee)}</td>
                    <td className="py-3.5 px-4 hidden lg:table-cell">{d.driverName || '—'}</td>
                    <td className="py-3.5 px-4 hidden lg:table-cell font-mono text-[11px] text-slate-400">
                      {d.scheduledDate || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {canWrite ? (
                        <select
                          value={d.status}
                          onChange={(e) => quickStatus(d, e.target.value as DeliveryStatus)}
                          className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border-0 cursor-pointer focus:outline-none ${STATUS_META[d.status].cls}`}
                        >
                          <option value="pending">En attente</option>
                          <option value="in_transit">En cours</option>
                          <option value="delivered">Livré</option>
                          <option value="cancelled">Annulé</option>
                        </select>
                      ) : (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${STATUS_META[d.status].cls}`}>
                          {STATUS_META[d.status].label}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        {canWrite && (
                          <>
                            <button
                              onClick={() => openEdit(d)}
                              className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-cyan-400 rounded-md transition"
                              title="Modifier"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(d)}
                              className="p-1.5 bg-slate-100 hover:bg-red-500/10 text-slate-500 hover:text-red-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition"
                              title="Supprimer"
                            >
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
        <Pagination
          page={page.page}
          pageCount={page.pageCount}
          total={page.total}
          from={page.from}
          to={page.to}
          onChange={page.setPage}
        />
      </div>

      {/* Modal create/edit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in text-xs">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-cyan-500" />
                {editing ? 'Modifier la Livraison' : 'Nouvelle Livraison'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Client *</label>
                  <select value={clientId} onChange={(e) => onSelectClient(e.target.value)} className={inputCls}>
                    <option value="">— Sélectionner un client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-1 sm:col-span-2">
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Adresse de livraison</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="Quartier, rue, ville..." />
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Type de transport *</label>
                  <select value={type} onChange={(e) => onSelectType(e.target.value as DeliveryType)} className={inputCls}>
                    {DELIVERY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.icon} {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Tarif de livraison (Ar) *</label>
                  <input type="number" min={0} value={fee} onChange={(e) => setFee(Number(e.target.value))} className={inputCls} />
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Chauffeur / Livreur</label>
                  <input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputCls} />
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Date prévue</label>
                  <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className={inputCls} />
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Statut</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as DeliveryStatus)} className={inputCls}>
                    <option value="pending">En attente</option>
                    <option value="in_transit">En cours</option>
                    <option value="delivered">Livré</option>
                    <option value="cancelled">Annulé</option>
                  </select>
                </div>

                <div className="col-span-1 sm:col-span-2">
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Notes</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer"
                >
                  Annuler
                </button>
                <button type="submit" className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg cursor-pointer transition">
                  {editing ? 'Sauvegarder' : 'Créer la livraison'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
