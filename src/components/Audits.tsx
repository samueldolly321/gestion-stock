import React, { useState, useMemo } from 'react';
import {
  FileCheck,
  Plus,
  Play,
  CheckCircle,
  AlertTriangle,
  ClipboardList,
  Eye,
  Warehouse,
  Check,
  TrendingUp,
  XCircle,
  Download
} from 'lucide-react';
import { Product, InventoryAudit, Warehouse as WarehouseType, User, AuditItem } from '../types';
import { createAudit, validateAudit, cancelAudit } from '../services/auditsService';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import { exportPdf } from '../services/exportPdf';
import { exportExcel } from '../services/exportExcel';
import Pagination, { usePagination } from './Pagination';
import { canWrite as hasWritePerm } from '../services/permissions';

interface AuditsProps {
  products: Product[];
  warehouses: WarehouseType[];
  audits: InventoryAudit[];
  user: User;
  onRefresh: () => void;
  currencySymbol: string;
  writePerms?: Record<string, string[]> | null;
}

export default function Audits({
  products,
  warehouses,
  audits,
  user,
  onRefresh,
  currencySymbol,
  writePerms
}: AuditsProps) {
  const [isNewAuditOpen, setIsNewAuditOpen] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(warehouses[0]?.id || '');
  const [auditTitle, setAuditTitle] = useState('');

  // Active auditing record
  const [activeAudit, setActiveAudit] = useState<InventoryAudit | null>(null);
  const [countedQuantities, setCountedQuantities] = useState<Record<string, number>>({});
  const [auditNotes, setAuditNotes] = useState<Record<string, string>>({});

  // View completed audit modal
  const [viewAudit, setViewAudit] = useState<InventoryAudit | null>(null);

  const canWrite = useMemo(() => hasWritePerm(user.role, 'audits', writePerms), [user.role, writePerms]);

  // Create audit session
  const handleCreateAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditTitle) return;

    const wh = warehouses.find((w) => w.id === selectedWarehouseId);
    // Produits du dépôt choisi (ou tous si aucun dépôt sélectionné).
    const whProducts = selectedWarehouseId
      ? products.filter((p) => p.locationId === selectedWarehouseId)
      : products;

    const auditItems: AuditItem[] = whProducts.map((p) => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      expectedQuantity: p.quantity,
      actualQuantity: p.quantity, // default to match
      diff: 0
    }));

    try {
      const created = await createAudit({
        title: auditTitle,
        warehouseId: selectedWarehouseId || undefined,
        warehouseName: wh?.name || undefined,
        items: auditItems,
      });
      setIsNewAuditOpen(false);
      setAuditTitle('');

      // Load into active session
      setActiveAudit(created);
      const initialCounts: Record<string, number> = {};
      auditItems.forEach((item) => {
        initialCounts[item.productId] = item.expectedQuantity;
      });
      setCountedQuantities(initialCounts);

      onRefresh();
      showToast('Session d\'inventaire démarrée.', { title: 'Audits' });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors du démarrage de l\'audit.', { variant: 'error' });
    }
  };

  // Change count on item
  const handleCountChange = (productId: string, val: number) => {
    setCountedQuantities({
      ...countedQuantities,
      [productId]: Math.max(0, val)
    });
  };

  const handleNotesChange = (productId: string, val: string) => {
    setAuditNotes({
      ...auditNotes,
      [productId]: val
    });
  };

  // Validate / Submit active audit
  const handleValidateAudit = async () => {
    if (!activeAudit) return;
    if (!(await showConfirm('Voulez-vous finaliser cet inventaire et ajuster automatiquement les stocks dans la base de données ?', { title: 'Finaliser l\'inventaire', variant: 'info', confirmText: 'Finaliser' }))) return;

    try {
      const updatedItems: AuditItem[] = activeAudit.items.map((item) => {
        const counted = countedQuantities[item.productId] ?? item.expectedQuantity;
        const diff = counted - item.expectedQuantity;
        return {
          ...item,
          actualQuantity: counted,
          diff,
          notes: auditNotes[item.productId] || ''
        };
      });

      // Le serveur applique les ajustements de stock et clôture l'inventaire (transaction).
      await validateAudit(activeAudit.id, updatedItems);

      setActiveAudit(null);
      setCountedQuantities({});
      setAuditNotes({});
      onRefresh();
      showToast('Inventaire validé, stocks ajustés.', { title: 'Audits' });
    } catch (err: any) {
      console.error(err);
      showAlert(err?.message || 'Erreur lors de la validation de l\'inventaire.', { variant: 'error' });
    }
  };

  // Cancel active audit session
  const handleCancelAudit = async () => {
    if (!activeAudit) return;
    if (!(await showConfirm('Annuler la session d\'audit en cours ? Aucune modification ne sera enregistrée.', { title: 'Annuler l\'audit', confirmText: 'Annuler l\'audit', cancelText: 'Continuer' }))) return;

    try {
      await cancelAudit(activeAudit.id);
      setActiveAudit(null);
      onRefresh();
      showToast('Session d\'audit annulée.', { title: 'Audits', type: 'info' });
    } catch (err) {
      console.error(err);
    }
  };

  const auditsPage = usePagination<InventoryAudit>(audits);

  const handleExport = (fmt: 'pdf' | 'excel') => {
    const columns = [
      { label: 'ID', value: (a: InventoryAudit) => a.id },
      { label: 'Titre', value: (a: InventoryAudit) => a.title },
      { label: 'Entrepôt', value: (a: InventoryAudit) => a.warehouseName || '' },
      { label: 'Auditeur', value: (a: InventoryAudit) => a.auditorName || '' },
      { label: 'Statut', value: (a: InventoryAudit) => (a.status === 'completed' ? 'Validé' : 'Brouillon') },
      { label: 'Créé le', value: (a: InventoryAudit) => new Date(a.createdAt).toLocaleString() },
      { label: 'Références', value: (a: InventoryAudit) => a.items?.length || 0 },
    ];
    if (fmt === 'excel') exportExcel('audits_inventaire', 'Audits', columns, audits);
    else exportPdf('audits_inventaire', 'Audits d\'Inventaire', columns, audits);
    showToast(`${audits.length} audit(s) exporté(s) (${fmt.toUpperCase()}).`, { title: 'Export' });
  };

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Audits d'Inventaire & Ajustements</h2>
          <p className="text-xs text-slate-400">Contrôlez la justesse physique de vos rayons et harmonisez les écarts d'inventaire.</p>
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
          {canWrite && !activeAudit && (
            <button
              onClick={() => setIsNewAuditOpen(true)}
              className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 transition duration-150"
            >
              <Plus className="w-4 h-4" />
              Lancer un Inventaire
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE AUDIT SESSION WINDOW */}
      {activeAudit && (
        <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950/40 rounded-2xl border border-cyan-500/30 shadow-lg space-y-4 animate-scale-up text-xs">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 font-mono rounded">Session d'Audit Active</span>
              <h3 className="text-lg font-bold text-white mt-1.5">{activeAudit.title}</h3>
              <p className="text-slate-400 text-xs flex items-center gap-1 mt-1">
                <Warehouse className="w-3.5 h-3.5" />
                Dépôt : {activeAudit.warehouseName} | Auditeur : {activeAudit.auditorName}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCancelAudit}
                className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-300 font-semibold rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                Abandonner
              </button>
              <button
                onClick={handleValidateAudit}
                className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg cursor-pointer flex items-center gap-1.5 shadow-md"
              >
                <Check className="w-4 h-4" />
                Valider & Ajuster Stocks
              </button>
            </div>
          </div>

          {/* Counts Input Table */}
          <div className="bg-white dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/65 text-[10px] font-mono text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <th className="p-3">Produit</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3 text-center">Quantité Attendue (Système)</th>
                  <th className="p-3 text-center">Quantité Physique Comptée</th>
                  <th className="p-3 text-center">Écart détecté</th>
                  <th className="p-3">Observations / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
                {activeAudit.items.map((item) => {
                  const counted = countedQuantities[item.productId] ?? item.expectedQuantity;
                  const diff = counted - item.expectedQuantity;
                  return (
                    <tr key={item.productId} className="hover:bg-slate-50 dark:hover:bg-slate-900/10">
                      <td className="p-3 font-semibold text-slate-900 dark:text-white">{item.productName}</td>
                      <td className="p-3 font-mono text-[11px] text-cyan-400">{item.sku}</td>
                      <td className="p-3 text-center font-mono">{item.expectedQuantity}</td>
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min={0}
                          value={counted}
                          onChange={(e) => handleCountChange(item.productId, Number(e.target.value))}
                          className="w-20 bg-white dark:bg-slate-950/60 p-1 rounded border border-slate-200 dark:border-slate-800 text-center text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-mono font-bold"
                        />
                      </td>
                      <td className="p-3 text-center font-mono font-bold">
                        <span
                          className={
                            diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-400' : 'text-red-400'
                          }
                        >
                          {diff === 0 ? '0' : diff > 0 ? `+${diff}` : diff}
                        </span>
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={auditNotes[item.productId] || ''}
                          onChange={(e) => handleNotesChange(item.productId, e.target.value)}
                          placeholder="e.g. Casse, Erreur saisie..."
                          className="w-full bg-white dark:bg-slate-950/40 p-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETED AUDITS HISTORY */}
      <div className="bg-white dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Historique des Audits de Stocks</h3>
          <p className="text-[11px] text-slate-400">Registre légal et traçabilité des états physiques des dépôts.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {audits.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center col-span-3">Aucun rapport d'inventaire archivé.</p>
          ) : (
            auditsPage.paged.map((a) => (
              <div
                key={a.id}
                className="p-4 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-xl space-y-3.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono text-cyan-400 font-bold">{a.id}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                        a.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {a.status === 'completed' ? 'VALIDÉ' : 'BROUILLON'}
                    </span>
                  </div>

                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white mt-2">{a.title}</h4>
                  
                  <div className="space-y-1 mt-2.5 text-[10px] text-slate-400 font-mono">
                    <p>Entrepôt : {a.warehouseName}</p>
                    <p>Audité par : {a.auditorName}</p>
                    <p>Créé le : {new Date(a.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800/60 pt-3.5 mt-2 text-xs">
                  <span className="text-[10px] text-slate-400">{a.items?.length || 0} références vérifiées</span>
                  <button
                    onClick={() => setViewAudit(a)}
                    className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" /> Voir Écarts
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <Pagination
          page={auditsPage.page}
          pageCount={auditsPage.pageCount}
          total={auditsPage.total}
          from={auditsPage.from}
          to={auditsPage.to}
          onChange={auditsPage.setPage}
        />
      </div>

      {/* NEW AUDIT DIALOG */}
      {isNewAuditOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden p-5 space-y-4 shadow-2xl animate-fade-in text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Nouveau Rapport d'Inventaire</h3>
            <p className="text-slate-500 dark:text-slate-400">Sélectionnez le dépôt physique pour générer la liste des références à compter.</p>

            <form onSubmit={handleCreateAudit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Titre de l'Inventaire *</label>
                <input
                  type="text"
                  required
                  value={auditTitle}
                  onChange={(e) => setAuditTitle(e.target.value)}
                  placeholder="e.g. Inventaire Tournant Fin Trimestre"
                  className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1">Entrepôt cible *</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-200 focus:outline-none"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 text-xs pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewAuditOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg cursor-pointer"
                >
                  Générer la Fiche
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETED AUDIT DETAILS OVERLAY VIEW */}
      {viewAudit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in text-xs flex flex-col justify-between max-h-[85vh]">
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Rapport d'écarts d'inventaire : {viewAudit.title}</h3>
                <p className="text-[10px] text-slate-400">ID: {viewAudit.id} | Terminé le : {viewAudit.completedAt ? new Date(viewAudit.completedAt).toLocaleString() : 'N/A'}</p>
              </div>
              <button
                onClick={() => setViewAudit(null)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="bg-white dark:bg-slate-950/20 rounded-xl border border-slate-200 dark:border-slate-800/80 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/65 text-[10px] font-mono text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 p-3">
                      <th className="p-3">Référence d'Article</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3 text-center">Attendu</th>
                      <th className="p-3 text-center">Compté</th>
                      <th className="p-3 text-center">Écart constaté</th>
                      <th className="p-3">Observations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
                    {viewAudit.items?.map((item) => (
                      <tr key={item.productId}>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">{item.productName}</td>
                        <td className="p-3 font-mono text-cyan-400">{item.sku}</td>
                        <td className="p-3 text-center font-mono">{item.expectedQuantity}</td>
                        <td className="p-3 text-center font-mono">{item.actualQuantity}</td>
                        <td className="p-3 text-center font-mono font-bold">
                          <span
                            className={
                              item.diff === 0
                                ? 'text-slate-400'
                                : item.diff > 0
                                ? 'text-emerald-400'
                                : 'text-red-400'
                            }
                          >
                            {item.diff === 0 ? '0' : item.diff > 0 ? `+${item.diff}` : item.diff}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400 italic">{item.notes || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setViewAudit(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-semibold rounded-lg cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
