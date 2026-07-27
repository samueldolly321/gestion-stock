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
  Download,
  Package,
  Tag,
  Plus as PlusIcon
} from 'lucide-react';
import { Supplier, Client, User, Product, SupplierProduct, ClientPrice } from '../types';
import { savePartner, deletePartner } from '../services/partnersService';
import { saveSupplierProduct, updateSupplierProduct, deleteSupplierProduct } from '../services/supplierProductsService';
import { saveClientPrice, updateClientPrice, deleteClientPrice } from '../services/clientPricesService';
import { createProduct } from '../services/productsService';
import { generateId } from '../services/ids';
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
  products: Product[];
  supplierProducts: SupplierProduct[];
  clientPrices: ClientPrice[];
  user: User;
  onRefresh: () => void;
  onRefreshSupplierProducts: () => void;
  onRefreshClientPrices: () => void;
  onRefreshProducts: () => void;
  currencySymbol: string;
  writePerms?: Record<string, string[]> | null;
}

export default function Partners({
  suppliers,
  clients,
  products,
  supplierProducts,
  clientPrices,
  user,
  onRefresh,
  onRefreshSupplierProducts,
  onRefreshClientPrices,
  onRefreshProducts,
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

  // Supplier Products (catalogue d'approvisionnement) Drawer State
  const [activeCatalogSupplier, setActiveCatalogSupplier] = useState<Supplier | null>(null);
  const [newCatProductId, setNewCatProductId] = useState('');
  // Champs de prix : '' = vide (placeholder visible) plutôt que 0.
  const [newCatPrice, setNewCatPrice] = useState<number | ''>('');
  const [newCatRef, setNewCatRef] = useState('');
  // Mode d'ajout : produit déjà existant, ou création d'un nouvel article à la volée.
  const [catalogMode, setCatalogMode] = useState<'existing' | 'new'>('existing');
  const [npName, setNpName] = useState('');
  const [npSku, setNpSku] = useState('');
  const [npSalePrice, setNpSalePrice] = useState<number | ''>('');

  // Supplier Documents Drawer State
  const [activeDocSupplier, setActiveDocSupplier] = useState<Supplier | null>(null);
  const [newDocName, setNewDocName] = useState('');
  const [docsList, setDocsList] = useState<{ name: string; date: string }[]>([
    { name: 'Kbis_TechDistrib_2026.pdf', date: '12/03/2026' },
    { name: 'Contrat_Cadre_Appro.pdf', date: '15/04/2026' }
  ]);

  const canWrite = useMemo(() => hasWritePerm(user.role, 'partners', writePerms), [user.role, writePerms]);

  // Produits déjà catalogués pour le fournisseur dont le panneau est ouvert.
  const catalogItems = useMemo(
    () => (activeCatalogSupplier ? supplierProducts.filter((sp) => sp.supplierId === activeCatalogSupplier.id) : []),
    [activeCatalogSupplier, supplierProducts],
  );

  // Nombre de produits fournis, par fournisseur (badge dans le tableau).
  const catalogCountBySupplier = useMemo(() => {
    const m: Record<string, number> = {};
    supplierProducts.forEach((sp) => { m[sp.supplierId] = (m[sp.supplierId] || 0) + 1; });
    return m;
  }, [supplierProducts]);

  // Produits pas encore associés à ce fournisseur (proposés à l'ajout).
  const productsToAdd = useMemo(() => {
    const linked = new Set(catalogItems.map((sp) => sp.productId));
    return products.filter((p) => !linked.has(p.id));
  }, [catalogItems, products]);

  const openCatalog = (s: Supplier) => {
    setActiveCatalogSupplier(s);
    setNewCatProductId('');
    setNewCatPrice('');
    setNewCatRef('');
    setCatalogMode('existing');
    setNpName('');
    setNpSku('');
    setNpSalePrice('');
  };

  const resetAddForm = () => {
    setNewCatProductId('');
    setNewCatPrice('');
    setNewCatRef('');
    setNpName('');
    setNpSku('');
    setNpSalePrice('');
  };

  // Dispatch selon le mode (produit existant ou nouveau).
  const handleAddCatalogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (catalogMode === 'new') handleAddNewProduct();
    else handleAddExistingProduct();
  };

  // Associe un produit DÉJÀ existant au fournisseur.
  const handleAddExistingProduct = async () => {
    if (!activeCatalogSupplier || !newCatProductId) {
      showAlert('Sélectionnez un produit.', { variant: 'warning' });
      return;
    }
    try {
      await saveSupplierProduct({
        supplierId: activeCatalogSupplier.id,
        productId: newCatProductId,
        purchasePrice: Number(newCatPrice) || 0,
        supplierRef: newCatRef || null,
      });
      resetAddForm();
      onRefreshSupplierProducts();
      showToast('Produit ajouté au catalogue fournisseur.', { title: 'Fournisseurs' });
    } catch (err: any) {
      showAlert(err?.message || 'Ajout refusé (permissions insuffisantes).', { variant: 'error' });
    }
  };

  // Crée un NOUVEL article (pas encore dans Articles & Stocks) puis l'associe au fournisseur.
  const handleAddNewProduct = async () => {
    if (!activeCatalogSupplier || !npName.trim()) {
      showAlert('Indiquez au moins le nom du nouveau produit.', { variant: 'warning' });
      return;
    }
    try {
      // SKU auto si laissé vide (dérivé du nom + suffixe unique).
      const sku = npSku.trim() || `${npName.trim().slice(0, 6).toUpperCase().replace(/\s+/g, '-')}-${generateId()}`;
      const created = await createProduct({
        sku,
        barcode: '',
        name: npName.trim(),
        categoryId: '',
        purchasePrice: Number(newCatPrice) || 0,
        salePrice: Number(npSalePrice) || 0,
        vatRate: 20,
        unit: 'Unités',
        minStock: 5,
        maxStock: 100,
        quantity: 0,
        supplierId: activeCatalogSupplier.id,
        supplierName: activeCatalogSupplier.name,
        status: 'out_of_stock',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await saveSupplierProduct({
        supplierId: activeCatalogSupplier.id,
        productId: created.id,
        purchasePrice: Number(newCatPrice) || 0,
        supplierRef: newCatRef || null,
      });
      resetAddForm();
      setCatalogMode('existing');
      onRefreshProducts();
      onRefreshSupplierProducts();
      showToast(`Produit « ${created.name} » créé et ajouté au catalogue.`, { title: 'Fournisseurs' });
    } catch (err: any) {
      showAlert(err?.message || 'Création refusée (droit d\'écriture « Articles » requis).', { variant: 'error' });
    }
  };

  const handleUpdateCatalogPrice = async (sp: SupplierProduct, price: number) => {
    try {
      await updateSupplierProduct(sp.id, { purchasePrice: Number(price) || 0 });
      onRefreshSupplierProducts();
    } catch (err: any) {
      showAlert(err?.message || 'Mise à jour refusée.', { variant: 'error' });
    }
  };

  const handleRemoveCatalogProduct = async (sp: SupplierProduct) => {
    try {
      await deleteSupplierProduct(sp.id);
      onRefreshSupplierProducts();
      showToast('Produit retiré du catalogue.', { title: 'Fournisseurs', type: 'info' });
    } catch (err: any) {
      showAlert(err?.message || 'Suppression refusée.', { variant: 'error' });
    }
  };

  // Pré-remplit le prix d'achat proposé avec celui de la fiche article sélectionnée.
  const onPickProductToAdd = (pid: string) => {
    setNewCatProductId(pid);
    const prod = products.find((p) => p.id === pid);
    if (prod) setNewCatPrice(prod.purchasePrice || 0);
  };

  // ----- Tarifs de vente par client (prix négociés) -----
  const [activeTariffClient, setActiveTariffClient] = useState<Client | null>(null);
  const [tarProductId, setTarProductId] = useState('');
  const [tarPrice, setTarPrice] = useState<number | ''>('');

  const tariffItems = useMemo(
    () => (activeTariffClient ? clientPrices.filter((cp) => cp.clientId === activeTariffClient.id) : []),
    [activeTariffClient, clientPrices],
  );
  const tariffCountByClient = useMemo(() => {
    const m: Record<string, number> = {};
    clientPrices.forEach((cp) => { m[cp.clientId] = (m[cp.clientId] || 0) + 1; });
    return m;
  }, [clientPrices]);
  const productsToAddTariff = useMemo(() => {
    const linked = new Set(tariffItems.map((cp) => cp.productId));
    return products.filter((p) => !linked.has(p.id));
  }, [tariffItems, products]);

  const openTariffs = (c: Client) => {
    setActiveTariffClient(c);
    setTarProductId('');
    setTarPrice('');
  };
  const onPickTariffProduct = (pid: string) => {
    setTarProductId(pid);
    const prod = products.find((p) => p.id === pid);
    if (prod) setTarPrice(prod.salePrice || 0); // pré-remplit avec le prix de vente par défaut
  };

  const handleAddTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTariffClient || !tarProductId) {
      showAlert('Sélectionnez un produit.', { variant: 'warning' });
      return;
    }
    const prod = products.find((p) => p.id === tarProductId);
    const price = Number(tarPrice) || 0;
    if (prod && price < prod.purchasePrice) {
      showAlert(`Prix de vente (${format(price)}) inférieur au prix d'achat (${format(prod.purchasePrice)}).`, { variant: 'warning' });
      return;
    }
    try {
      await saveClientPrice({ clientId: activeTariffClient.id, productId: tarProductId, salePrice: price });
      setTarProductId('');
      setTarPrice('');
      onRefreshClientPrices();
      showToast('Tarif client enregistré.', { title: 'Clients' });
    } catch (err: any) {
      showAlert(err?.message || 'Enregistrement refusé (permissions insuffisantes).', { variant: 'error' });
    }
  };
  const handleUpdateTariffPrice = async (cp: ClientPrice, price: number) => {
    const p = Number(price) || 0;
    if (cp.purchasePrice != null && p < cp.purchasePrice) {
      showAlert(`Prix de vente (${format(p)}) inférieur au prix d'achat (${format(cp.purchasePrice)}).`, { variant: 'warning' });
      onRefreshClientPrices(); // recharge (annule la saisie invalide)
      return;
    }
    try {
      await updateClientPrice(cp.id, { salePrice: p });
      onRefreshClientPrices();
    } catch (err: any) {
      showAlert(err?.message || 'Mise à jour refusée.', { variant: 'error' });
    }
  };
  const handleRemoveTariff = async (cp: ClientPrice) => {
    try {
      await deleteClientPrice(cp.id);
      onRefreshClientPrices();
      showToast('Tarif retiré (retour au prix par défaut).', { title: 'Clients', type: 'info' });
    } catch (err: any) {
      showAlert(err?.message || 'Suppression refusée.', { variant: 'error' });
    }
  };

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
          <>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400 shrink-0">Interlocuteur</span>
              <span className="text-slate-900 dark:text-slate-200 text-right">{vp.contactPerson || '-'}</span>
            </div>
            <div className="flex justify-between gap-3 items-center">
              <span className="text-slate-400 shrink-0">Produits fournis</span>
              <button
                onClick={() => openCatalog(vp)}
                className="text-cyan-500 font-semibold flex items-center gap-1 hover:underline"
              >
                <Package className="w-3.5 h-3.5" />
                {catalogCountBySupplier[vp.id] || 0} — gérer
              </button>
            </div>
          </>
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
                            onClick={() => openCatalog(p)}
                            className="relative p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-cyan-400 rounded-md transition duration-150"
                            title="Produits fournis (catalogue)"
                          >
                            <Package className="w-3.5 h-3.5" />
                            {catalogCountBySupplier[p.id] > 0 && (
                              <span className="absolute -top-1 -right-1 bg-cyan-500 text-white text-[8px] font-bold rounded-full min-w-[14px] h-[14px] px-0.5 flex items-center justify-center">
                                {catalogCountBySupplier[p.id]}
                              </span>
                            )}
                          </button>
                        )}
                        {partnerType === 'suppliers' && (
                          <button
                            onClick={() => setActiveDocSupplier(p)}
                            className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-cyan-400 rounded-md transition duration-150"
                            title="Gérer les documents"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {partnerType === 'clients' && (
                          <button
                            onClick={() => openTariffs(p)}
                            className="relative p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-cyan-400 rounded-md transition duration-150"
                            title="Tarifs de vente de ce client"
                          >
                            <Tag className="w-3.5 h-3.5" />
                            {tariffCountByClient[p.id] > 0 && (
                              <span className="absolute -top-1 -right-1 bg-cyan-500 text-white text-[8px] font-bold rounded-full min-w-[14px] h-[14px] px-0.5 flex items-center justify-center">
                                {tariffCountByClient[p.id]}
                              </span>
                            )}
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

      {/* CLIENT PRICES (TARIFS) DRAWER MODAL */}
      {activeTariffClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-5 shadow-2xl h-full flex flex-col overflow-y-auto overflow-x-hidden animate-slide-left text-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Tag className="w-5 h-5 text-cyan-400" />
                Tarifs de vente
              </h3>
              <button onClick={() => setActiveTariffClient(null)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">✕</button>
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              Prix de vente négociés pour{' '}
              <strong className="text-slate-900 dark:text-white">{activeTariffClient.name}</strong>.
              Ces prix s'appliquent automatiquement en caisse quand ce client est sélectionné. Sans tarif = prix de vente par défaut de l'article.
            </p>

            {/* Add tariff form */}
            {canWrite && (
              <form onSubmit={handleAddTariff} className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-950/20">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Ajouter un tarif</label>
                <select
                  value={tarProductId}
                  onChange={(e) => onPickTariffProduct(e.target.value)}
                  className="w-full min-w-0 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">— Sélectionner un produit —</option>
                  {productsToAddTariff.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({format(p.salePrice)})</option>
                  ))}
                </select>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">Prix de vente pour ce client ({currencySymbol})</label>
                    <input
                      type="number"
                      min={0}
                      value={tarPrice}
                      onChange={(e) => setTarPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      className="w-full min-w-0 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <button type="submit" className="self-end px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg cursor-pointer flex items-center gap-1">
                    <PlusIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">La vente à perte (prix &lt; prix d'achat) est refusée.</p>
                {productsToAddTariff.length === 0 && (
                  <p className="text-[10px] text-slate-400">Tous les produits ont déjà un tarif pour ce client.</p>
                )}
              </form>
            )}

            {/* Tariff listing */}
            <div className="space-y-2 flex-1">
              <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                Tarifs ({tariffItems.length}) :
              </h4>
              {tariffItems.length === 0 ? (
                <p className="text-slate-500 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Aucun tarif spécifique — ce client paie le prix par défaut.
                </p>
              ) : (
                tariffItems.map((cp) => (
                  <div key={cp.id} className="p-2.5 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-900 dark:text-white block truncate">{cp.productName || cp.productId}</span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {cp.sku} · Défaut {cp.defaultSalePrice != null ? format(cp.defaultSalePrice) : '—'}
                        {cp.purchasePrice != null ? ` · Achat ${format(cp.purchasePrice)}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        key={`${cp.id}-${cp.salePrice}`}
                        type="number"
                        min={0}
                        defaultValue={cp.salePrice}
                        disabled={!canWrite}
                        onBlur={(e) => {
                          const v = Number(e.target.value) || 0;
                          if (v !== cp.salePrice) handleUpdateTariffPrice(cp, v);
                        }}
                        title="Prix de vente pour ce client (modifiable). Vente à perte refusée."
                        className="w-24 bg-white dark:bg-slate-950/40 p-1.5 text-[11px] text-right font-mono rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                      />
                      {canWrite && (
                        <button onClick={() => handleRemoveTariff(cp)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-md transition" title="Retirer ce tarif">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button onClick={() => setActiveTariffClient(null)} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-bold rounded-lg cursor-pointer">
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* SUPPLIER PRODUCTS (CATALOGUE) DRAWER MODAL */}
      {activeCatalogSupplier && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-5 shadow-2xl h-full flex flex-col overflow-y-auto overflow-x-hidden animate-slide-left text-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Package className="w-5 h-5 text-cyan-400" />
                Produits fournis
              </h3>
              <button
                onClick={() => setActiveCatalogSupplier(null)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              Produits fournis par{' '}
              <strong className="text-slate-900 dark:text-white">{activeCatalogSupplier.companyName || activeCatalogSupplier.name}</strong>{' '}
              et leur prix d'achat. Ces articles sont pré-remplis automatiquement lors d'une commande d'achat.
            </p>

            {/* Add product form */}
            {canWrite && (
              <form onSubmit={handleAddCatalogSubmit} className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-950/20">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Ajouter un produit</label>

                {/* Sélecteur de mode : produit existant vs nouveau produit */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCatalogMode('existing')}
                    className={`py-1.5 rounded-lg text-[11px] font-bold transition ${
                      catalogMode === 'existing'
                        ? 'bg-cyan-500/15 text-cyan-500 border border-cyan-500/30'
                        : 'bg-white dark:bg-slate-950/20 text-slate-500 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    Produit existant
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogMode('new')}
                    className={`py-1.5 rounded-lg text-[11px] font-bold transition ${
                      catalogMode === 'new'
                        ? 'bg-cyan-500/15 text-cyan-500 border border-cyan-500/30'
                        : 'bg-white dark:bg-slate-950/20 text-slate-500 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    Nouveau produit
                  </button>
                </div>

                {catalogMode === 'existing' ? (
                  <select
                    value={newCatProductId}
                    onChange={(e) => onPickProductToAdd(e.target.value)}
                    className="w-full min-w-0 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">— Sélectionner un produit —</option>
                    {productsToAdd.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <div>
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">Nom de l'article *</label>
                      <input
                        type="text"
                        value={npName}
                        onChange={(e) => setNpName(e.target.value)}
                        placeholder="Ex. Ciment 50 kg"
                        className="w-full min-w-0 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">SKU / référence</label>
                        <input
                          type="text"
                          value={npSku}
                          onChange={(e) => setNpSku(e.target.value)}
                          placeholder="Auto si vide"
                          title="Code interne unique de l'article (généré automatiquement si laissé vide)"
                          className="w-full min-w-0 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">Prix de vente ({currencySymbol})</label>
                        <input
                          type="number"
                          min={0}
                          value={npSalePrice}
                          onChange={(e) => setNpSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="0"
                          title="Prix auquel vous revendez l'article (caisse POS)"
                          className="w-full min-w-0 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">Le produit est créé dans Articles &amp; Stocks (quantité 0), rattaché à ce fournisseur.</p>
                  </>
                )}

                {/* Prix d'achat + réf. fournisseur */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">Prix d'achat ({currencySymbol})</label>
                    <input
                      type="number"
                      min={0}
                      value={newCatPrice}
                      onChange={(e) => setNewCatPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      title="Prix auquel ce fournisseur vous vend l'article"
                      className="w-full min-w-0 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">Réf. fournisseur (opt.)</label>
                    <input
                      type="text"
                      value={newCatRef}
                      onChange={(e) => setNewCatRef(e.target.value)}
                      placeholder="Code chez le fourn."
                      title="Référence de l'article chez le fournisseur (facultatif)"
                      className="w-full min-w-0 bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  {catalogMode === 'new' ? 'Créer et ajouter' : 'Ajouter au catalogue'}
                </button>

                {catalogMode === 'existing' && productsToAdd.length === 0 && (
                  <p className="text-[10px] text-slate-400">
                    Tous les produits sont déjà catalogués. Bascule sur « Nouveau produit » pour en créer un.
                  </p>
                )}
              </form>
            )}

            {/* Catalogue listing */}
            <div className="space-y-2 flex-1">
              <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                Catalogue ({catalogItems.length}) :
              </h4>
              {catalogItems.length === 0 ? (
                <p className="text-slate-500 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Aucun produit associé pour l'instant.
                </p>
              ) : (
                catalogItems.map((sp) => (
                  <div
                    key={sp.id}
                    className="p-2.5 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-900 dark:text-white block truncate">{sp.productName || sp.productId}</span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {sp.sku}{sp.supplierRef ? ` · réf. ${sp.supplierRef}` : ''} · Vente {sp.salePrice != null ? format(sp.salePrice) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          defaultValue={sp.purchasePrice}
                          disabled={!canWrite}
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (v !== sp.purchasePrice) handleUpdateCatalogPrice(sp, v);
                          }}
                          title="Prix d'achat (modifiable) — Entrée ou clic ailleurs pour enregistrer"
                          className="w-24 bg-white dark:bg-slate-950/40 p-1.5 text-[11px] text-right font-mono rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                        />
                      </div>
                      {canWrite && (
                        <button
                          onClick={() => handleRemoveCatalogProduct(sp)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-md transition"
                          title="Retirer du catalogue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setActiveCatalogSupplier(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-bold rounded-lg cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

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
