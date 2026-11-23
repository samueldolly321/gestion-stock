import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  QrCode,
  Layers,
  Archive,
  Eye,
  Settings,
  MoreVertical,
  CheckCircle,
  HelpCircle,
  TrendingDown,
  Warehouse,
  Barcode,
  Image as ImageIcon,
  X,
  FolderTree,
  Download,
  Printer,
  ShoppingBag,
  Shirt,
  ShieldCheck,
  ChefHat
} from 'lucide-react';
import DishForm, { usedInDishes, DishLossModal } from './DishForm';
import TopScroll from './TopScroll';
import KitchenReports from './KitchenReports';
import { dishMargin, isDish, portionsPossible, recipeCost } from '../services/recipes';
import { Product, Category, Brand, Supplier, User, Warehouse as WarehouseType, StockMovement, ProductStock } from '../types';
import { generateId } from '../services/ids';
import { useMoney } from '../services/CurrencyContext';
import { createCategory, deleteCategory } from '../services/categoriesService';
import { createProduct, updateProduct, deleteProduct } from '../services/productsService';
import { createMovement, listMovements } from '../services/movementsService';
import { createPurchase, receivePurchase } from '../services/purchasesService';
import { createBrand, deleteBrand, createWarehouse, deleteWarehouse } from '../services/catalogService';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import Pagination, { usePagination } from './Pagination';
import { canWrite as hasWritePerm } from '../services/permissions';
import { hasPack, packBreakdown, fmtQty, parseDecimal } from '../services/pack';
import BarcodeSVG from './Barcode';
import { generateEan13 } from '../services/barcode';
import { getExportCompany } from '../services/exportContext';
import { VariantModelModal, VariantGrid, VariantLabels, type VariantModalMode } from './VariantsUI';
import { variantLabel, compareSizes } from '../services/variants';
import { featuresFor, sizePresetsFor, productDefaultsFor } from '../services/sectors';
import { SerialPanel, SerialLookupModal } from './SerialsUI';

// Colonne « Actions » collée à droite du tableau : modifier / supprimer restent visibles
// sans faire défiler horizontalement (fond opaque pour masquer les colonnes qui passent dessous).
const STICKY_ACTIONS_TH = 'py-3 px-4 text-right sticky right-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.25)]';
const STICKY_ACTIONS_TD = 'py-3.5 px-4 text-right sticky right-0 z-10 bg-white dark:bg-slate-900 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.25)]';

// Unités de mesure proposées dans le formulaire produit (+ « Autre… » pour saisie libre).
// Unité de BASE (le détail) dans laquelle le stock est compté. Le regroupement « Carton / Pack »
// est géré par la section Conditionnement — d'où l'absence de « Cartons/Packs » ici (évite la confusion).
const UNIT_OPTIONS = ['Pièces', 'Unités', 'Paires', 'Litre', 'cl', 'Kg', 'g', 'mg', 'Mètres', 'm²', 'Bouteilles', 'Pots', 'Sacs', 'Portions'];

interface ProductsProps {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  warehouses: WarehouseType[];
  productStock: ProductStock[];
  user: User;
  onRefresh: () => void;
  onRefreshPurchases?: () => void; // recharge aussi les achats (après « Créer un achat »)
  currencySymbol: string;
  initialStatus?: string; // filtre de statut appliqué à l'arrivée (depuis le Dashboard)
  writePerms?: Record<string, string[]> | null;
  sectors?: string[] | null; // secteurs d'activité → fonctions affichées
  defaultVatRate?: number; // TVA par défaut des nouveaux articles (Paramètres)
}

// Libellés d'affichage des mouvements de stock (historique par article).
const MOVE_META: Record<string, { label: string; sign: string; cls: string }> = {
  entry_reception: { label: 'Entrée / Réception', sign: '+', cls: 'text-emerald-500' },
  entry_return: { label: 'Retour (avoir)', sign: '+', cls: 'text-emerald-500' },
  exit_sale: { label: 'Sortie / Vente', sign: '−', cls: 'text-red-500' },
  waste_loss: { label: 'Perte / Casse', sign: '−', cls: 'text-red-500' },
  transfer: { label: 'Transfert', sign: '', cls: 'text-slate-400' },
  adjustment: { label: 'Ajustement', sign: '', cls: 'text-amber-500' },
};

// Beautiful image presets to select for products
const PRODUCT_IMAGES = [
  'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?w=150&auto=format&fit=crop&q=60', // laptop
  'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=150&auto=format&fit=crop&q=60', // smartwatch
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=150&auto=format&fit=crop&q=60', // headphones
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=150&auto=format&fit=crop&q=60', // white bottle
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=150&auto=format&fit=crop&q=60', // glasses
  'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=150&auto=format&fit=crop&q=60', // shoe
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=150&auto=format&fit=crop&q=60', // polaroid camera
];

export default function Products({
  products,
  categories,
  brands,
  suppliers,
  warehouses,
  productStock,
  user,
  onRefresh,
  onRefreshPurchases,
  currencySymbol,
  initialStatus,
  writePerms,
  sectors,
  defaultVatRate = 20
}: ProductsProps) {
  const features = useMemo(() => featuresFor(sectors), [sectors]);
  // Formatage monétaire (Ariary base / Euro converti)
  const { format } = useMoney();

  // Répartition du stock par entrepôt (pour la colonne « Entrepôt(s) » du tableau).
  const stockByProduct = useMemo(() => {
    const m = new Map<string, { name: string; qty: number }[]>();
    for (const s of productStock) {
      const qty = Number(s.quantity) || 0;
      if (qty <= 0) continue;
      const name = warehouses.find((w) => w.id === s.warehouseId)?.name || 'Entrepôt';
      const arr = m.get(s.productId) || [];
      arr.push({ name, qty });
      m.set(s.productId, arr);
    }
    return m;
  }, [productStock, warehouses]);

  // Restauration : accès rapide aux ingrédients (coût de revient, portions possibles des plats).
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus || 'all');

  // Applique le filtre reçu du Dashboard (ex. clic sur « Ruptures » / « Périmés »).
  React.useEffect(() => {
    if (initialStatus) setSelectedStatus(initialStatus);
    // Restauration : une alerte de stock concerne les ingrédients, pas les plats.
    if (initialStatus && initialStatus !== 'all') setKindTab('stock');
  }, [initialStatus]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');

  // Form Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [vatRate, setVatRate] = useState(defaultVatRate);
  const [unit, setUnit] = useState('Pièces');
  // Conditionnement (vente en gros) : 1 carton = packSize pièces.
  const [packSize, setPackSize] = useState<number | string>(1); // texte pendant la saisie (« 12,5 »)
  const [packLabel, setPackLabel] = useState('Carton');
  const [packPurchasePrice, setPackPurchasePrice] = useState<number | ''>('');
  const [packSalePrice, setPackSalePrice] = useState<number | ''>('');
  const [minStock, setMinStock] = useState(5);
  const [maxStock, setMaxStock] = useState(100);
  const [image, setImage] = useState(PRODUCT_IMAGES[0]);
  const [expirationDate, setExpirationDate] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [initialQuantity, setInitialQuantity] = useState(0);

  // Barcode scanner simulator state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [simulatedCode, setSimulatedCode] = useState('');

  // Active product detail sidebar
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  // Historique des mouvements de l'article affiché (fiche détail).
  const [historyMoves, setHistoryMoves] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyKey, setHistoryKey] = useState(0); // bump pour recharger l'historique après un mouvement
  React.useEffect(() => {
    if (!viewProduct) { setHistoryMoves([]); return; }
    let cancelled = false;
    setHistoryLoading(true);
    listMovements()
      .then((all) => { if (!cancelled) setHistoryMoves(all.filter((m) => m.productId === viewProduct.id)); })
      .catch(() => { if (!cancelled) setHistoryMoves([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [viewProduct, historyKey]);
  const [labelProduct, setLabelProduct] = useState<Product | null>(null); // étiquette code-barres à imprimer
  const [variantModal, setVariantModal] = useState<VariantModalMode | null>(null); // modèle taille × couleur
  const [labelsGroup, setLabelsGroup] = useState<string | null>(null); // étiquettes de toutes les variantes
  const [trackSerial, setTrackSerial] = useState(false); // suivi par numéro de série / IMEI
  const [warrantyMonths, setWarrantyMonths] = useState<number>(0); // garantie client (mois)
  const [lookupOpen, setLookupOpen] = useState(false); // recherche « numéro de série / garantie »
  const [dishForm, setDishForm] = useState<{ dish: Product | null } | null>(null); // restauration : plat + recette
  const [dishLoss, setDishLoss] = useState<Product | null>(null); // restauration : perte d'un plat
  // Restauration : onglet affiché (plats ou ingrédients). Arrivée depuis une alerte de stock → ingrédients.
  const [kindTab, setKindTab] = useState<'dish' | 'stock' | 'reports'>(initialStatus && initialStatus !== 'all' ? 'stock' : 'dish');

  // Quick Adjustment State
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustReason, setAdjustReason] = useState('Ajustement manuel inventaire');
  const [adjustType, setAdjustType] = useState<'entry_reception' | 'exit_sale'>('entry_reception');
  const [purchaseBusy, setPurchaseBusy] = useState(false);

  // Gestion des catégories / sous-catégories
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatParentId, setNewCatParentId] = useState<string>(''); // '' = catégorie principale
  const [catBusy, setCatBusy] = useState(false);

  // Sous-catégorie sélectionnée dans le formulaire produit
  const [subCategoryId, setSubCategoryId] = useState('');

  // Gestion des marques
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [brandBusy, setBrandBusy] = useState(false);

  // Gestion des entrepôts
  const [isWhModalOpen, setIsWhModalOpen] = useState(false);
  const [newWhName, setNewWhName] = useState('');
  const [newWhLocation, setNewWhLocation] = useState('');
  const [newWhCode, setNewWhCode] = useState('');
  const [newWhCapacity, setNewWhCapacity] = useState(0);
  const [whBusy, setWhBusy] = useState(false);

  // Dérivés : catégories principales et sous-catégories d'un parent
  const topCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories]);
  const subCategoriesOf = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  // Permissions check
  const canWrite = useMemo(() => hasWritePerm(user.role, 'products', writePerms), [user.role, writePerms]);

  // Ouvre la gestion des catégories ; `parentId` présélectionne la catégorie parente
  // (ajout direct d'une sous-catégorie).
  const openCategoryManager = (parentId?: string) => {
    setNewCatParentId(parentId || '');
    setNewCatName('');
    setIsCatModalOpen(true);
  };

  // Handle open modal for create
  const openCreateModal = () => {
    setEditingProduct(null);
    setName('');
    setSku('SKU-' + generateId().slice(0, 6));
    setBarcode(generateEan13(products.map((p) => p.barcode)));
    setDescription('');
    setCategoryId(topCategories[0]?.id || '');
    setSubCategoryId('');
    setBrandId(brands[0]?.id || '');
    setPurchasePrice(0);
    setSalePrice(0);
    setVatRate(defaultVatRate);
    const defaults = productDefaultsFor(sectors); // ex. poissonnerie : Kg + Caisse
    setTrackSerial(features.serials); // high-tech : suivi par IMEI proposé d'office
    setWarrantyMonths(features.serials ? 12 : 0);
    setUnit(defaults.unit);
    setPackSize(1);
    setPackLabel(defaults.packLabel);
    setPackPurchasePrice('');
    setPackSalePrice('');
    setMinStock(5);
    setMaxStock(100);
    setImage(PRODUCT_IMAGES[Math.floor(Math.random() * PRODUCT_IMAGES.length)]);
    setExpirationDate('');
    setLotNumber('');
    setSupplierId(''); // le fournisseur est choisi explicitement dans le formulaire
    setLocationId(warehouses[0]?.id || '');
    setInitialQuantity(0);
    setIsModalOpen(true);
  };

  // Handle open modal for edit
  const openEditModal = (p: Product) => {
    // Un plat se modifie dans sa propre fenêtre (recette, coût, marge).
    if (isDish(p)) { setDishForm({ dish: p }); return; }
    setEditingProduct(p);
    setName(p.name);
    setSku(p.sku);
    setBarcode(p.barcode || ''); // article sans code-barres (import, API) : évite l'écran blanc
    setDescription(p.description || '');
    setCategoryId(p.categoryId || '');
    setSubCategoryId(p.subCategoryId || '');
    setBrandId(p.brandId || '');
    setPurchasePrice(p.purchasePrice);
    setSalePrice(p.salePrice);
    setVatRate(p.vatRate);
    setUnit(p.unit);
    setPackSize(p.packSize && p.packSize > 1 ? p.packSize : 1);
    setPackLabel(p.packLabel || 'Carton');
    setPackPurchasePrice(p.packPurchasePrice ?? '');
    setPackSalePrice(p.packSalePrice ?? '');
    setMinStock(p.minStock);
    setMaxStock(p.maxStock);
    setImage(p.image || PRODUCT_IMAGES[0]);
    setExpirationDate(p.expirationDate || '');
    setLotNumber(p.lotNumber || '');
    setTrackSerial(!!p.trackSerial);
    setWarrantyMonths(Number(p.warrantyMonths) || 0);
    setSupplierId(p.supplierId || '');
    setLocationId(p.locationId || '');
    setInitialQuantity(p.quantity);
    setIsModalOpen(true);
  };

  // Create or Update submit
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !sku || purchasePrice <= 0) {
      showAlert('Veuillez remplir tous les champs requis correctement.', { variant: 'warning' });
      return;
    }

    const catObj = categories.find((c) => c.id === categoryId);
    const subCatObj = categories.find((c) => c.id === subCategoryId);
    const supObj = suppliers.find((s) => s.id === supplierId);
    const brandObj = brands.find((b) => b.id === brandId);

    const calculatedStatus =
      initialQuantity === 0 ? 'out_of_stock' : initialQuantity <= minStock ? 'low_stock' : 'in_stock';

    const prodData: Omit<Product, 'id'> = {
      sku,
      barcode,
      qrCode: barcode ? `${sku}-QR` : '',
      name,
      description,
      categoryId,
      categoryName: catObj?.name || '',
      subCategoryId: subCategoryId || null,
      subCategoryName: subCatObj?.name || '',
      brandId,
      brandName: brandObj?.name || '',
      purchasePrice: Number(purchasePrice),
      salePrice: Number(salePrice),
      vatRate: Number(vatRate),
      unit,
      packSize: Math.max(1, Math.round((parseDecimal(packSize) || 1) * 1000) / 1000),
      packLabel: (parseDecimal(packSize) || 1) > 1 ? (packLabel.trim() || 'Carton') : null,
      packPurchasePrice: packPurchasePrice === '' ? null : Number(packPurchasePrice),
      packSalePrice: packSalePrice === '' ? null : Number(packSalePrice),
      minStock: Number(minStock),
      maxStock: Number(maxStock),
      image,
      expirationDate: expirationDate || null,
      lotNumber,
      supplierId,
      supplierName: supObj?.name || '',
      locationId,
      quantity: trackSerial ? 0 : Number(initialQuantity),
      trackSerial,
      warrantyMonths: Number(warrantyMonths) || 0,
      status: calculatedStatus,
      createdAt: editingProduct ? editingProduct.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingProduct) {
        // En édition, on conserve la quantité gérée par les mouvements de stock.
        await updateProduct(editingProduct.id, { ...prodData, quantity: editingProduct.quantity });
      } else {
        const result = await createProduct({ ...prodData, quantity: 0 });
        // Crée le mouvement d'entrée initiale (qui fixe la quantité) si > 0
        if (!trackSerial && Number(initialQuantity) > 0) { // suivi par IMEI : le stock entre avec les numéros
          await createMovement({
            type: 'entry_reception',
            productId: result.id,
            productName: result.name,
            sku: result.sku,
            warehouseId: locationId,
            quantity: Number(initialQuantity),
            reason: 'Quantité d\'entrée initiale',
            costPrice: Number(purchasePrice),
            costTotal: Number(purchasePrice) * Number(initialQuantity),
            referenceId: 'INITIAL',
          });
        }
      }
      setIsModalOpen(false);
      onRefresh();
      showToast(editingProduct ? `Produit « ${name} » modifié.` : `Produit « ${name} » créé.`, { title: 'Articles' });
    } catch (err: any) {
      console.error(err);
      showAlert(err?.message || 'Erreur d\'enregistrement du produit.', { variant: 'error' });
    }
  };

  // Delete product
  const handleDeleteProduct = async (p: Product) => {
    if (await showConfirm(`Êtes-vous sûr de vouloir supprimer le produit : ${p.name} ?`, { title: 'Supprimer le produit', confirmText: 'Supprimer' })) {
      try {
        await deleteProduct(p.id);
        onRefresh();
        showToast(`Produit « ${p.name} » supprimé.`, { title: 'Articles', type: 'info' });
      } catch (err: any) {
        showAlert(err?.message || 'Action refusée (rôles ou permissions insuffisantes).', { variant: 'error' });
      }
    }
  };

  // Barcode Scanner Simulator Submit
  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedCode) return;
    setSearchTerm(simulatedCode);
    setIsScannerOpen(false);
    setSimulatedCode('');
  };

  // Import d'une image depuis un fichier local → stockée en Data URL (base64).
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAlert('Veuillez sélectionner un fichier image (JPG, PNG, WEBP ou GIF).', { variant: 'warning' });
      e.target.value = '';
      return;
    }
    const MAX = 2 * 1024 * 1024; // 2 Mo
    if (file.size > MAX) {
      const sizeMo = (file.size / (1024 * 1024)).toFixed(1);
      showAlert(`Image trop volumineuse (${sizeMo} Mo) — 2 Mo maximum. Réduisez ou compressez l'image.`, { variant: 'warning' });
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = ''; // permet de ré-importer le même fichier
  };

  // Quick Adjustment Submit
  const handleQuickAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;

    try {
      await createMovement({
        type: adjustType,
        productId: adjustingProduct.id,
        productName: adjustingProduct.name,
        sku: adjustingProduct.sku,
        warehouseId: adjustingProduct.locationId || warehouses[0]?.id || '',
        quantity: Number(adjustQty),
        reason: adjustReason,
        costPrice: adjustingProduct.purchasePrice,
        costTotal: adjustingProduct.purchasePrice * Number(adjustQty),
      });
      setAdjustingProduct(null);
      setHistoryKey((k) => k + 1);
      onRefresh();
      showToast('Stock ajusté.', { title: 'Mouvements' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur de modification du stock.', { variant: 'error' });
    }
  };

  // Transforme l'entrée en véritable ACHAT : crée une commande fournisseur puis la réceptionne.
  // → le stock monte ET la dépense / la dette fournisseur sont enregistrées (contrairement au
  //   simple mouvement d'ajustement). Alternative au bouton « Confirmer le Mouvement ».
  const handleCreatePurchaseFromEntry = async () => {
    const p = adjustingProduct;
    if (!p) return;
    if (!p.supplierId) {
      showAlert(
        "Ce produit n'a pas de fournisseur. Renseignez-le dans la fiche article (champ Fournisseur), ou créez la commande depuis l'onglet Achats.",
        { variant: 'warning' },
      );
      return;
    }
    const qty = Math.max(0, Math.round((Number(adjustQty) || 0) * 1000) / 1000);
    const ok = await showConfirm(
      `Créer un achat de ${qty} ${p.unit} « ${p.name} » chez ${p.supplierName || 'ce fournisseur'} au prix d'achat de ${format(p.purchasePrice)} l'unité, puis le réceptionner en stock ?\n\nLe stock augmentera et la dépense (dette fournisseur) sera enregistrée.`,
      { title: 'Créer un achat', variant: 'info', confirmText: 'Créer et réceptionner' },
    );
    if (!ok) return;
    setPurchaseBusy(true);
    try {
      const created = await createPurchase({
        supplierId: p.supplierId,
        supplierName: p.supplierName,
        items: [{
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          quantity: qty,
          unitCost: p.purchasePrice,
          tax: 0,
          total: qty * p.purchasePrice,
        }],
        notes: adjustReason && adjustReason !== 'Ajustement manuel inventaire' ? adjustReason : 'Réapprovisionnement (depuis Articles)',
      });
      await receivePurchase(created.id); // réception → +stock, PMP, dette fournisseur
      setAdjustingProduct(null);
      setHistoryKey((k) => k + 1);
      onRefresh();
      onRefreshPurchases?.(); // rafraîchit la liste des achats (sinon visible seulement après reload)
      showToast(`Achat créé et réceptionné : +${qty} ${p.unit}. Dépense enregistrée.`, { title: 'Achats' });
    } catch (err: any) {
      showAlert(err?.message || "Erreur lors de la création de l'achat.", { variant: 'error' });
    } finally {
      setPurchaseBusy(false);
    }
  };

  // Création d'une catégorie ou sous-catégorie (API PostgreSQL)
  const handleAddCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setCatBusy(true);
    try {
      await createCategory({
        name: newCatName.trim(),
        parentId: newCatParentId || null,
      });
      setNewCatName('');
      // On garde le parent sélectionné pour enchaîner l'ajout de plusieurs sous-catégories.
      onRefresh();
      showToast(newCatParentId ? 'Sous-catégorie créée.' : 'Catégorie créée.', { title: 'Catégories' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la création de la catégorie.', { variant: 'error' });
    } finally {
      setCatBusy(false);
    }
  };

  // Suppression d'une catégorie / sous-catégorie
  const handleDeleteCat = async (id: string, label: string) => {
    if (!(await showConfirm(`Supprimer « ${label} » ?`, { title: 'Supprimer la catégorie', confirmText: 'Supprimer' }))) return;
    try {
      await deleteCategory(id);
      onRefresh();
      showToast(`« ${label} » supprimée.`, { title: 'Catégories', type: 'info' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la suppression.', { variant: 'error' });
    }
  };

  // Marques
  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) return;
    setBrandBusy(true);
    try {
      await createBrand({ name: newBrandName.trim() });
      setNewBrandName('');
      onRefresh();
      showToast('Marque créée.', { title: 'Catalogue' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la création de la marque.', { variant: 'error' });
    } finally {
      setBrandBusy(false);
    }
  };
  const handleDeleteBrand = async (id: string, label: string) => {
    if (!(await showConfirm(`Supprimer la marque « ${label} » ?`, { title: 'Supprimer la marque', confirmText: 'Supprimer' }))) return;
    try {
      await deleteBrand(id);
      onRefresh();
      showToast(`Marque « ${label} » supprimée.`, { title: 'Catalogue', type: 'info' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la suppression.', { variant: 'error' });
    }
  };

  // Entrepôts
  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhName.trim()) return;
    setWhBusy(true);
    try {
      await createWarehouse({
        name: newWhName.trim(),
        location: newWhLocation.trim() || undefined,
        code: newWhCode.trim() || undefined,
        capacity: Number(newWhCapacity) || 0,
      });
      setNewWhName('');
      setNewWhLocation('');
      setNewWhCode('');
      setNewWhCapacity(0);
      onRefresh();
      showToast('Entrepôt créé.', { title: 'Catalogue' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la création de l\'entrepôt.', { variant: 'error' });
    } finally {
      setWhBusy(false);
    }
  };
  const handleDeleteWarehouse = async (id: string, label: string) => {
    if (!(await showConfirm(`Supprimer l'entrepôt « ${label} » ?`, { title: 'Supprimer l\'entrepôt', confirmText: 'Supprimer' }))) return;
    try {
      await deleteWarehouse(id);
      onRefresh();
      showToast(`Entrepôt « ${label} » supprimé.`, { title: 'Catalogue', type: 'info' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la suppression.', { variant: 'error' });
    }
  };

  // Restauration : deux tableaux séparés — plats (recettes) et ingrédients & articles stockés.
  const showKindTabs = features.recipes || products.some(isDish);
  const dishCount = useMemo(() => products.filter(isDish).length, [products]);
  const dishMode = showKindTabs && kindTab === 'dish';
  // Nombre de plats qui utilisent chaque ingrédient.
  const dishUsage = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of products) if (isDish(d)) for (const l of d.recipe || []) m.set(l.ingredientId, (m.get(l.ingredientId) || 0) + 1);
    return m;
  }, [products]);

  // Filtered products list — toujours les plus récents en premier.
  const filteredProducts = useMemo(() => {
    const list = products.filter((p) => {
      if (showKindTabs && (kindTab === 'dish') !== isDish(p)) return false;
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.barcode || '').includes(searchTerm);

      const matchCat = selectedCategory === 'all' || p.categoryId === selectedCategory || p.subCategoryId === selectedCategory;
      // Entrepôt et statut de stock ne concernent pas les plats (pas de stock propre).
      if (isDish(p)) return matchSearch && matchCat;
      const matchWarehouse = selectedWarehouse === 'all' || p.locationId === selectedWarehouse;

      let matchStatus = true;
      if (selectedStatus === 'low_stock') matchStatus = p.status === 'low_stock';
      else if (selectedStatus === 'out_of_stock') matchStatus = p.status === 'out_of_stock';
      else if (selectedStatus === 'in_stock') matchStatus = p.status === 'in_stock';
      else if (selectedStatus === 'expired') matchStatus = p.status === 'expired';

      return matchSearch && matchCat && matchWarehouse && matchStatus;
    });
    // Plus récents d'abord ; les variantes d'un même modèle restent groupées (date de la plus
    // récente du modèle), triées par taille (XS < S < M… / 36 < 40) puis par couleur.
    const groupDate = new Map<string, string>();
    for (const p of list) {
      if (p.variantGroup && (p.createdAt || '') > (groupDate.get(p.variantGroup) || '')) groupDate.set(p.variantGroup, p.createdAt || '');
    }
    const dateOf = (p: Product) => (p.variantGroup ? groupDate.get(p.variantGroup) : p.createdAt) || '';
    return list.sort((a, b) =>
      dateOf(b).localeCompare(dateOf(a)) ||
      (a.variantGroup || a.id).localeCompare(b.variantGroup || b.id) ||
      compareSizes(a.variantSize || '', b.variantSize || '') ||
      (a.variantColor || '').localeCompare(b.variantColor || '', 'fr'),
    );
  }, [products, searchTerm, selectedCategory, selectedWarehouse, selectedStatus, showKindTabs, kindTab]);

  const productsPage = usePagination<Product>(filteredProducts);

  // Tableau des plats (restauration) : coût, marge, coût matière, portions possibles.
  const renderDishTable = () => (
    <table className="w-full text-left border-collapse" data-testid="dish-table">
      <thead>
        <tr className="bg-slate-50 dark:bg-slate-950/15 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
          <th className="py-3 px-4">Plat</th>
          <th className="py-3 px-4">Catégorie</th>
          <th className="py-3 px-4 text-right" title="Coût des ingrédients pour 1 portion (prix d'achat actuels)">Coût de revient</th>
          <th className="py-3 px-4 text-right">Prix de vente</th>
          <th className="py-3 px-4 text-right">Marge</th>
          <th className="py-3 px-4 text-right" title="Part du coût des ingrédients dans le prix de vente — on vise souvent 25 à 35 %">Coût matière</th>
          <th className="py-3 px-4 text-center" title="Portions réalisables avec le stock actuel des ingrédients">Portions possibles</th>
          <th className={STICKY_ACTIONS_TH}>Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40 text-xs">
        {filteredProducts.length === 0 ? (
          <tr>
            <td colSpan={8} className="py-12 text-center text-slate-500">
              {dishCount === 0 ? (
                <>Aucun plat pour l'instant.{canWrite && <> <button onClick={() => setDishForm({ dish: null })} className="text-cyan-500 hover:underline">Créer votre premier plat</button></>}</>
              ) : 'Aucun plat ne correspond aux filtres appliqués.'}
            </td>
          </tr>
        ) : productsPage.paged.map((p) => {
          const cost = recipeCost(p.recipe, productsById);
          const { margin, costRatio } = dishMargin(p.salePrice, cost);
          const portions = portionsPossible(p.recipe, (id) => productsById.get(id)?.quantity || 0);
          const nIng = (p.recipe || []).length;
          return (
            <React.Fragment key={p.id}>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition duration-150 cursor-pointer" onClick={() => setViewProduct(p)}>
                <td className="py-3.5 px-4 flex items-center gap-3">
                  <img src={p.image || PRODUCT_IMAGES[0]} alt={p.name} className="w-9 h-9 rounded-lg object-cover bg-slate-800/20 shrink-0" referrerPolicy="no-referrer" />
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-900 dark:text-white block truncate">{p.name}</span>
                    <span
                      className="text-[10px] text-slate-400 block cursor-help"
                      title={nIng ? 'Recette pour 1 portion :\n' + (p.recipe || []).map((l) => {
                        const ing = productsById.get(l.ingredientId);
                        return `• ${ing?.name || 'Ingrédient supprimé'} : ${fmtQty(l.quantity)} ${ing?.unit || ''}`;
                      }).join('\n') : 'Pas encore de recette'}
                    >
                      {nIng ? `${nIng} ingrédient${nIng > 1 ? 's' : ''}` : 'sans recette'} · <span className="font-mono">{p.sku}</span>
                    </span>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                  {p.categoryName || '—'}
                  {p.subCategoryName && <span className="block text-[10px] text-slate-400">{p.subCategoryName}</span>}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-900 dark:text-gray-300">{format(cost)}</td>
                <td className="py-3.5 px-4 text-right font-mono font-medium text-cyan-400">{format(p.salePrice)}</td>
                <td className={`py-3.5 px-4 text-right font-mono ${margin < 0 ? 'text-red-500' : 'text-emerald-500'}`}>{format(margin)}</td>
                <td className={`py-3.5 px-4 text-right font-mono ${costRatio == null ? 'text-slate-400' : costRatio > 60 ? 'text-red-500' : costRatio > 40 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {costRatio == null ? '—' : `${String(costRatio).replace('.', ',')} %`}
                </td>
                <td className="py-3.5 px-4 text-center font-mono font-semibold">
                  {portions == null ? <span className="text-slate-400 font-sans font-normal">—</span>
                    : <span className={portions === 0 ? 'text-red-500' : portions < 5 ? 'text-amber-500' : 'text-slate-900 dark:text-emerald-400'}>{portions}</span>}
                </td>
                <td className={STICKY_ACTIONS_TD}>
                  <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {canWrite && (
                      <>
                        <button
                          onClick={() => setDishLoss(p)}
                          disabled={!(p.recipe || []).length}
                          className="p-1.5 bg-slate-100 hover:bg-amber-500/10 text-slate-500 hover:text-amber-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition duration-150 disabled:opacity-40"
                          title={(p.recipe || []).length ? 'Déclarer une perte (plat raté, invendu jeté…) : retire ses ingrédients du stock' : 'Pas de recette : aucun ingrédient à retirer'}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEditModal(p)} className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-cyan-400 rounded-md transition duration-150" title="Modifier le plat et sa recette">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteProduct(p)} className="p-1.5 bg-slate-100 hover:bg-red-500/10 text-slate-500 hover:text-red-500 dark:bg-slate-800/60 dark:text-slate-400 rounded-md transition duration-150" title="Supprimer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              {viewProduct?.id === p.id && (
                <tr className="xl:hidden">
                  <td colSpan={8} className="p-3 bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60">{renderFiche(p)}</td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );

  const handleExport = (fmt: 'pdf' | 'excel') => {
    const columns = [
      { label: 'SKU', value: (p: Product) => p.sku },
      { label: 'Nom', value: (p: Product) => p.name },
      { label: 'Catégorie', value: (p: Product) => p.categoryName },
      { label: 'Sous-catégorie', value: (p: Product) => p.subCategoryName || '' },
      { label: 'Marque', value: (p: Product) => p.brandName || '' },
      { label: 'Fournisseur', value: (p: Product) => p.supplierName || '' },
      { label: 'Prix achat', value: (p: Product) => p.purchasePrice },
      { label: 'Prix vente', value: (p: Product) => p.salePrice },
      { label: 'Quantité', value: (p: Product) => p.quantity },
      { label: 'Unité', value: (p: Product) => p.unit },
      { label: 'Statut', value: (p: Product) => p.status },
      { label: 'Code-barres', value: (p: Product) => p.barcode },
    ];
    if (fmt === 'excel') exportExcel('articles', 'Articles', columns, filteredProducts);
    else exportPdf('articles', 'Catalogue des Articles', columns, filteredProducts);
    showToast(`${filteredProducts.length} article(s) exporté(s) (${fmt.toUpperCase()}).`, { title: 'Export' });
  };

  // Fiche article réutilisée : en sidebar sur desktop, en ligne sous le produit sur mobile.
  // Restauration : recette d'un plat, ou plats qui utilisent cet ingrédient.
  // Commun aux deux fiches (panneau de droite sur grand écran, fiche sous la ligne sinon).
  const renderRestaurantBlock = (vp: Product) =>
    isDish(vp) ? (
      <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs" data-testid="fiche-recipe">
        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-2"><ChefHat className="w-3.5 h-3.5 text-cyan-500" /> Recette — 1 portion</p>
        {(vp.recipe || []).length === 0 ? (
          <p className="text-slate-400 italic">Pas encore de recette : la vente de ce plat ne retire aucun ingrédient.</p>
        ) : (
          <ul className="space-y-1">
            {(vp.recipe || []).map((l) => {
              const ing = productsById.get(l.ingredientId);
              return (
                <li key={l.ingredientId} className="flex justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-200 truncate">{ing?.name || 'Ingrédient supprimé'}</span>
                  <span className="font-mono text-slate-500 whitespace-nowrap">{fmtQty(l.quantity)} {ing?.unit}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-between border-t border-cyan-500/20 mt-2 pt-2">
          <span className="text-slate-400">Coût de revient / marge :</span>
          <span className="font-mono text-slate-900 dark:text-slate-100">
            {format(recipeCost(vp.recipe, productsById))} / {format(vp.salePrice - recipeCost(vp.recipe, productsById))}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Portions possibles :</span>
          <span className="font-mono text-slate-900 dark:text-slate-100">
            {portionsPossible(vp.recipe, (id) => productsById.get(id)?.quantity || 0) ?? '—'}
          </span>
        </div>
        {canWrite && (
          <div className="mt-2 flex gap-3">
            <button onClick={() => setDishForm({ dish: vp })} className="text-cyan-500 hover:underline">Modifier la recette</button>
            {(vp.recipe || []).length > 0 && (
              <button onClick={() => setDishLoss(vp)} className="text-amber-500 hover:underline">Déclarer une perte</button>
            )}
          </div>
        )}
      </div>
    ) : (() => {
      const dishes = usedInDishes(vp.id, products);
      return dishes.length ? (
        <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs" data-testid="fiche-used-in">
          <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1"><ChefHat className="w-3.5 h-3.5 text-cyan-500" /> Ingrédient de {dishes.length} plat{dishes.length > 1 ? 's' : ''}</p>
          <p className="text-slate-500">{dishes.map((d) => `${d.name} (${fmtQty((d.recipe || []).find((l) => l.ingredientId === vp.id)?.quantity)} ${vp.unit})`).join(' · ')}</p>
        </div>
      ) : null;
    })();

  const renderFiche = (vp: Product) => (
    <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm relative animate-fade-in">
      <button
        onClick={() => setViewProduct(null)}
        className="absolute top-4 right-4 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        Fermer ✕
      </button>
      <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-widest mb-3">Fiche Article</h3>

      <div className="flex gap-3 items-center mb-4">
        <img
          src={vp.image || PRODUCT_IMAGES[0]}
          alt={vp.name}
          className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700/50"
          referrerPolicy="no-referrer"
        />
        <div>
          <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{vp.name}</h4>
          <span className="text-[10px] font-mono text-slate-400 mt-1 block">{vp.sku}</span>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">{vp.description || 'Aucune description disponible.'}</p>

      {renderRestaurantBlock(vp)}

      <div className="space-y-2 border-t border-slate-200 dark:border-slate-800/60 pt-3.5 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">Code-barres :</span>
          <span className="font-mono text-slate-900 dark:text-slate-200">{vp.barcode}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Catégorie :</span>
          <span className="text-slate-900 dark:text-slate-200">{vp.categoryName}</span>
        </div>
        {isDish(vp) ? (
          <div className="flex justify-between">
            <span className="text-slate-400">Prix de vente :</span>
            <span className="font-mono text-slate-900 dark:text-slate-200">{format(vp.salePrice)}</span>
          </div>
        ) : (<>
        <div className="flex justify-between">
          <span className="text-slate-400">Localisation :</span>
          <span className="font-semibold text-slate-900 dark:text-slate-200">
            {warehouses.find((w) => w.id === vp.locationId)?.name || 'Central'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Prix Achat :</span>
          <span className="font-mono text-slate-900 dark:text-slate-200">{format(vp.purchasePrice)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Seuils Alerte :</span>
          <span className="font-mono text-slate-900 dark:text-slate-200">Min: {vp.minStock} / Max: {vp.maxStock}</span>
        </div>
        </>)}
        {vp.expirationDate && (
          <div className="flex justify-between">
            <span className="text-slate-400">Péremption :</span>
            <span className="font-mono text-red-400">{vp.expirationDate}</span>
          </div>
        )}
        {vp.lotNumber && (
          <div className="flex justify-between">
            <span className="text-slate-400">N° Lot :</span>
            <span className="font-mono text-slate-900 dark:text-slate-200">{vp.lotNumber}</span>
          </div>
        )}
      </div>

      {vp.trackSerial && (
        <SerialPanel product={vp} warehouses={warehouses} productStock={productStock} canWrite={canWrite} onChanged={onRefresh} />
      )}

      {vp.variantGroup && (
        <VariantGrid
          products={products}
          group={vp.variantGroup}
          selectedId={vp.id}
          onSelect={(v) => setViewProduct(v)}
          onAdd={() => setVariantModal({ kind: 'add', group: vp.variantGroup! })}
          onEdit={() => setVariantModal({ kind: 'edit', group: vp.variantGroup! })}
          onLabels={() => setLabelsGroup(vp.variantGroup!)}
          canWrite={canWrite}
        />
      )}

      <div className="mt-5 pt-3.5 border-t border-slate-200 dark:border-slate-800/60 flex flex-col justify-center items-center gap-1">
        <QrCode className="w-16 h-16 text-slate-400" />
        <span className="text-[10px] font-mono text-slate-500 mt-1">{vp.sku}-QR</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      
      {/* Title & Actions bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Catalogue des Stocks</h2>
          <p className="text-xs text-slate-400">Gérez vos articles, surveillez les seuils et réalisez des ajustements rapides.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsScannerOpen(true)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5"
          >
            <Barcode className="w-4 h-4 text-cyan-400" />
            Scanner Code-barres
          </button>
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
              <Plus className="w-4 h-4 shrink-0" />
              {features.recipes ? 'Nouvel ingrédient / article' : 'Nouveau Produit'}
            </button>
          )}
          {(features.serials || products.some((p) => p.trackSerial)) && (
            <button
              onClick={() => setLookupOpen(true)}
              title="Retrouver un appareil par son numéro de série / IMEI : vente, client, garantie"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              N° de série / garantie
            </button>
          )}
          {canWrite && features.variants && (
            <button
              onClick={() => setVariantModal({ kind: 'create' })}
              title="Vêtements, chaussures… : un modèle décliné en tailles et couleurs"
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition duration-150"
            >
              <Shirt className="w-4 h-4 shrink-0 text-cyan-400" />
              Nouveau modèle (tailles / couleurs)
            </button>
          )}
          {canWrite && (features.recipes || products.some(isDish)) && (
            <button
              onClick={() => setDishForm({ dish: null })}
              title="Restauration : un plat, un cocktail ou un jus frais composé d'ingrédients — chaque vente retire les ingrédients du stock"
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition duration-150"
            >
              <ChefHat className="w-4 h-4 shrink-0 text-cyan-400" />
              Nouveau plat / boisson
            </button>
          )}
        </div>
      </div>

      {/* Restauration : plats d'un côté, ingrédients & articles stockés de l'autre */}
      {showKindTabs && (
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 w-fit" role="tablist" aria-label="Type d'articles">
          {([
            ['dish', `Plats (${dishCount})`],
            ['stock', `Ingrédients & articles (${products.length - dishCount})`],
            ['reports', 'Rapports cuisine'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={kindTab === k}
              onClick={() => { setKindTab(k); setViewProduct(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition ${
                kindTab === k
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {k === 'dish' ? <ChefHat className="w-4 h-4 text-cyan-500" /> : k === 'reports' ? <TrendingDown className="w-4 h-4 text-cyan-500 rotate-180" /> : <Archive className="w-4 h-4 text-cyan-500" />}
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Restauration : rapports cuisine (marge par plat, consommation, écarts) */}
      {kindTab === 'reports' ? (
        <KitchenReports products={products} format={format} />
      ) : (<>

      {/* Advanced Filter Panel */}
      <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Rechercher par nom, SKU ou code-barres..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-slate-950/20 text-xs py-2.5 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-800/80 text-slate-900 dark:text-gray-100 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Categories */}
        <div className="w-full md:w-48">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-white dark:bg-slate-950/20 text-xs py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800/80 text-slate-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="all">Toutes Catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Warehouses — sans objet pour les plats */}
        {!dishMode && (<>
        <div className="w-full md:w-48">
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="w-full bg-white dark:bg-slate-950/20 text-xs py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800/80 text-slate-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="all">Tous Entrepôts</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        {/* Stock Status */}
        <div className="w-full md:w-44">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-white dark:bg-slate-950/20 text-xs py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800/80 text-slate-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="all">Tous les Statuts</option>
            <option value="in_stock">En Stock</option>
            <option value="low_stock">Stock Faible</option>
            <option value="out_of_stock">Rupture</option>
            <option value="expired">Périmé</option>
          </select>
        </div>
        </>)}
      </div>

      {/* Main Grid: Catalog List & Quick view sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        
        {/* Catalog List */}
        {/* overflow-clip (et non hidden) : coins arrondis conservés, la barre de défilement du haut peut rester collée */}
        <div className="xl:col-span-3 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-clip shadow-sm">
          {/* Défilement horizontal : barre en haut (celle du bas est masquée) */}
          <TopScroll>
            {dishMode ? renderDishTable() : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/15 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">{showKindTabs ? 'Ingrédient / article' : 'Produit'}</th>
                  <th className="py-3 px-4">Fournisseur</th>
                  <th className="py-3 px-4">SKU / Code-barres</th>
                  <th className="py-3 px-4">Catégorie</th>
                  <th className="py-3 px-4 text-right">Prix Achat</th>
                  <th className="py-3 px-4 text-right">Prix Vente</th>
                  <th className="py-3 px-4 text-center">Quantité</th>
                  <th className="py-3 px-4">Entrepôt(s)</th>
                  <th className={STICKY_ACTIONS_TH}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      Aucun produit ne correspond aux filtres appliqués.
                    </td>
                  </tr>
                ) : (
                  productsPage.paged.map((p) => (
                    <React.Fragment key={p.id}>
                    <tr
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition duration-150 cursor-pointer"
                      onClick={() => setViewProduct(p)}
                    >
                      <td className="py-3.5 px-4 flex items-center gap-3">
                        <img
                          src={p.image || PRODUCT_IMAGES[0]}
                          alt={p.name}
                          className="w-8 h-8 rounded-lg object-cover bg-slate-800/20 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 dark:text-white block truncate">{p.name}</span>
                          {isDish(p) ? (
                            <span
                              className="text-[10px] text-slate-400 block cursor-help"
                              title={(p.recipe || []).length
                                ? 'Recette pour 1 portion :\n' + (p.recipe || []).map((l) => {
                                    const ing = productsById.get(l.ingredientId);
                                    return `• ${ing?.name || 'Ingrédient supprimé'} : ${fmtQty(l.quantity)} ${ing?.unit || ''}`;
                                  }).join('\n')
                                : "Pas encore de recette"}
                            >
                              <span className="inline-block px-1.5 rounded bg-cyan-500/10 text-cyan-500 font-semibold mr-1">Plat</span>
                              {(p.recipe || []).length ? `${(p.recipe || []).length} ingrédient${(p.recipe || []).length > 1 ? 's' : ''}` : 'sans recette'}
                            </span>
                          ) : p.variantGroup ? (
                            <span className="text-[10px] text-slate-400 block truncate">
                              <span className="inline-block px-1.5 rounded bg-cyan-500/10 text-cyan-500 font-semibold mr-1">{variantLabel(p) || 'Variante'}</span>
                              modèle {p.modelName}
                            </span>
                          ) : p.trackSerial ? (
                            <span className="text-[10px] text-slate-400 block">
                              <span className="inline-block px-1.5 rounded bg-cyan-500/10 text-cyan-500 font-semibold mr-1">IMEI</span>
                              {p.warrantyMonths ? `garantie ${p.warrantyMonths} mois` : 'suivi à l\'unité'}
                            </span>
                          ) : dishUsage.get(p.id) ? (
                            <span className="text-[10px] text-slate-400 block" title={'Utilisé dans : ' + usedInDishes(p.id, products).map((d) => d.name).join(', ')}>
                              <span className="inline-block px-1.5 rounded bg-emerald-500/10 text-emerald-500 font-semibold mr-1">Ingrédient</span>
                              {dishUsage.get(p.id)} plat{dishUsage.get(p.id)! > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 block font-mono">ID: {p.id}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {p.supplierName || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <span className="text-cyan-400 block">{p.sku}</span>
                        <span className="text-slate-500 text-[9px] block">{p.barcode}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {p.categoryName || 'Inconnu'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-900 dark:text-gray-300" title={isDish(p) ? 'Coût de revient de la recette (prix d\'achat actuels des ingrédients)' : undefined}>
                        {format(isDish(p) ? recipeCost(p.recipe, productsById) : p.purchasePrice)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-cyan-400">
                        {format(p.salePrice)}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold">
                        {isDish(p) ? (() => {
                          const n = portionsPossible(p.recipe, (id) => productsById.get(id)?.quantity || 0);
                          return n == null
                            ? <span className="text-slate-400 font-sans font-normal">sans recette</span>
                            : <span className={n === 0 ? 'text-red-500' : 'text-slate-900 dark:text-emerald-400'} title="Portions réalisables avec le stock actuel des ingrédients">{n} portion{n > 1 ? 's' : ''}</span>;
                        })() : (<>
                        <span
                          className={
                            p.quantity === 0
                              ? 'text-red-500'
                              : p.quantity <= p.minStock
                              ? 'text-amber-500'
                              : 'text-slate-900 dark:text-emerald-400'
                          }
                        >
                          {fmtQty(p.quantity)} {p.unit}
                        </span>
                        {hasPack(p.packSize) && (
                          <span className="block text-[9px] text-slate-400 font-mono mt-0.5">{packBreakdown(p.quantity, p.packSize, p.packLabel, ['Pièces', 'Unités'].includes(p.unit) ? null : p.unit)}</span>
                        )}
                        </>)}
                      </td>
                      <td className="py-3.5 px-4 text-[11px] text-slate-500 dark:text-slate-300 min-w-[120px]">
                        {(() => {
                          const dist = stockByProduct.get(p.id);
                          if (!dist || dist.length === 0) return <span className="text-slate-400">—</span>;
                          return (
                            <div className="space-y-0.5">
                              {dist.map((d) => (
                                <div key={d.name} className="flex justify-between gap-2">
                                  <span className="truncate">{d.name}</span>
                                  <span className="font-mono text-slate-400">{d.qty}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={STICKY_ACTIONS_TD}>
                        <div
                          className="flex justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()} // Stop click row view trigger
                        >
                          {canWrite && !isDish(p) && (
                            <button
                              onClick={() => {
                                setAdjustingProduct(p);
                                setAdjustQty(1);
                                setAdjustType('entry_reception');
                              }}
                              className="p-1.5 bg-slate-100 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-500 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-cyan-400 rounded-md transition duration-150"
                              title="Ajuster rapide stock"
                            >
                              <Layers className="w-3.5 h-3.5" />
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
                                onClick={() => handleDeleteProduct(p)}
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
                    {/* Fiche article en ligne (mobile/tablette uniquement, sous le produit cliqué) */}
                    {viewProduct?.id === p.id && (
                      <tr className="xl:hidden">
                        <td colSpan={9} className="p-3 bg-slate-50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60">
                          {renderFiche(p)}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
            )}
          </TopScroll>
          <Pagination
            page={productsPage.page}
            pageCount={productsPage.pageCount}
            total={productsPage.total}
            from={productsPage.from}
            to={productsPage.to}
            onChange={productsPage.setPage}
          />
        </div>

        {/* Quick View / Adjust Sidebar */}
        <div className="space-y-4">
          
          {/* Product Detail Sidebar — desktop (sur mobile la fiche s'affiche en ligne sous le produit) */}
          <div className="hidden xl:block">
          {viewProduct ? (
            <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm relative animate-fade-in">
              <button
                onClick={() => setViewProduct(null)}
                className="absolute top-4 right-4 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Fermer ✕
              </button>
              <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-widest mb-3">Fiche Article</h3>
              
              <div className="flex gap-3 items-center mb-4">
                <img
                  src={viewProduct.image || PRODUCT_IMAGES[0]}
                  alt={viewProduct.name}
                  className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700/50"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{viewProduct.name}</h4>
                  <span className="text-[10px] font-mono text-slate-400 mt-1 block">{viewProduct.sku}</span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">{viewProduct.description || 'Aucune description disponible.'}</p>

              {renderRestaurantBlock(viewProduct)}

              {viewProduct.trackSerial && (
                <div className="mb-4">
                  <SerialPanel product={viewProduct} warehouses={warehouses} productStock={productStock} canWrite={canWrite} onChanged={onRefresh} />
                </div>
              )}

              {viewProduct.variantGroup && (
                <div className="mb-4">
                  <VariantGrid
                    products={products}
                    group={viewProduct.variantGroup}
                    selectedId={viewProduct.id}
                    onSelect={(v) => setViewProduct(v)}
                    onAdd={() => setVariantModal({ kind: 'add', group: viewProduct.variantGroup! })}
                    onEdit={() => setVariantModal({ kind: 'edit', group: viewProduct.variantGroup! })}
                    onLabels={() => setLabelsGroup(viewProduct.variantGroup!)}
                    canWrite={canWrite}
                  />
                </div>
              )}

              <div className="space-y-2 border-t border-slate-200 dark:border-slate-800/60 pt-3.5 text-xs">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Code-barres :</span>
                    {viewProduct.barcode ? (
                      <button onClick={() => setLabelProduct(viewProduct)} className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"><Printer className="w-3 h-3" />Imprimer l'étiquette</button>
                    ) : <span className="font-mono text-slate-400">—</span>}
                  </div>
                  {viewProduct.barcode?.length === 13 && (
                    <div className="flex justify-center p-2 bg-white rounded-lg border border-slate-200 dark:border-slate-700">
                      <BarcodeSVG code={viewProduct.barcode} height={48} />
                    </div>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Catégorie :</span>
                  <span className="text-slate-900 dark:text-slate-200">{viewProduct.categoryName}</span>
                </div>
                {isDish(viewProduct) ? (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Prix de vente :</span>
                    <span className="font-mono text-slate-900 dark:text-slate-200">{format(viewProduct.salePrice)}</span>
                  </div>
                ) : (<>
                <div className="flex justify-between">
                  <span className="text-slate-400">Localisation :</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {warehouses.find((w) => w.id === viewProduct.locationId)?.name || 'Central'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Prix Achat :</span>
                  <span className="font-mono text-slate-900 dark:text-slate-200">{format(viewProduct.purchasePrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Seuils Alerte :</span>
                  <span className="font-mono text-slate-900 dark:text-slate-200">Min: {viewProduct.minStock} / Max: {viewProduct.maxStock}</span>
                </div>
                </>)}
                {viewProduct.expirationDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Péremption :</span>
                    <span className="font-mono text-red-400">{viewProduct.expirationDate}</span>
                  </div>
                )}
                {viewProduct.lotNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">N° Lot :</span>
                    <span className="font-mono text-slate-900 dark:text-slate-200">{viewProduct.lotNumber}</span>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-3.5 border-t border-slate-200 dark:border-slate-800/60 flex flex-col justify-center items-center gap-1">
                <QrCode className="w-16 h-16 text-slate-400" />
                <span className="text-[10px] font-mono text-slate-500 mt-1">{viewProduct.sku}-QR</span>
              </div>

              {/* Historique des mouvements (entrées / sorties / ajustements) — plus récents en premier */}
              <div className="mt-5 pt-3.5 border-t border-slate-200 dark:border-slate-800/60">
                <h5 className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">Historique des mouvements</h5>
                {historyLoading ? (
                  <p className="text-[11px] text-slate-500">Chargement…</p>
                ) : historyMoves.length === 0 ? (
                  <p className="text-[11px] text-slate-500">Aucun mouvement enregistré pour cet article.</p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {historyMoves.map((m) => {
                      const meta = MOVE_META[m.type] || { label: m.type, sign: '', cls: 'text-slate-400' };
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-2 text-[11px] p-2 rounded-lg bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40">
                          <div className="min-w-0">
                            <span className={`font-semibold ${meta.cls}`}>{meta.label}</span>
                            <span className="text-slate-400 block truncate" title={m.reason || ''}>{m.reason || '—'}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`font-mono font-bold ${meta.cls}`}>{meta.sign}{m.quantity}</span>
                            <span className="text-[9px] text-slate-400 block">{new Date(m.createdAt).toLocaleDateString()} {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-900/20 p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800/80 text-center text-xs text-slate-500">
              <Eye className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <span>Cliquez sur un article de la liste pour afficher sa fiche technique et ses codes de traçabilité.</span>
            </div>
          )}
          </div>

          {/* Quick Stock Adjustment Panel */}
          {adjustingProduct && (
            <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-md animate-slide-up">
              <div className="flex justify-between mb-3">
                <h4 className="text-xs font-mono text-cyan-400 uppercase tracking-widest">Ajuster le Stock</h4>
                <button
                  onClick={() => setAdjustingProduct(null)}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate mb-4">{adjustingProduct.name}</p>

              <form onSubmit={handleQuickAdjustmentSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Type d'opération :</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustType('entry_reception')}
                      className={`py-1.5 text-center rounded-lg border font-semibold ${
                        adjustType === 'entry_reception'
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                          : 'bg-slate-950/20 text-slate-400 border-slate-800'
                      }`}
                    >
                      + Entrée
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustType('exit_sale')}
                      className={`py-1.5 text-center rounded-lg border font-semibold ${
                        adjustType === 'exit_sale'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : 'bg-slate-950/20 text-slate-400 border-slate-800'
                      }`}
                    >
                      - Sortie
                    </button>
                  </div>
                </div>

                {adjustType === 'entry_reception' && (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-start text-[10px] leading-snug rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 p-2.5">
                      <span className="shrink-0">💡</span>
                      <span>
                        Cette entrée <strong>ajuste seulement le stock</strong> (inventaire, correction, stock de départ) — elle n'enregistre <strong>aucune dépense</strong>.
                        Si vous <strong>réapprovisionnez chez un fournisseur</strong>, cliquez sur « Créer un achat » ci-dessous : le stock montera <em>et</em> la dépense/la dette fournisseur seront enregistrées.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreatePurchaseFromEntry}
                      disabled={purchaseBusy}
                      className="w-full py-2 border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {purchaseBusy ? 'Création…' : 'Créer un achat (fournisseur + dépense)'}
                    </button>
                  </div>
                )}

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Quantité :</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Motif d'ajustement :</label>
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg cursor-pointer transition duration-150 text-xs"
                >
                  Confirmer le Mouvement
                </button>
              </form>
            </div>
          )}

        </div>

      </div>
      </>)}

      {/* MODAL: CREATE / EDIT PRODUCT */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {editingProduct ? 'Modifier le Produit' : 'Créer un Nouveau Produit'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProductSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Nom du Produit *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. Souris LogiTech MX Master 3S"
                  />
                </div>

                {/* SKU */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">SKU Unique *</label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Barcode */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-400 block">Code-barres (EAN-13)</label>
                    <button type="button" onClick={() => setBarcode(generateEan13(products.map((p) => p.barcode)))} className="text-[10px] text-cyan-400 hover:underline">Générer</button>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={13}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value.replace(/\D/g, '').slice(0, 13))}
                    placeholder="13 chiffres — ou cliquez sur « Générer »"
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  {(() => {
                    const dup = barcode && products.find((p) => p.barcode === barcode && p.id !== editingProduct?.id);
                    return dup ? (
                      <p className="mt-1 text-[10px] text-red-500">Déjà utilisé par « {dup.name} » ({dup.sku}) — chaque article doit avoir son propre code.</p>
                    ) : null;
                  })()}
                  {barcode.length === 13 && (
                    <div className="mt-2 flex justify-center p-2 bg-white rounded-lg border border-slate-200 dark:border-slate-700">
                      <BarcodeSVG code={barcode} height={44} />
                    </div>
                  )}
                </div>

                {/* Catégorie (niveau 1) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-400 block">Catégorie *</label>
                    <button
                      type="button"
                      onClick={() => setIsCatModalOpen(true)}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      + Gérer
                    </button>
                  </div>
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setSubCategoryId(''); // réinitialise la sous-catégorie
                    }}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-200 focus:outline-none"
                  >
                    <option value="">— Choisir une catégorie —</option>
                    {topCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sous-catégorie (filtrée selon la catégorie) */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-400 block">Sous-catégorie</label>
                    <button
                      type="button"
                      onClick={() => openCategoryManager(categoryId)}
                      title={categoryId ? 'Ajouter une sous-catégorie dans la catégorie choisie' : 'Gérer les catégories et sous-catégories'}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      + Gérer
                    </button>
                  </div>
                  <select
                    value={subCategoryId}
                    onChange={(e) => setSubCategoryId(e.target.value)}
                    disabled={!categoryId || subCategoriesOf(categoryId).length === 0}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-200 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">
                      {categoryId && subCategoriesOf(categoryId).length > 0 ? '— Aucune —' : 'Aucune sous-catégorie'}
                    </option>
                    {categoryId &&
                      subCategoriesOf(categoryId).map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Marque */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-400 block">Marque</label>
                    <button
                      type="button"
                      onClick={() => setIsBrandModalOpen(true)}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      + Gérer
                    </button>
                  </div>
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-200 focus:outline-none"
                  >
                    <option value="">— Aucune —</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Supplier */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Fournisseur</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-200 focus:outline-none"
                  >
                    <option value="">— Aucun —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Warehouses */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-400 block">Localisation / Entrepôt</label>
                    <button
                      type="button"
                      onClick={() => setIsWhModalOpen(true)}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      + Gérer
                    </button>
                  </div>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-200 focus:outline-none"
                  >
                    <option value="">— Aucun —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Purchase Price */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Prix d'Achat TTC (Ar) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    min={0.01}
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Sale Price */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Prix de Vente TTC (Ar) <span className="text-slate-400 font-normal">(facultatif)</span></label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={salePrice}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Taux de TVA de l'article (comprise dans les prix) */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">TVA (%) <span className="text-slate-400 font-normal">(comprise dans les prix ; 0 = sans TVA)</span></label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={100}
                    value={vatRate}
                    onChange={(e) => setVatRate(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                    aria-label="Taux de TVA"
                  />
                </div>

                {/* Initial quantity (Only on create) */}
                {!editingProduct && trackSerial && (
                  <div className="text-[11px] text-slate-500 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800">
                    Stock initial : après la création, ouvrez la fiche de l'article et <b>scannez les numéros</b> des appareils (« Ajouter des numéros »).
                  </div>
                )}
                {!editingProduct && !trackSerial && (
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Quantité Initiale *</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={initialQuantity}
                      onChange={(e) => setInitialQuantity(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}

                {/* Unit */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Unité de base (détail)</label>
                  <select
                    value={UNIT_OPTIONS.includes(unit) ? unit : '__other__'}
                    onChange={(e) => setUnit(e.target.value === '__other__' ? '' : e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  >
                    {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                    <option value="__other__">Autre…</option>
                  </select>
                  {!UNIT_OPTIONS.includes(unit) && (
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      autoFocus
                      className="w-full mt-2 bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                      placeholder="Saisir l'unité personnalisée (ex. Sacs, Pots…)"
                    />
                  )}
                </div>

                {(features.serials || trackSerial || !!editingProduct?.trackSerial) && (
                  <div className="col-span-1 md:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/60 dark:bg-slate-950/20 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={trackSerial}
                        disabled={!!editingProduct?.trackSerial}
                        onChange={(e) => setTrackSerial(e.target.checked)}
                        className="w-4 h-4 mt-0.5 accent-cyan-600"
                      />
                      <span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 block">Suivi par numéro de série / IMEI</span>
                        <span className="text-[10px] text-slate-400">Chaque appareil a son numéro : vente, garantie et retour suivis à l'unité.{editingProduct?.trackSerial ? ' (ne peut plus être désactivé)' : ''}</span>
                      </span>
                    </label>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Garantie client (mois)</label>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        step={1}
                        value={warrantyMonths}
                        onChange={(e) => setWarrantyMonths(Math.max(0, Math.min(120, Math.floor(Number(e.target.value) || 0))))}
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                )}

                {(features.packs || (Number(editingProduct?.packSize) || 1) > 1 || (parseDecimal(packSize) || 1) > 1) && (<>
                {/* Conditionnement — vente en gros (carton ↔ pièces) */}
                <div className="col-span-1 md:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/60 dark:bg-slate-950/20">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-0.5">Conditionnement (vente en gros)</label>
                  <p className="text-[10px] text-slate-400 mb-2.5">Le stock reste compté en {(unit || 'pièces').toLowerCase()} (vente au détail). Le conditionnement sert à la vente en gros ; laissez la taille à 1 s'il n'y en a pas.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">{unit || 'Pièces'} / {(packLabel.trim() || 'carton').toLowerCase()}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(packSize).replace('.', ',')}
                        onChange={(e) => setPackSize(e.target.value.replace(/[^0-9,.]/g, ''))}
                        onBlur={() => setPackSize(Math.max(1, Math.round((parseDecimal(packSize) || 1) * 1000) / 1000))}
                        placeholder="ex. 12 ou 12,5"
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Nom du colis</label>
                      <input
                        type="text"
                        value={packLabel}
                        onChange={(e) => setPackLabel(e.target.value)}
                        disabled={(parseDecimal(packSize) || 1) <= 1}
                        placeholder="Carton"
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Prix d'achat / {(packLabel.trim() || 'carton').toLowerCase()}</label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={packPurchasePrice}
                        onChange={(e) => setPackPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
                        disabled={(parseDecimal(packSize) || 1) <= 1}
                        placeholder="optionnel"
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Prix de vente / {(packLabel.trim() || 'carton').toLowerCase()}</label>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={packSalePrice}
                        onChange={(e) => setPackSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                        disabled={(parseDecimal(packSize) || 1) <= 1}
                        placeholder="optionnel"
                        className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                      />
                    </div>
                  </div>
                  {(parseDecimal(packSize) || 1) > 1 && (
                    <p className="text-[10px] text-cyan-500 mt-2">1 {packLabel.trim() || 'Carton'} = {fmtQty(parseDecimal(packSize))} {unit || 'pièces'}.</p>
                  )}
                </div>
                </>)}

                {/* Min Stock */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Seuil Alerte Min</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={minStock}
                    onChange={(e) => setMinStock(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Max Stock */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Seuil Alerte Max</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={maxStock}
                    onChange={(e) => setMaxStock(Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {(features.expiry || !!expirationDate || !!lotNumber) && (<>
                {/* Expiry Date */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Date d'Expiration (Optionnel)</label>
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Lot number */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Numéro de Lot (Optionnel)</label>
                  <input
                    type="text"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                </>)}

                {/* Image : import fichier + aperçu + presets */}
                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-slate-400 block mb-2">Illustration de l'Article</label>
                  <div className="flex items-start gap-3">
                    {/* Aperçu de l'image sélectionnée */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/20 flex items-center justify-center">
                      {image ? (
                        <img src={image} alt="aperçu" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Bouton d'import depuis l'ordinateur */}
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/20 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-200 cursor-pointer transition">
                          <ImageIcon className="w-3.5 h-3.5" />
                          Importer une image
                          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleImageFile} />
                        </label>
                        <span className="text-[10px] text-slate-400">JPG, PNG, WEBP ou GIF — 2 Mo max</span>
                      </div>

                      {/* Illustrations prédéfinies */}
                      <div className="flex gap-2 overflow-x-auto py-0.5">
                        {PRODUCT_IMAGES.map((img) => (
                          <button
                            key={img}
                            type="button"
                            onClick={() => setImage(img)}
                            className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 transition duration-150 ${
                              image === img ? 'border-cyan-400 scale-105' : 'border-slate-200 dark:border-slate-800/80 hover:border-slate-400 dark:hover:border-slate-600'
                            }`}
                          >
                            <img src={img} alt="preset" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Spécifications, dimensions, conditions de conservation..."
                  />
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
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg cursor-pointer transition"
                >
                  {editingProduct ? 'Sauvegarder les modifications' : 'Créer le Produit'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODÈLE TAILLES × COULEURS */}
      {variantModal && (
        <VariantModelModal
          mode={variantModal}
          sizePresets={sizePresetsFor(sectors)}
          products={products}
          categories={categories}
          brands={brands}
          suppliers={suppliers}
          warehouses={warehouses}
          onClose={() => setVariantModal(null)}
          onDone={() => {
            setVariantModal(null);
            onRefresh();
          }}
        />
      )}
      {labelsGroup && <VariantLabels products={products} group={labelsGroup} onClose={() => setLabelsGroup(null)} />}
      {lookupOpen && <SerialLookupModal onClose={() => setLookupOpen(false)} />}
      {dishLoss && (
        <DishLossModal
          dish={dishLoss}
          products={products}
          productStock={productStock}
          warehouses={warehouses}
          format={format}
          onClose={() => setDishLoss(null)}
          onDone={() => { setDishLoss(null); setHistoryKey((k) => k + 1); onRefresh(); }}
        />
      )}
      {dishForm && (
        <DishForm
          dish={dishForm.dish}
          products={products}
          categories={categories}
          productStock={productStock}
          warehouses={warehouses}
          defaultVatRate={defaultVatRate}
          onIngredientCreated={onRefresh}
          format={format}
          onManageCategories={openCategoryManager}
          onClose={() => setDishForm(null)}
          onSaved={() => { setDishForm(null); onRefresh(); }}
        />
      )}

      {/* ÉTIQUETTE CODE-BARRES À IMPRIMER */}
      {labelProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <style>{`@media print { @page { size: 58mm 40mm; margin: 2mm; } body * { visibility: hidden; } .label-print, .label-print * { visibility: visible; } .label-print { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; } .label-noprint { display: none !important; } }`}</style>
          <div className="bg-white text-slate-950 rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl p-5 label-print">
            <div className="text-center space-y-1 w-full">
              <span className="text-[11px] font-bold uppercase tracking-wide">{getExportCompany() || 'Vokatra-ko'}</span>
              <p className="text-xs font-semibold leading-tight">{labelProduct.name}</p>
              <p className="text-base font-bold">{format(labelProduct.salePrice)}</p>
              <div className="flex justify-center pt-1"><BarcodeSVG code={labelProduct.barcode} height={52} /></div>
              <p className="text-[9px] font-mono text-slate-500">{labelProduct.sku}</p>
            </div>
            <div className="flex justify-end gap-2 pt-4 label-noprint">
              <button onClick={() => setLabelProduct(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer">Fermer</button>
              <button onClick={() => window.print()} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"><Printer className="w-4 h-4" />Imprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* BARCODE SCANNER SIMULATOR MODAL */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-sm">
                <Barcode className="w-5 h-5 text-cyan-400" />
                Simulateur de Douchette EAN
              </h3>
              <button onClick={() => setIsScannerOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">✕</button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Saisissez ou choisissez un code-barres de démonstration pour simuler le scan laser sur un article physique :
            </p>

            <form onSubmit={handleBarcodeScan} className="space-y-4 text-xs">
              <input
                type="text"
                required
                value={simulatedCode}
                onChange={(e) => setSimulatedCode(e.target.value)}
                placeholder="Ex: 5099206085816"
                className="w-full bg-slate-50 dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-mono text-center text-lg tracking-widest"
              />

              <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Raccourcis rapides :</span>
                {products.slice(0, 3).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSimulatedCode(p.barcode);
                    }}
                    className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-md flex justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400 transition"
                  >
                    <span>{p.name}</span>
                    <span className="text-cyan-400">{p.barcode}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg cursor-pointer transition"
                >
                  Scanner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GESTIONNAIRE DE CATÉGORIES / SOUS-CATÉGORIES */}
      {isCatModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-cyan-400" />
                Gestion des catégories
              </h4>
              <button
                type="button"
                onClick={() => setIsCatModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Formulaire d'ajout */}
            <form onSubmit={handleAddCat} className="space-y-3 text-xs bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Type :</label>
                <select
                  value={newCatParentId}
                  onChange={(e) => setNewCatParentId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950/40 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Catégorie principale</option>
                  {topCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      Sous-catégorie de : {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Nom :</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950/40 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  placeholder={newCatParentId ? 'ex. Mobile, TV, Ordinateur...' : 'ex. Électronique'}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={catBusy}
                  className="px-4 py-1.5 bg-cyan-500 text-white font-bold rounded-lg text-xs cursor-pointer hover:bg-cyan-600 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {catBusy ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </form>

            {/* Arborescence existante */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase text-slate-500">Catégories existantes</span>
              {topCategories.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-lg">
                  Aucune catégorie pour le moment.
                </p>
              ) : (
                topCategories.map((cat) => (
                  <div key={cat.id} className="bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{cat.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCat(cat.id, cat.name)}
                        className="p-1 text-slate-500 hover:text-red-400 cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {subCategoriesOf(cat.id).map((sc) => (
                      <div key={sc.id} className="flex justify-between items-center pl-3 mt-1.5 border-l border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">↳ {sc.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCat(sc.id, sc.name)}
                          className="p-1 text-slate-500 hover:text-red-400 cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* GESTIONNAIRE DE MARQUES */}
      {isBrandModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md p-5 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">Gestion des marques</h4>
              <button type="button" onClick={() => setIsBrandModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddBrand} className="flex gap-2 text-xs bg-slate-50 dark:bg-slate-950/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <input
                type="text"
                required
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="ex. Samsung, LG..."
                className="flex-1 bg-white dark:bg-slate-950/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              />
              <button type="submit" disabled={brandBusy} className="px-4 bg-cyan-500 text-white font-bold rounded-lg cursor-pointer hover:bg-cyan-600 disabled:opacity-50 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                {brandBusy ? '...' : 'Ajouter'}
              </button>
            </form>

            <div className="space-y-1.5">
              {brands.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-lg">Aucune marque.</p>
              ) : (
                brands.map((b) => (
                  <div key={b.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-900 dark:text-white">{b.name}</span>
                    <button type="button" onClick={() => handleDeleteBrand(b.id, b.name)} className="p-1 text-slate-500 hover:text-red-400 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* GESTIONNAIRE D'ENTREPÔTS */}
      {isWhModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-cyan-400" />
                Gestion des entrepôts
              </h4>
              <button type="button" onClick={() => setIsWhModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddWarehouse} className="space-y-2.5 text-xs bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Nom *</label>
                  <input type="text" required value={newWhName} onChange={(e) => setNewWhName(e.target.value)} placeholder="Entrepôt Central" className="w-full bg-white dark:bg-slate-950/40 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Code</label>
                  <input type="text" value={newWhCode} onChange={(e) => setNewWhCode(e.target.value)} placeholder="WH-TNR-01" className="w-full bg-white dark:bg-slate-950/40 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Localisation</label>
                  <input type="text" value={newWhLocation} onChange={(e) => setNewWhLocation(e.target.value)} placeholder="Antananarivo" className="w-full bg-white dark:bg-slate-950/40 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1">Capacité</label>
                  <input type="number" min={0} value={newWhCapacity} onChange={(e) => setNewWhCapacity(Number(e.target.value))} className="w-full bg-white dark:bg-slate-950/40 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500" />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={whBusy} className="px-4 py-1.5 bg-cyan-500 text-white font-bold rounded-lg cursor-pointer hover:bg-cyan-600 disabled:opacity-50 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  {whBusy ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </form>

            <div className="space-y-1.5">
              {warehouses.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-lg">Aucun entrepôt.</p>
              ) : (
                warehouses.map((w) => (
                  <div key={w.id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-xs text-slate-900 dark:text-white font-semibold">{w.name}</span>
                      <span className="text-[10px] text-slate-500 ml-2 font-mono">{w.code || ''} {w.location ? `· ${w.location}` : ''}</span>
                    </div>
                    <button type="button" onClick={() => handleDeleteWarehouse(w.id, w.name)} className="p-1 text-slate-500 hover:text-red-400 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
