import React, { useState, useEffect } from 'react';
import { fetchMe, logout as authLogout } from './services/authService';
import { CurrencyProvider } from './services/CurrencyContext';
import { listCategories } from './services/categoriesService';
import { listProducts } from './services/productsService';
import { listMovements } from './services/movementsService';
import { listClients, listSuppliers } from './services/partnersService';
import { listSupplierProducts } from './services/supplierProductsService';
import { listSales } from './services/salesService';
import { listDeliveries } from './services/deliveriesService';
import { listUsers } from './services/usersService';
import { listPurchases } from './services/purchasesService';
import { listExpenses } from './services/expensesService';
import { listAudits } from './services/auditsService';
import { listAuditLogs } from './services/auditLogsService';
import { listBrands, listWarehouses } from './services/catalogService';
import { getSettings } from './services/settingsService';
import { connectRealtime } from './services/realtime';
import {
  LayoutDashboard,
  Box,
  ShoppingCart,
  ShoppingBag,
  PackagePlus,
  Wallet,
  HandCoins,
  Users,
  UserCog,
  Truck,
  ClipboardList,
  History,
  Landmark,
  CalendarDays,
  Settings as SettingsIcon,
  LogOut,
  Sparkles,
  Database,
  User as UserIcon,
  Shield,
  Loader2,
  Menu,
  X
} from 'lucide-react';
import {
  Product,
  Warehouse,
  Supplier,
  Client,
  StockMovement,
  InventoryAudit,
  Sale,
  Setting,
  User,
  Category,
  Brand,
  AuditLog,
  Delivery,
  Purchase,
  Expense,
  SupplierProduct
} from './types';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import Products from './components/Products';
import POS from './components/POS';
import Partners from './components/Partners';
import Purchases from './components/Purchases';
import Reorder from './components/Reorder';
import Expenses from './components/Expenses';
import Receivables from './components/Receivables';
import Deliveries from './components/Deliveries';
import UsersAdmin from './components/Users';
import Audits from './components/Audits';
import Movements from './components/Movements';
import Calendar from './components/Calendar';
import Accounting from './components/Accounting';
import Settings from './components/Settings';
import NotificationCenter from './components/NotificationCenter';
import { ToastMessage, showToast } from './services/toast';
import DialogHost from './components/DialogHost';
import { showAlert } from './services/dialog';
import { allowedTabsFor } from './services/permissions';
import { setExportCompany } from './services/exportContext';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [productFilter, setProductFilter] = useState<string>('all'); // filtre appliqué en arrivant sur Articles
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Données chargées depuis l'API PostgreSQL
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [audits, setAudits] = useState<InventoryAudit[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [settings, setSettings] = useState<Setting | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Global settings overrides
  const [currencySymbol, setCurrencySymbol] = useState('€');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Trigger seeding progress
  const [seeding, setSeeding] = useState(false);

  // 1. Restaure la session à partir du jeton JWT stocké (auth PostgreSQL)
  useEffect(() => {
    fetchMe()
      .then((user) => setCurrentUser(user))
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthLoading(false));

    // Load initial theme from localStorage
    const savedTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    setTheme(savedTheme);
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // 2. Chargement des données ERP depuis l'API PostgreSQL.
  // Catégories, produits et mouvements branchés (étape 3). TODO : clients, suppliers, sales, etc.
  const reloadCategories = React.useCallback(() => {
    listCategories()
      .then(setCategories)
      .catch((err) => console.error('Chargement des catégories échoué :', err));
  }, []);

  const reloadProducts = React.useCallback(() => {
    listProducts()
      .then(setProducts)
      .catch((err) => console.error('Chargement des produits échoué :', err));
  }, []);

  const reloadMovements = React.useCallback(() => {
    listMovements()
      .then(setMovements)
      .catch((err) => console.error('Chargement des mouvements échoué :', err));
  }, []);

  const reloadPartners = React.useCallback(() => {
    listClients()
      .then(setClients)
      .catch((err) => console.error('Chargement des clients échoué :', err));
    listSuppliers()
      .then(setSuppliers)
      .catch((err) => console.error('Chargement des fournisseurs échoué :', err));
  }, []);

  // Catalogue d'approvisionnement (produits fournis par chaque fournisseur, avec prix).
  const reloadSupplierProducts = React.useCallback(() => {
    listSupplierProducts()
      .then(setSupplierProducts)
      .catch((err) => console.error('Chargement du catalogue fournisseur échoué :', err));
  }, []);

  const reloadSales = React.useCallback(() => {
    listSales()
      .then(setSales)
      .catch((err) => console.error('Chargement des ventes échoué :', err));
  }, []);

  const reloadAudits = React.useCallback(() => {
    listAudits()
      .then(setAudits)
      .catch((err) => console.error('Chargement des inventaires échoué :', err));
  }, []);

  const reloadDeliveries = React.useCallback(() => {
    listDeliveries()
      .then(setDeliveries)
      .catch((err) => console.error('Chargement des livraisons échoué :', err));
  }, []);

  const reloadPurchases = React.useCallback(() => {
    listPurchases()
      .then(setPurchases)
      .catch((err) => console.error('Chargement des achats échoué :', err));
  }, []);

  const reloadExpenses = React.useCallback(() => {
    listExpenses()
      .then(setExpenses)
      .catch((err) => console.error('Chargement des dépenses échoué :', err));
  }, []);

  // Après une réception d'achat : stock, mouvements et achats changent.
  const reloadAfterPurchase = React.useCallback(() => {
    reloadProducts();
    reloadMovements();
    reloadPurchases();
  }, [reloadProducts, reloadMovements, reloadPurchases]);

  // Réservé aux gestionnaires de comptes (évite un 403 pour les autres rôles).
  const reloadUsers = React.useCallback(() => {
    if (!currentUser || !['Super Admin', 'Admin'].includes(currentUser.role)) return;
    listUsers()
      .then(setUsersList)
      .catch((err) => console.error('Chargement des utilisateurs échoué :', err));
  }, [currentUser]);

  const reloadAuditLogs = React.useCallback(() => {
    listAuditLogs()
      .then(setAuditLogs)
      .catch((err) => console.error('Chargement du journal échoué :', err));
  }, []);

  const reloadBrandsWarehouses = React.useCallback(() => {
    listBrands()
      .then(setBrands)
      .catch((err) => console.error('Chargement des marques échoué :', err));
    listWarehouses()
      .then(setWarehouses)
      .catch((err) => console.error('Chargement des entrepôts échoué :', err));
  }, []);

  const reloadSettings = React.useCallback(() => {
    getSettings()
      .then((s) => {
        if (s) {
          setSettings(s);
          setExportCompany(s.companyName);
          if (s.currencySymbol) setCurrencySymbol(s.currencySymbol);
        }
      })
      .catch((err) => console.error('Chargement des réglages échoué :', err));
  }, []);

  // Rechargement combiné après une mutation produit/stock/catalogue.
  const reloadCatalog = React.useCallback(() => {
    reloadProducts();
    reloadMovements();
    reloadCategories();
    reloadBrandsWarehouses();
  }, [reloadProducts, reloadMovements, reloadCategories, reloadBrandsWarehouses]);

  // Après un encaissement POS : stock, mouvements, ventes et fidélité clients changent.
  const reloadAfterSale = React.useCallback(() => {
    reloadProducts();
    reloadMovements();
    reloadSales();
    reloadPartners();
    reloadDeliveries();
    reloadAuditLogs();
  }, [reloadProducts, reloadMovements, reloadSales, reloadPartners, reloadDeliveries, reloadAuditLogs]);

  // Après un inventaire : stock, mouvements, inventaires et journal changent.
  const reloadAfterAudit = React.useCallback(() => {
    reloadAudits();
    reloadProducts();
    reloadMovements();
    reloadAuditLogs();
  }, [reloadAudits, reloadProducts, reloadMovements, reloadAuditLogs]);

  useEffect(() => {
    if (!currentUser) return;
    reloadCategories();
    reloadProducts();
    reloadMovements();
    reloadPartners();
    reloadSupplierProducts();
    reloadSales();
    reloadAudits();
    reloadDeliveries();
    reloadPurchases();
    reloadExpenses();
    reloadUsers();
    reloadAuditLogs();
    reloadBrandsWarehouses();
    reloadSettings();
  }, [
    currentUser,
    reloadCategories,
    reloadProducts,
    reloadMovements,
    reloadPartners,
    reloadSupplierProducts,
    reloadSales,
    reloadAudits,
    reloadDeliveries,
    reloadPurchases,
    reloadExpenses,
    reloadUsers,
    reloadAuditLogs,
    reloadBrandsWarehouses,
    reloadSettings,
  ]);

  // 3. Temps réel (SSE) : chaque nouvelle entrée du journal déclenche un toast + notification.
  useEffect(() => {
    if (!currentUser) return;

    const disconnect = connectRealtime((type, log) => {
      if (type !== 'audit-log' || !log) return;

      // Ajoute le log en tête de liste (Dashboard / journal à jour en direct).
      setAuditLogs((prev) => [log, ...prev].slice(0, 100));

      // Les actions de l'utilisateur courant sont déjà confirmées par un toast
      // immédiat côté client → via le SSE on n'affiche que l'activité des AUTRES
      // utilisateurs (veille collaborative), sans doublonner.
      if (log.userId && currentUser && log.userId === currentUser.uid) return;

      // Détermine le style du toast selon l'action.
      const act = (log.action || '').toLowerCase();
      let toastType: ToastMessage['type'] = 'info';
      if (act.includes('erreur') || act.includes('suppression') || act.includes('échec')) {
        toastType = 'error';
      } else if (
        act.includes('création') || act.includes('succès') || act.includes('ajout') ||
        act.includes('réussie') || act.includes('connexion') || act.includes('vente') ||
        act.includes('validation')
      ) {
        toastType = 'success';
      } else if (act.includes('ajustement') || act.includes('inventaire') || act.includes('modification')) {
        toastType = 'warning';
      }

      const title = log.module || 'Activité ERP';
      const message = `${log.userName || 'Utilisateur'} : ${log.action}`;

      // Notification navigateur si l'utilisateur l'a autorisée.
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`Vokatra-ko : ${title}`, {
            body: message,
            icon: 'https://api.dicebear.com/7.x/identicon/svg?seed=vokatra',
          });
        } catch {
          /* ignore */
        }
      }

      showToast(message, {
        title,
        type: toastType,
        id: log.id || undefined,
        timestamp: log.createdAt || undefined,
      });
    });

    return disconnect;
  }, [currentUser]);

  // 4. RBAC navigation : si l'onglet actif n'est pas permis au rôle courant
  //    (ex. passage en Acheteur), on bascule vers le 1er onglet autorisé.
  useEffect(() => {
    if (!currentUser) return;
    const allowed = allowedTabsFor(currentUser.role, settings?.rolePermissions);
    if (!allowed.includes(activeTab)) setActiveTab(allowed[0]);
  }, [currentUser, activeTab, settings]);

  // Handle manual or automatic data seeding
  // TODO (étape CRUD) : brancher sur POST /api/seed (données de démo PostgreSQL).
  const handleSeedData = async () => {
    showAlert('Le chargement des données de démo sera disponible à l\'étape suivante (API CRUD PostgreSQL).', { variant: 'info' });
  };

  // Change simulation role
  const handleRoleChange = (newRole: string) => {
    if (!currentUser) return;
    const updated = { ...currentUser, role: newRole as any };
    setCurrentUser(updated);
    localStorage.setItem(`role_${currentUser.uid}`, newRole);
  };

  // Logout — efface le jeton JWT et réinitialise la session
  const handleLogout = () => {
    authLogout();
    setCurrentUser(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        <span className="text-xs text-slate-400 font-mono">Démarrage d'Vokatra-ko ERP...</span>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPage onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  // Sidebar list items
  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'products', label: 'Articles & Stocks', icon: Box },
    { id: 'pos', label: 'Caisse POS', icon: ShoppingCart },
    { id: 'receivables', label: 'Créances Clients', icon: HandCoins },
    { id: 'partners', label: 'Clients & Fournisseurs', icon: Users },
    { id: 'purchases', label: 'Achats', icon: ShoppingBag },
    { id: 'reorder', label: 'Réapprovisionnement', icon: PackagePlus },
    { id: 'expenses', label: 'Dépenses', icon: Wallet },
    { id: 'deliveries', label: 'Livraisons', icon: Truck },
    { id: 'audits', label: 'Audits & Ajustements', icon: ClipboardList },
    { id: 'movements', label: 'Historique des Flux', icon: History },
    { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
    { id: 'accounting', label: 'Comptabilité', icon: Landmark },
    { id: 'users', label: 'Utilisateurs', icon: UserCog },
    { id: 'settings', label: 'Configuration ERP', icon: SettingsIcon }
  ];

  // Onglets réellement visibles pour le rôle actif (matrice personnalisable dans Config ERP).
  const allowedTabs = allowedTabsFor(currentUser.role, settings?.rolePermissions);
  const visibleMenu = menuItems.filter((m) => allowedTabs.includes(m.id));

  return (
    <CurrencyProvider>
    <div className="h-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-gray-100 flex flex-col transition-colors duration-150">
      
      {/* 1. TOP UTILITY ACTION BAR (Role Simulator & Db Seeder) */}
      <div className="bg-slate-950 text-white border-b border-slate-800/80 px-4 py-2 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs z-30">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20">
            Simulateur de Rôles ERP
          </span>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[11px]">Rôle actif :</span>
            <select
              value={currentUser.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs px-2 py-1 rounded text-cyan-400 font-bold focus:outline-none"
            >
              <option value="Super Admin">🛡️ Super Admin (Tous droits)</option>
              <option value="Admin">🛠️ Admin</option>
              <option value="Manager">💼 Gérant / Manager</option>
              <option value="Commercial">📈 Commercial</option>
              <option value="Acheteur">📦 Acheteur</option>
              <option value="Auditeur">🔍 Auditeur</option>
              <option value="Magasinier">🏗️ Magasinier</option>
            </select>
          </div>
        </div>

        {/* Database Quick Seeder Indicator */}
        <div className="flex items-center gap-3">
          {products.length === 0 && (
            <span className="text-rose-400 flex items-center gap-1 text-[11px] font-mono animate-pulse">
              ⚠️ Base vide
            </span>
          )}
          <button
            onClick={handleSeedData}
            disabled={seeding}
            className="px-3 py-1 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white font-bold text-[11px] rounded transition flex items-center gap-1 cursor-pointer"
          >
            <Database className="w-3.5 h-3.5" />
            {seeding ? 'Seeding...' : products.length === 0 ? 'Charger Données Démo (ERP)' : 'Réinitialiser Données Démo'}
          </button>
        </div>
      </div>

      {/* Main ERP Frame Structure */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        
        {/* 2. SIDEBAR NAVIGATION */}
        <aside className="w-full md:w-64 md:h-full md:overflow-y-auto bg-slate-50 dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800/80 p-5 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            
            {/* Header logo */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-cyan-500 rounded-lg text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                  {(settings?.logoInitials || settings?.companyName?.trim().slice(0, 1) || 'S').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h1 className="font-extrabold text-sm text-slate-900 dark:text-white tracking-wider">INVENZO</h1>
                  <span className="text-[10px] text-cyan-400 font-mono block truncate">
                    {settings?.companyName || 'ERP de Gestion de Stock'}
                  </span>
                </div>
              </div>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden text-slate-400 hover:text-white"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

            {/* Nav list - visible always on desktop, conditionally on mobile */}
            <nav className={`space-y-1.5 ${mobileMenuOpen ? 'block' : 'hidden md:block'}`}>
              {visibleMenu.map((item) => {
                const Icon = item.icon;
                const isSelected = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/10'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

          </div>

          {/* Footer logout & User info */}
          <div className={`mt-8 pt-4 border-t border-slate-800/80 space-y-4 ${mobileMenuOpen ? 'block' : 'hidden md:block'}`}>
            <div className="flex items-center gap-2.5">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-9 h-9 rounded-full border border-slate-700/50"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">{currentUser.name}</span>
                <span className="text-[10px] text-slate-400 block truncate">{currentUser.email}</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700/80 text-white hover:text-red-400 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </aside>

        {/* 3. CORE WORKSPACE ROUTER SCREEN */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto w-full">
          
          {/* Seeding State Alert */}
          {seeding && (
            <div className="mb-6 p-4 bg-cyan-950/20 text-cyan-400 border border-cyan-500/30 rounded-xl flex items-center gap-3 text-xs">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Génération de la structure du stock de départ, fournisseurs et clients...</span>
            </div>
          )}

          {/* Route views mapping */}
          {activeTab === 'dashboard' && (
            <Dashboard
              products={products}
              movements={movements}
              sales={sales}
              purchases={purchases}
              expenses={expenses}
              categories={categories}
              suppliers={suppliers}
              clients={clients}
              auditLogs={auditLogs}
              onNavigate={(tab, filter) => {
                setActiveTab(tab);
                if (tab === 'products') setProductFilter(filter || 'all');
              }}
              currencySymbol={currencySymbol}
            />
          )}

          {activeTab === 'products' && (
            <Products
              products={products}
              warehouses={warehouses}
              suppliers={suppliers}
              categories={categories}
              brands={brands}
              user={currentUser}
              onRefresh={reloadCatalog}
              currencySymbol={currencySymbol}
              initialStatus={productFilter}
              writePerms={settings?.writePermissions}
            />
          )}

          {activeTab === 'pos' && (
            <POS
              products={products}
              clients={clients}
              user={currentUser}
              onRefresh={reloadAfterSale}
              currencySymbol={currencySymbol}
              company={{
                name: settings?.companyName,
                address: settings?.address,
                phone: settings?.phone,
                taxId: settings?.taxId,
              }}
            />
          )}

          {activeTab === 'receivables' && (
            <Receivables
              sales={sales}
              clients={clients}
              user={currentUser}
              onRefresh={reloadAfterSale}
            />
          )}

          {activeTab === 'partners' && (
            <Partners
              suppliers={suppliers}
              clients={clients}
              products={products}
              supplierProducts={supplierProducts}
              user={currentUser}
              onRefresh={reloadPartners}
              onRefreshSupplierProducts={reloadSupplierProducts}
              onRefreshProducts={reloadProducts}
              currencySymbol={currencySymbol}
              writePerms={settings?.writePermissions}
            />
          )}

          {activeTab === 'purchases' && (
            <Purchases
              purchases={purchases}
              suppliers={suppliers}
              products={products}
              supplierProducts={supplierProducts}
              user={currentUser}
              onRefresh={reloadAfterPurchase}
              writePerms={settings?.writePermissions}
            />
          )}

          {activeTab === 'reorder' && (
            <Reorder
              products={products}
              suppliers={suppliers}
              purchases={purchases}
              user={currentUser}
              onRefresh={reloadPurchases}
              onNavigate={(tab) => setActiveTab(tab)}
              writePerms={settings?.writePermissions}
            />
          )}

          {activeTab === 'expenses' && (
            <Expenses
              expenses={expenses}
              suppliers={suppliers}
              user={currentUser}
              onRefresh={reloadExpenses}
              writePerms={settings?.writePermissions}
            />
          )}

          {activeTab === 'deliveries' && (
            <Deliveries
              deliveries={deliveries}
              clients={clients}
              user={currentUser}
              onRefresh={reloadDeliveries}
              currencySymbol={currencySymbol}
              writePerms={settings?.writePermissions}
            />
          )}

          {activeTab === 'audits' && (
            <Audits
              products={products}
              warehouses={warehouses}
              audits={audits}
              user={currentUser}
              onRefresh={reloadAfterAudit}
              currencySymbol={currencySymbol}
              writePerms={settings?.writePermissions}
            />
          )}

          {activeTab === 'movements' && (
            <Movements
              movements={movements}
              products={products}
              warehouses={warehouses}
              onRefresh={() => {}}
              currencySymbol={currencySymbol}
            />
          )}

          {activeTab === 'calendar' && (
            <Calendar
              deliveries={deliveries}
              purchases={purchases}
              sales={sales}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'accounting' && (
            <Accounting
              sales={sales}
              purchases={purchases}
              expenses={expenses}
              products={products}
            />
          )}

          {activeTab === 'users' && (
            <UsersAdmin
              users={usersList}
              currentUser={currentUser}
              onRefresh={reloadUsers}
            />
          )}

          {activeTab === 'settings' && (
            <Settings
              settings={settings}
              user={currentUser}
              onRefresh={reloadSettings}
              currencySymbol={currencySymbol}
              setCurrencySymbol={setCurrencySymbol}
              theme={theme}
              setTheme={setTheme}
            />
          )}

        </main>

      </div>
      <NotificationCenter auditLogs={auditLogs} />
      <DialogHost />
    </div>
    </CurrencyProvider>
  );
}
