import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  Layers,
  ShoppingBag,
  Bell,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  Archive,
  ChevronRight,
  Star,
  Award,
  Crown,
  Wallet,
  X
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Product, StockMovement, Category, Supplier, Client, AuditLog, Sale, Purchase, Expense } from '../types';
import { useMoney } from '../services/CurrencyContext';
import AiSummaryCard from './AiSummaryCard';

interface DashboardProps {
  products: Product[];
  movements: StockMovement[];
  categories: Category[];
  suppliers: Supplier[];
  clients: Client[];
  auditLogs: AuditLog[];
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  onNavigate: (tab: string, filter?: string) => void;
  currencySymbol: string;
}

export default function Dashboard({
  products,
  movements,
  categories,
  suppliers,
  clients,
  auditLogs,
  sales,
  purchases,
  expenses,
  onNavigate,
  currencySymbol
}: DashboardProps) {
  const { format } = useMoney();

  // Période des classements commerciaux (meilleures ventes / clients).
  const [periodDays, setPeriodDays] = React.useState(30);
  // Détail du solde (modale ouverte au clic sur le bloc Solde).
  const [showSolde, setShowSolde] = React.useState(false);

  // 1. Calculations
  const metrics = useMemo(() => {
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let expiredCount = 0;

    products.forEach((p) => {
      totalValue += p.quantity * p.purchasePrice;
      if (p.quantity === 0) outOfStockCount++;
      else if (p.quantity <= p.minStock) lowStockCount++;

      if (p.expirationDate && new Date(p.expirationDate) < new Date()) {
        expiredCount++;
      }
    });

    // CA net : les avoirs (montants négatifs) se déduisent naturellement.
    const totalSales = sales.reduce((acc, s) => acc + s.totalAmount, 0);
    // Nombre de ventes : on ne compte pas les avoirs comme des transactions.
    const totalTransactions = sales.filter((s) => s.type !== 'return').length;

    return {
      totalValue,
      lowStockCount,
      outOfStockCount,
      expiredCount,
      totalSales,
      totalTransactions,
      totalProducts: products.length
    };
  }, [products, sales]);

  // 2. Chart: Stock by Category
  const categoryChartData = useMemo(() => {
    const map: Record<string, { name: string; value: number }> = {};
    
    products.forEach((p) => {
      const catName = p.categoryName || 'Autre';
      if (!map[catName]) {
        map[catName] = { name: catName, value: 0 };
      }
      map[catName].value += p.quantity;
    });

    return Object.values(map);
  }, [products]);

  // COLORS for pie
  const COLORS = ['#0047ab', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  // 3. Chart: Movements volume last 5 movements
  const movementChartData = useMemo(() => {
    // Group movements by date of last 7 days
    const days: Record<string, { date: string; entries: number; exits: number }> = {};
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    last7Days.forEach(day => {
      days[day] = { date: day.slice(5), entries: 0, exits: 0 };
    });

    movements.forEach(m => {
      // createdAt peut être ISO ("2026-07-23T…") ou timestamp Postgres ("2026-07-23 …").
      // Les 10 premiers caractères donnent la date (YYYY-MM-DD) dans les deux cas.
      const day = (m.createdAt || '').slice(0, 10);
      if (days[day]) {
        if (m.type === 'entry_reception' || m.type === 'entry_return') {
          days[day].entries += m.quantity;
        } else if (m.type === 'exit_sale') {
          days[day].exits += m.quantity;
        }
      }
    });

    return Object.values(days);
  }, [movements]);

  // 4. Low stock details
  const lowStockProducts = useMemo(() => {
    return products
      .filter((p) => p.quantity <= p.minStock)
      .slice(0, 5);
  }, [products]);

  // 5. Recent audit logs
  const recentLogs = useMemo(() => {
    return [...auditLogs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
  }, [auditLogs]);

  // Ventes sur la période choisie (base des classements « meilleures ventes / clients »).
  const salesInPeriod = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    return sales.filter((s) => new Date(s.createdAt) >= cutoff);
  }, [sales, periodDays]);

  // Bilan recettes / dépenses (achats fournisseurs + frais divers) sur la période.
  const finance = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    const periodSales = sales.filter((s) => new Date(s.createdAt) >= cutoff);
    const ventes = periodSales.filter((s) => s.type !== 'return');
    const avoirs = periodSales.filter((s) => s.type === 'return');
    const brut = ventes.reduce((a, s) => a + (Number(s.totalAmount) || 0), 0);
    const remboursements = avoirs.reduce((a, s) => a + Math.abs(Number(s.totalAmount) || 0), 0);
    const recettes = brut - remboursements; // net des avoirs
    const periodPurch = purchases.filter((p) => p.status !== 'cancelled' && new Date(p.createdAt) >= cutoff);
    const achats = periodPurch.reduce((a, p) => a + (Number(p.totalAmount) || 0), 0);
    const periodExp = expenses.filter((e) => new Date(e.date || e.createdAt) >= cutoff);
    const divers = periodExp.reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const depenses = achats + divers;
    return { recettes, brut, remboursements, achats, divers, depenses, solde: recettes - depenses, periodPurch, periodExp };
  }, [sales, purchases, expenses, periodDays]);

  // 6. Top produits vendus (quantité + chiffre d'affaires) sur 30 jours.
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; sku: string; qty: number; revenue: number }> = {};
    salesInPeriod.forEach((s) => {
      (s.items || []).forEach((it: any) => {
        const key = it.productId || it.sku || it.productName;
        if (!key) return;
        if (!map[key]) map[key] = { name: it.productName || 'Article', sku: it.sku || '', qty: 0, revenue: 0 };
        map[key].qty += Number(it.quantity) || 0;
        map[key].revenue += Number(it.total ?? (it.quantity || 0) * (it.unitPrice || 0)) || 0;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [salesInPeriod]);

  const maxTopQty = Math.max(1, ...topProducts.map((p) => p.qty));

  // 7. Top clients par chiffre d'affaires cumulé sur 30 jours.
  const topClients = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    salesInPeriod.forEach((s) => {
      const key = s.clientId || s.clientName || 'inconnu';
      if (!map[key]) map[key] = { name: s.clientName || 'Client', total: 0, count: 0 };
      map[key].total += Number(s.totalAmount) || 0; // les avoirs déduisent le CA client
      if (s.type !== 'return') map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [salesInPeriod]);

  const rankColors = ['text-amber-500', 'text-slate-400', 'text-orange-700', 'text-slate-400', 'text-slate-400'];

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-slate-50 to-cyan-50/60 dark:from-slate-900/60 dark:to-cyan-950/20 p-6 rounded-2xl border border-slate-200 dark:border-slate-200/10 backdrop-blur-md shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Tableau de Bord Stratégique</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Suivi opérationnel des flux logistiques, valorisation des entrepôts et indicateurs de performance.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onNavigate('pos')}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-xs rounded-lg transition duration-150 cursor-pointer flex items-center gap-1.5"
          >
            <ShoppingBag className="w-4 h-4" />
            Lancer POS Vente
          </button>
          <button
            onClick={() => onNavigate('products')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition duration-150 cursor-pointer flex items-center gap-1.5 border border-slate-700/60"
          >
            <Package className="w-4 h-4" />
            Nouveau Produit
          </button>
        </div>
      </div>

      {/* Résumé d'activité généré par l'IA */}
      <AiSummaryCard />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        
        {/* Metric 1 */}
        <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1 min-w-0">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">Valorisation de Stock</span>
            <h3 className="text-xl font-bold font-mono text-slate-900 dark:text-white break-words [overflow-wrap:anywhere] leading-tight">
              {format(metrics.totalValue)}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-emerald-500">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Valeur d'achat cumulée</span>
            </div>
          </div>
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 rounded-xl shrink-0">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1 min-w-0">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">Chiffre POS (Ventes)</span>
            <h3 className="text-xl font-bold font-mono text-slate-900 dark:text-white break-words [overflow-wrap:anywhere] leading-tight">
              {format(metrics.totalSales)}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-indigo-400">
              <Layers className="w-3.5 h-3.5" />
              <span>{metrics.totalTransactions} transactions comptabilisées</span>
            </div>
          </div>
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-xl shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3 — cliquable : voir les produits en rupture */}
        <button
          type="button"
          onClick={() => onNavigate('products', 'out_of_stock')}
          className="text-left bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex items-center justify-between cursor-pointer hover:border-amber-500/50 hover:shadow-md transition group"
        >
          <div className="space-y-1 min-w-0">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">Alertes Rupture</span>
            <h3 className="text-2xl font-bold font-mono text-amber-500">
              {metrics.lowStockCount + metrics.outOfStockCount}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-amber-500/80 group-hover:text-amber-500">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{metrics.outOfStockCount} en rupture — voir</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl animate-pulse shrink-0">
            <Bell className="w-5 h-5" />
          </div>
        </button>

        {/* Metric 4 — cliquable : voir les produits périmés */}
        <button
          type="button"
          onClick={() => onNavigate('products', 'expired')}
          className="text-left bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex items-center justify-between cursor-pointer hover:border-red-500/50 hover:shadow-md transition group"
        >
          <div className="space-y-1 min-w-0">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">Produits Périmés</span>
            <h3 className="text-2xl font-bold font-mono text-red-500">
              {metrics.expiredCount}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-red-400 group-hover:text-red-500">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Expirés — voir</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl shrink-0">
            <Archive className="w-5 h-5" />
          </div>
        </button>

      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart 1: Bar Movements */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Activité de Stock Hebdomadaire</h4>
              <p className="text-[11px] text-slate-400">Volumes cumulés des entrées réceptions vs sorties ventes</p>
            </div>
            <div className="flex gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block"></span> Entrées</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span> Sorties</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={movementChartData}>
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '8px',
                    border: 'none',
                    color: '#fff',
                    fontSize: '11px'
                  }}
                />
                <Bar dataKey="entries" fill="#0047ab" radius={[4, 4, 0, 0]} />
                <Bar dataKey="exits" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Category Pie */}
        <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Répartition par Catégorie</h4>
            <p className="text-[11px] text-slate-400">Volume de stock actuel regroupé par catégorie d'article</p>
          </div>
          <div className="h-48 w-full flex justify-center items-center relative my-3">
            {categoryChartData.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune donnée</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderRadius: '8px',
                      border: 'none',
                      color: '#fff',
                      fontSize: '11px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 border-t border-slate-200 dark:border-slate-800/60 pt-3">
            {categoryChartData.slice(0, 4).map((item, index) => (
              <div key={item.name} className="flex items-center gap-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                <span className="truncate">{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Section: Performance commerciale (période configurable 7/30/90 jours) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-cyan-500" />
            Performance commerciale
          </h3>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setPeriodDays(d)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                  periodDays === d
                    ? 'bg-cyan-500 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {d} j
              </button>
            ))}
          </div>
        </div>

        {/* Bande Recettes / Dépenses / Solde sur la période */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
            <span className="text-[10px] uppercase font-mono text-slate-400 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" />Recettes (ventes)</span>
            <h3 className="text-xl font-bold font-mono text-emerald-500 mt-1 break-words [overflow-wrap:anywhere] leading-tight">{format(finance.recettes)}</h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('expenses')}
            className="text-left bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm cursor-pointer hover:border-red-500/40 hover:shadow-md transition"
          >
            <span className="text-[10px] uppercase font-mono text-slate-400 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5 text-red-500" />Dépenses</span>
            <h3 className="text-xl font-bold font-mono text-red-500 mt-1 break-words [overflow-wrap:anywhere] leading-tight">{format(finance.depenses)}</h3>
            <p className="text-[10px] text-slate-400 font-mono mt-1">Achats {format(finance.achats)} · Frais {format(finance.divers)}</p>
          </button>
          <button
            type="button"
            onClick={() => setShowSolde(true)}
            className="text-left bg-white dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm cursor-pointer hover:border-cyan-500/40 hover:shadow-md transition"
          >
            <span className="text-[10px] uppercase font-mono text-slate-400 flex items-center justify-between">
              Solde (recettes − dépenses)
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </span>
            <h3 className={`text-xl font-bold font-mono mt-1 break-words [overflow-wrap:anywhere] leading-tight ${finance.solde >= 0 ? 'text-cyan-500' : 'text-red-500'}`}>{format(finance.solde)}</h3>
            <p className="text-[10px] text-slate-400 font-mono mt-1">Détail du calcul</p>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top produits vendus */}
          <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-500" />
                  Meilleures ventes
                </h4>
                <p className="text-[11px] text-slate-400">Produits les plus vendus sur les {periodDays} derniers jours</p>
              </div>
              <button
                onClick={() => onNavigate('products')}
                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 cursor-pointer"
              >
                Voir tout <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2.5">
              {topProducts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Aucune vente sur les {periodDays} derniers jours.
                </div>
              ) : (
                topProducts.map((p, i) => (
                  <div key={`${p.sku}-${i}`} className="p-3 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-xl">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold font-mono text-slate-400 w-4 shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">{p.name}</span>
                          <span className="text-[9px] font-mono text-slate-400">{p.sku}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-bold text-cyan-500 block">{p.qty} vendus</span>
                        <span className="text-[10px] font-mono text-slate-400">{format(p.revenue)}</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-2">
                      <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${Math.round((p.qty / maxTopQty) * 100)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top clients */}
          <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-500" />
                  Meilleurs clients
                </h4>
                <p className="text-[11px] text-slate-400">Chiffre d'affaires cumulé sur les {periodDays} derniers jours</p>
              </div>
              <button
                onClick={() => onNavigate('partners')}
                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 cursor-pointer"
              >
                Voir tout <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2.5">
              {topClients.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Aucun client sur les {periodDays} derniers jours.
                </div>
              ) : (
                topClients.map((c, i) => (
                  <div
                    key={`${c.name}-${i}`}
                    className="p-3 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {i < 3 ? (
                        <Crown className={`w-4 h-4 shrink-0 ${rankColors[i]}`} />
                      ) : (
                        <span className="text-xs font-bold font-mono text-slate-400 w-4 text-center shrink-0">{i + 1}</span>
                      )}
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{c.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-emerald-500 block">{format(c.total)}</span>
                      <span className="text-[10px] text-slate-400">{c.count} achat(s)</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Low Stock Alert and Recent Activity logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Low Stock Panel */}
        <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Alertes de Réapprovisionnement</h4>
              <p className="text-[11px] text-slate-400">Articles proches ou en deçà du niveau de sécurité</p>
            </div>
            <button
              onClick={() => onNavigate('products')}
              className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 cursor-pointer"
            >
              Voir tout <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5">
            {lowStockProducts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                ✔ Tout est au vert. Aucun réapprovisionnement nécessaire.
              </div>
            ) : (
              lowStockProducts.map((p) => {
                const percentage = Math.min(100, Math.round((p.quantity / p.minStock) * 100));
                return (
                  <div
                    key={p.id}
                    className="p-3 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-xl flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{p.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 font-mono rounded">
                          {p.sku}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                        <span>Stock: <strong className="text-slate-900 dark:text-slate-300 font-mono">{p.quantity}</strong></span>
                        <span>•</span>
                        <span>Seuil: <strong className="font-mono">{p.minStock}</strong></span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[10px] font-mono text-amber-500">{percentage}% du seuil</span>
                      <div className="w-20 bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
                        <div
                          className="bg-amber-500 h-full rounded-full"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Security Audit Trail Panel */}
        <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Registre d'Audit de Sécurité</h4>
              <p className="text-[11px] text-slate-400">Historique inaltérable des actions utilisateur</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 font-mono rounded">
              Conforme RGPD
            </span>
          </div>

          <div className="space-y-2.5">
            {recentLogs.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">Aucun log enregistré.</p>
            ) : (
              recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-xl flex gap-3 items-start"
                >
                  <div className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-800 dark:text-slate-200 leading-snug">
                      <strong className="text-slate-900 dark:text-slate-100">{log.userName}</strong>:{' '}
                      {log.action}
                    </p>
                    <div className="flex gap-2 items-center mt-1.5 text-[9px] text-slate-400 font-mono">
                      <span className="text-cyan-400 uppercase">{log.module}</span>
                      <span>•</span>
                      <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Modale : détail du solde (pourquoi il est positif / négatif) */}
      {showSolde && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSolde(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in text-xs flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-cyan-500" />Détail du solde</h3>
                <p className="text-[10px] text-slate-400">Sur les {periodDays} derniers jours</p>
              </div>
              <button onClick={() => setShowSolde(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Équation */}
              <div className="space-y-1.5 font-mono">
                <div className="flex justify-between text-emerald-500">
                  <span>Recettes (ventes){finance.remboursements > 0 ? ', nettes des avoirs' : ''}</span>
                  <span className="font-bold">{format(finance.recettes)}</span>
                </div>
                {finance.remboursements > 0 && (
                  <div className="flex justify-between text-slate-400 pl-3 text-[10px]">
                    <span>ventes brutes {format(finance.brut)} − avoirs {format(finance.remboursements)}</span>
                  </div>
                )}
                <div className="flex justify-between text-red-500">
                  <span>− Achats fournisseurs</span>
                  <span className="font-bold">{format(finance.achats)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>− Frais divers</span>
                  <span className="font-bold">{format(finance.divers)}</span>
                </div>
                <div className={`flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5 mt-1 text-sm font-bold ${finance.solde >= 0 ? 'text-cyan-500' : 'text-red-500'}`}>
                  <span>= Solde</span>
                  <span>{format(finance.solde)}</span>
                </div>
              </div>

              {/* Explication */}
              <div className={`p-3 rounded-lg text-[11px] leading-relaxed ${finance.solde >= 0 ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'bg-red-500/10 text-red-600 dark:text-red-300'}`}>
                {finance.solde >= 0
                  ? 'Les recettes couvrent les dépenses sur la période : le solde est positif.'
                  : 'Le solde est négatif car les dépenses (achats de stock + frais) dépassent les recettes sur la période. C\'est fréquent après un réapprovisionnement : le stock acheté n\'a pas encore été vendu. Le solde se redresse à mesure que ces achats se convertissent en ventes.'}
              </div>

              {/* Achats de la période */}
              {finance.periodPurch.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] uppercase font-mono text-slate-400">Achats de la période ({finance.periodPurch.length})</span>
                    <button onClick={() => { setShowSolde(false); onNavigate('purchases'); }} className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5">Voir <ChevronRight className="w-3 h-3" /></button>
                  </div>
                  <div className="space-y-1">
                    {[...finance.periodPurch].sort((a, b) => (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0)).slice(0, 4).map((p) => (
                      <div key={p.id} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-lg">
                        <span className="truncate text-slate-600 dark:text-slate-300">{p.supplierName || 'Fournisseur'}</span>
                        <span className="font-mono text-red-500 shrink-0 ml-2">{format(Number(p.totalAmount) || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Frais divers de la période */}
              {finance.periodExp.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] uppercase font-mono text-slate-400">Frais divers ({finance.periodExp.length})</span>
                    <button onClick={() => { setShowSolde(false); onNavigate('expenses'); }} className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5">Voir <ChevronRight className="w-3 h-3" /></button>
                  </div>
                  <div className="space-y-1">
                    {[...finance.periodExp].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 4).map((e) => (
                      <div key={e.id} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-lg">
                        <span className="truncate text-slate-600 dark:text-slate-300">{e.label || e.category}</span>
                        <span className="font-mono text-red-500 shrink-0 ml-2">{format(Number(e.amount) || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
