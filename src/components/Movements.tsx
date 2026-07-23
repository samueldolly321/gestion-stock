import React, { useState, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  SlidersHorizontal,
  Calendar,
  Layers,
  Search,
  RefreshCw,
  Trash2,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { StockMovement, Product, Warehouse } from '../types';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import Pagination, { usePagination } from './Pagination';

interface MovementsProps {
  movements: StockMovement[];
  products: Product[];
  warehouses: Warehouse[];
  onRefresh: () => void;
  currencySymbol: string;
}

export default function Movements({
  movements,
  products,
  warehouses,
  onRefresh,
  currencySymbol
}: MovementsProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const typeLabel = (t: StockMovement['type']) =>
    t === 'entry_reception' ? 'ENTRÉE'
    : t === 'entry_return' ? 'RETOUR'
    : t === 'exit_sale' ? 'SORTIE'
    : t === 'waste_loss' ? 'PERTE'
    : t === 'adjustment' ? 'AJUSTEMENT'
    : t === 'transfer' ? 'TRANSFERT'
    : String(t).toUpperCase();

  // Export du registre en PDF (paysage) ou Excel (.xlsx), avec en-tête coloré.
  const handleExport = (fmt: 'pdf' | 'excel') => {
    if (filteredMovements.length === 0) return;
    const name = (m: StockMovement) => products.find((p) => p.id === m.productId)?.name || m.productName || 'N/A';
    const sku = (m: StockMovement) => products.find((p) => p.id === m.productId)?.sku || m.sku || 'N/A';
    const wh = (m: StockMovement) => warehouses.find((w) => w.id === m.warehouseId)?.name || 'Central';
    const columns = [
      { label: 'ID', value: (m: StockMovement) => m.id },
      { label: 'Type', value: (m: StockMovement) => typeLabel(m.type) },
      { label: 'Article', value: (m: StockMovement) => name(m) },
      { label: 'SKU', value: (m: StockMovement) => sku(m) },
      { label: 'Entrepôt', value: (m: StockMovement) => wh(m) },
      { label: 'Quantité', value: (m: StockMovement) => m.quantity },
      { label: 'Motif', value: (m: StockMovement) => m.reason },
      { label: 'Auteur', value: (m: StockMovement) => m.performedBy },
      { label: 'Date', value: (m: StockMovement) => new Date(m.createdAt).toLocaleString() },
    ];
    if (fmt === 'excel') exportExcel('mouvements_stock', 'Mouvements', columns, filteredMovements);
    else exportPdf('mouvements_stock', 'Historique des Flux de Stock', columns, filteredMovements);
  };

  // Filters movements
  const filteredMovements = useMemo(() => {
    return movements
      .filter((m) => {
        const prod = products.find((p) => p.id === m.productId);
        const pName = prod?.name || m.productName || '';
        const pSku = prod?.sku || m.sku || '';

        const matchSearch =
          pName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.id.toLowerCase().includes(searchTerm.toLowerCase());

        const matchType = filterType === 'all' || m.type === filterType;

        return matchSearch && matchType;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [movements, products, searchTerm, filterType]);

  const movementsPage = usePagination<StockMovement>(filteredMovements);

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Registre Historique des Flux (Traçabilité)</h2>
          <p className="text-xs text-slate-400">Suivi inaltérable de tous les flux physiques d'entrée, de sortie et de transfert.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleExport('pdf')}
            disabled={movements.length === 0}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 disabled:opacity-40 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5 transition"
          >
            <Download className="w-4 h-4 text-red-500" />
            Exporter PDF
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={movements.length === 0}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 disabled:opacity-40 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer flex items-center gap-1.5 transition"
          >
            <Download className="w-4 h-4 text-green-700" />
            Exporter Excel
          </button>
          <button
            onClick={onRefresh}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700/60 cursor-pointer"
            title="Actualiser"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-white dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Rechercher par article, SKU, ID de mouvement..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-slate-950/20 text-xs py-2 px-9 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter type selector */}
        <div className="w-full sm:w-48">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full bg-white dark:bg-slate-950/20 text-xs py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="all">Tous types de flux</option>
            <option value="entry_reception">Entrées (Réceptions)</option>
            <option value="entry_return">Retours (Avoirs)</option>
            <option value="exit_sale">Sorties (Ventes POS)</option>
            <option value="waste_loss">Casse & Pertes (Rebut)</option>
            <option value="adjustment">Ajustements physiques</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">ID Flux</th>
                <th className="py-3 px-4 text-center">Type</th>
                <th className="py-3 px-4">Article / Spécification</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Dépôt</th>
                <th className="py-3 px-4 text-center">Quantité</th>
                <th className="py-3 px-4">Motif opérationnel</th>
                <th className="py-3 px-4">Auteur</th>
                <th className="py-3 px-4 text-right">Horodatage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs text-slate-600 dark:text-gray-300">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Aucun enregistrement de flux de stock répertorié.
                  </td>
                </tr>
              ) : (
                movementsPage.paged.map((m) => {
                  const pObj = products.find((prod) => prod.id === m.productId);
                  const pName = pObj?.name || m.productName || 'Article inconnu';
                  const pSku = pObj?.sku || m.sku || 'N/A';
                  const whName = warehouses.find((w) => w.id === m.warehouseId)?.name || 'Central';

                  return (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/10 transition duration-150">
                      <td className="py-3.5 px-4 font-mono font-bold text-[11px] text-cyan-400">
                        {m.id}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-semibold rounded ${
                            m.type === 'entry_reception'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : m.type === 'entry_return'
                              ? 'bg-orange-500/10 text-orange-500'
                              : m.type === 'exit_sale'
                              ? 'bg-indigo-500/10 text-indigo-400'
                              : m.type === 'waste_loss'
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-amber-500/10 text-amber-500'
                          }`}
                        >
                          {m.type === 'entry_reception' && <ArrowDownLeft className="w-3 h-3 text-emerald-400" />}
                          {m.type === 'entry_return' && <ArrowDownLeft className="w-3 h-3 text-orange-500" />}
                          {m.type === 'exit_sale' && <ArrowUpRight className="w-3 h-3 text-indigo-400" />}
                          {m.type === 'entry_reception' && 'ENTRÉE'}
                          {m.type === 'entry_return' && 'RETOUR'}
                          {m.type === 'exit_sale' && 'SORTIE'}
                          {m.type === 'waste_loss' && 'PERTE'}
                          {m.type === 'adjustment' && 'AJUSTEMENT'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {pName}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                        {pSku}
                      </td>
                      <td className="py-3.5 px-4">
                        {whName}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold">
                        <span
                          className={
                            m.quantity >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }
                        >
                          {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs truncate" title={m.reason}>
                        {m.reason}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {m.performedBy}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[10px] text-slate-400 font-mono">
                        {new Date(m.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={movementsPage.page}
          pageCount={movementsPage.pageCount}
          total={movementsPage.total}
          from={movementsPage.from}
          to={movementsPage.to}
          onChange={movementsPage.setPage}
        />
      </div>

    </div>
  );
}
