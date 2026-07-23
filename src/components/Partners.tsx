import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  FileText,
  Mail,
  Phone,
  MapPin,
  TrendingUp,
  UserCheck,
  AlertCircle,
  FolderOpen,
  UserPlus,
  Download
} from 'lucide-react';
import { Supplier, Client, User } from '../types';
import { savePartner, deletePartner } from '../services/partnersService';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import Pagination, { usePagination } from './Pagination';
import { canWrite as hasWritePerm } from '../services/permissions';
import { useMoney } from '../services/CurrencyContext';

interface PartnersProps {
  suppliers: Supplier[];
  clients: Client[];
  user: User;
  onRefresh: () => void;
  currencySymbol: string;
  writePerms?: Record<string, string[]> | null;
}

export default function Partners({
  suppliers,
  clients,
  user,
  onRefresh,
  currencySymbol,
  writePerms
}: PartnersProps) {
  const { format } = useMoney();
  const [partnerType, setPartnerType] = useState<'clients' | 'suppliers'>('clients');
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<any>(null);
  const [viewPartner, setViewPartner] = useState<any>(null); // fiche en ligne (mobile)

  // Common fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  // Supplier-specific fields
  const [companyName, setCompanyName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [notes, setNotes] = useState('');

  // Client-specific fields
  const [taxNumber, setTaxNumber] = useState('');
  const [balance, setBalance] = useState(0);

  // Supplier Documents Drawer State
  const [activeDocSupplier, setActiveDocSupplier] = useState<Supplier | null>(null);
  const [newDocName, setNewDocName] = useState('');
  const [docsList, setDocsList] = useState<{ name: string; date: string }[]>([
    { name: 'Kbis_TechDistrib_2026.pdf', date: '12/03/2026' },
    { name: 'Contrat_Cadre_Appro.pdf', date: '15/04/2026' }
  ]);

  const canWrite = useMemo(() => hasWritePerm(user.role, 'partners', writePerms), [user.role, writePerms]);

  // Handle open modal
  const openCreateModal = () => {
    setEditingPartner(null);
    setName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setStatus('active');
    setCompanyName('');
    setVatNumber('');
    setContactPerson('');
    setNotes('');
    setTaxNumber('');
    setBalance(0);
    setIsModalOpen(true);
  };

  const openEditModal = (p: any) => {
    setEditingPartner(p);
    setName(p.name);
    setEmail(p.email);
    setPhone(p.phone);
    setAddress(p.address);
    setStatus(p.status);

    if (partnerType === 'suppliers') {
      setCompanyName(p.companyName || '');
      setVatNumber(p.vatNumber || '');
      setContactPerson(p.contactPerson || '');
      setNotes(p.notes || '');
    } else {
      setTaxNumber(p.taxNumber || '');
      setBalance(p.balance || 0);
    }
    setIsModalOpen(true);
  };

  // Submit Partner
  const handlePartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      showAlert('Veuillez remplir les champs obligatoires.', { variant: 'warning' });
      return;
    }

    const baseData = {
      name,
      email,
      phone,
      address,
      status,
      createdAt: editingPartner ? editingPartner.createdAt : new Date().toISOString()
    };

    const finalData =
      partnerType === 'suppliers'
        ? {
            ...baseData,
            companyName: companyName || name,
            vatNumber,
            contactPerson,
            notes
          }
        : {
            ...baseData,
            taxNumber,
            balance: Number(balance),
            loyaltyPoints: editingPartner ? editingPartner.loyaltyPoints : 0
          };

    try {
      await savePartner(partnerType, finalData, editingPartner?.id);
      setIsModalOpen(false);
      onRefresh();
      const label = partnerType === 'suppliers' ? 'Fournisseur' : 'Client';
      showToast(editingPartner ? `${label} « ${name} » modifié.` : `${label} « ${name} » créé.`, { title: 'Partenaires' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de l\'enregistrement. Vérifiez vos permissions.', { variant: 'error' });
    }
  };

  // Delete Partner
  const handleDeletePartner = async (id: string) => {
    if (await showConfirm('Voulez-vous vraiment supprimer ce tiers commercial ?', { title: 'Supprimer le tiers', confirmText: 'Supprimer' })) {
      try {
        await deletePartner(partnerType, id);
        onRefresh();
        showToast(partnerType === 'suppliers' ? 'Fournisseur supprimé.' : 'Client supprimé.', { title: 'Partenaires', type: 'info' });
      } catch (err: any) {
        showAlert(err?.message || 'Action refusée (permissions insuffisantes).', { variant: 'error' });
      }
    }
  };

  // Add mock Supplier Document
  const handleAddDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName) return;
    setDocsList([
      ...docsList,
      {
        name: newDocName.endsWith('.pdf') ? newDocName : `${newDocName}.pdf`,
        date: new Date().toLocaleDateString('fr-FR')
      }
    ]);
    setNewDocName('');
  };

  // Filtered partners list
  const filteredPartners = useMemo(() => {
    const list = partnerType === 'clients' ? clients : suppliers;
    return list.filter((p) => {
      return (
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone.includes(searchTerm)
      );
    });
  }, [partnerType, clients, suppliers, searchTerm]);

  const partnersPage = usePagination<any>(filteredPartners);

  const handleExport = (fmt: 'pdf' | 'excel') => {
    const cols =
      partnerType === 'suppliers'
        ? [
            { label: 'Nom', value: (p: any) => p.name },
            { label: 'Entreprise', value: (p: any) => p.companyName || '' },
            { label: 'Email', value: (p: any) => p.email },
            { label: 'Téléphone', value: (p: any) => p.phone || '' },
            { label: 'Adresse', value: (p: any) => p.address || '' },
            { label: 'Interlocuteur', value: (p: any) => p.contactPerson || '' },
            { label: 'N° TVA', value: (p: any) => p.vatNumber || '' },
            { label: 'Statut', value: (p: any) => (p.status === 'active' ? 'Actif' : 'Inactif') },
          ]
        : [
            { label: 'Nom', value: (p: any) => p.name },
            { label: 'Email', value: (p: any) => p.email },
            { label: 'Téléphone', value: (p: any) => p.phone || '' },
            { label: 'Adresse', value: (p: any) => p.address || '' },
            { label: 'Encours', value: (p: any) => p.balance || 0 },
            { label: 'Fidélité (pts)', value: (p: any) => p.loyaltyPoints || 0 },
            { label: 'Statut', value: (p: any) => (p.status === 'active' ? 'Actif' : 'Inactif') },
          ];
    const fname = partnerType === 'suppliers' ? 'fournisseurs' : 'clients';
    const title = partnerType === 'suppliers' ? 'Fournisseurs' : 'Clients';
    if (fmt === 'excel') exportExcel(fname, title, cols, filteredPartners);
    else exportPdf(fname, title, cols, filteredPartners);
    showToast(`${filteredPartners.length} ${partnerType === 'suppliers' ? 'fournisseur(s)' : 'client(s)'} exporté(s) (${fmt.toUpperCase()}).`, { title: 'Export' });
  };

  // Fiche tiers affichée en ligne sous la ligne cliquée (mobile / tablette < lg).
  const renderPartnerFiche = (vp: any) => (
    <div className="bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm relative animate-fade-in">
      <button
        onClick={() => setViewPartner(null)}
        className="absolute top-3 right-3 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        Fermer ✕
      </button>
      <h4 className="font-bold text-slate-900 dark:text-white text-sm pr-14">{vp.name}</h4>
      {partnerType === 'suppliers' && vp.companyName && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{vp.companyName}</p>
      )}

      <div className="space-y-2 border-t border-slate-200 dark:border-slate-800/60 pt-3 mt-3 text-xs">
        <div className="flex justify-between gap-3">
          <span className="text-slate-400 flex items-center gap-1 shrink-0"><Mail className="w-3.5 h-3.5" />Email</span>
          <span className="text-slate-900 dark:text-slate-200 truncate text-right">{vp.email}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-400 flex items-center gap-1 shrink-0"><Phone className="w-3.5 h-3.5" />Téléphone</span>
          <span className="text-slate-900 dark:text-slate-200 text-right">{vp.phone || '-'}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-400 flex items-center gap-1 shrink-0"><MapPin className="w-3.5 h-3.5" />Adresse</span>
          <span className="text-slate-900 dark:text-slate-200 truncate text-right">{vp.address || '-'}</span>
        </div>
        {partnerType === 'clients' ? (
          <>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400 shrink-0">Encours financier</span>
              <span className="font-mono font-bold text-red-400">{format(vp.balance > 0 ? vp.balance : 0)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400 shrink-0">Fidélité</span>
              <span className="font-mono font-bold text-cyan-400">{vp.loyaltyPoints || 0} pts</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-3">
            <span className="text-slate-400 shrink-0">Interlocuteur</span>
            <span className="text-slate-900 dark:text-slate-200 text-right">{vp.contactPerson || '-'}</span>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <span className="text-slate-400 shrink-0">Statut</span>
          <span className={vp.status === 'active' ? 'text-emerald-500 font-semibold' : 'text-slate-400'}>
            {vp.status === 'active' ? 'Actif' : 'Inactif'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Partenaires Commerciaux</h2>
          <p className="text-xs text-slate-400">Gérez vos clients fidèles et vos fournisseurs de chaîne d'approvisionnement.</p>
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
              onClick={openCreateModal}
              className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition duration-150"
            >
              <UserPlus className="w-4 h-4" />
              Nouveau Tiers ({partnerType === 'clients' ? 'Client' : 'Fournisseur'})
            </button>
          )}
        </div>
      </div>

      {/* Tabs navigation Clients / Suppliers */}
      <div className="flex justify-between items-center bg-white dark:bg-slate-900/40 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setPartnerType('clients');
              setSearchTerm('');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition duration-150 cursor-pointer ${
              partnerType === 'clients'
                ? 'bg-cyan-500/15 text-cyan-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Clients & CRM
          </button>
          <button
            onClick={() => {
              setPartnerType('suppliers');
              setSearchTerm('');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition duration-150 cursor-pointer ${
              partnerType === 'suppliers'
                ? 'bg-cyan-500/15 text-cyan-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Fournisseurs (B2B)
          </button>
        </div>

        {/* Local Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder={`Filtrer par nom, email...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-slate-950/20 text-[11px] py-2 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Partners List Table */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Tiers</th>
                {partnerType === 'suppliers' && <th className="py-3 px-4 hidden lg:table-cell">Entreprise</th>}
                <th className="py-3 px-4 hidden lg:table-cell">Email</th>
                <th className="py-3 px-4 hidden lg:table-cell">Téléphone</th>
                <th className="py-3 px-4 hidden lg:table-cell">Adresse</th>
                {partnerType === 'clients' ? (
                  <>
                    <th className="py-3 px-4 text-right hidden lg:table-cell">Encours financier</th>
                    <th className="py-3 px-4 text-center hidden lg:table-cell">Fidélité (Points)</th>
                  </>
                ) : (
                  <th className="py-3 px-4 hidden lg:table-cell">Interlocuteur</th>
                )}
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs text-slate-600 dark:text-gray-300">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Aucun tiers trouvé dans cette catégorie.
                  </td>
                </tr>
              ) : (
                partnersPage.paged.map((p) => (
                  <React.Fragment key={p.id}>
                  <tr
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition duration-150 cursor-pointer lg:cursor-default"
                    onClick={() => setViewPartner((cur: any) => (cur?.id === p.id ? null : p))}
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      {p.name}
                    </td>
                    {partnerType === 'suppliers' && (
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white hidden lg:table-cell">
                        {p.companyName}
                      </td>
                    )}
                    <td className="py-3.5 px-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{p.email}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{p.phone}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs truncate hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{p.address}</span>
                      </div>
                    </td>
                    {partnerType === 'clients' ? (
                      <>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-red-400 hidden lg:table-cell">
                          {p.balance > 0 ? format(p.balance) : format(0)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-cyan-400 font-bold hidden lg:table-cell">
                          {p.loyaltyPoints || 0} pts
                        </td>
                      </>
                    ) : (
                      <td className="py-3.5 px-4 font-medium hidden lg:table-cell">{p.contactPerson || '-'}</td>
                    )}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                          p.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {p.status === 'active' ? 'ACTIF' : 'INACTIF'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {partnerType === 'suppliers' && (
                          <button
                            onClick={() => setActiveDocSupplier(p)}
                            className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-cyan-400 rounded-md transition duration-150"
                            title="Gérer les documents"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canWrite && (
                          <>
                            <button
                              onClick={() => openEditModal(p)}
                              className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-cyan-400 rounded-md transition duration-150"
                              title="Modifier"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePartner(p.id)}
                              className="p-1.5 bg-slate-100 hover:bg-red-500/10 text-slate-500 hover:text-red-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition duration-150"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Fiche tiers en ligne (mobile/tablette, sous la ligne cliquée) */}
                  {viewPartner?.id === p.id && (
                    <tr className="lg:hidden">
                      <td colSpan={8} className="p-3 bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60">
                        {renderPartnerFiche(p)}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={partnersPage.page}
          pageCount={partnersPage.pageCount}
          total={partnersPage.total}
          from={partnersPage.from}
          to={partnersPage.to}
          onChange={partnersPage.setPage}
        />
      </div>

      {/* SUPPLIER DOCUMENTS DRAWER MODAL */}
      {activeDocSupplier && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-6 shadow-2xl h-full flex flex-col justify-between overflow-y-auto animate-slide-left text-xs">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <FolderOpen className="w-5 h-5 text-cyan-400" />
                  Coffre-fort Documents Fournisseur
                </h3>
                <button
                  onClick={() => setActiveDocSupplier(null)}
                  className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                Uploadez et archivez numériquement les contrats et certifications pour{' '}
                <strong className="text-slate-900 dark:text-white">{activeDocSupplier.companyName}</strong>.
              </p>

              {/* Add document form */}
              <form onSubmit={handleAddDoc} className="space-y-3">
                <label className="text-slate-500 dark:text-slate-400">Nom du document :</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    placeholder="e.g. Attestation_Fiscale_2026"
                    className="flex-1 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg cursor-pointer text-xs"
                  >
                    Simuler Upload
                  </button>
                </div>
              </form>

              {/* Docs listing */}
              <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  Documents archivés ({docsList.length}) :
                </h4>
                {docsList.map((doc, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-200 dark:border-slate-800/60 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                        {doc.name}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 shrink-0">
                      {doc.date}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setActiveDocSupplier(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-bold rounded-lg cursor-pointer mt-6"
            >
              Fermer le coffre
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT PARTNER */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in text-xs">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {editingPartner ? 'Modifier le Tiers' : 'Créer un Nouveau Tiers'} (
                {partnerType === 'clients' ? 'Client' : 'Fournisseur'})
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePartnerSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Name */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Nom Complet / Raison Sociale *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. SAS Tech Solutions"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Address */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Adresse physique complète</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Statut</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-200 focus:outline-none"
                  >
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </div>

                {/* Supplier Specific Field: Company name */}
                {partnerType === 'suppliers' ? (
                  <>
                    <div>
                      <label className="text-slate-500 dark:text-slate-400 block mb-1">Nom Commercial Fournisseur</label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 dark:text-slate-400 block mb-1">N° de TVA Intracommunautaire</label>
                      <input
                        type="text"
                        value={vatNumber}
                        onChange={(e) => setVatNumber(e.target.value)}
                        placeholder="Ex: FR99888777666"
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 dark:text-slate-400 block mb-1">Contact Référent</label>
                      <input
                        type="text"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-slate-500 dark:text-slate-400 block mb-1">Numéro d'Identification Fiscale</label>
                      <input
                        type="text"
                        value={taxNumber}
                        onChange={(e) => setTaxNumber(e.target.value)}
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 dark:text-slate-400 block mb-1">Encours Financier Initial (Ar)</label>
                      <input
                        type="number"
                        value={balance}
                        onChange={(e) => setBalance(Number(e.target.value))}
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </>
                )}

              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg cursor-pointer"
                >
                  {editingPartner ? 'Mettre à jour' : 'Ajouter le Tiers'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
