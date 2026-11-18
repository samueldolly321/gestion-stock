/**
 * Écrans des variantes taille × couleur (vêtements, chaussures…) :
 *  - VariantModelModal : créer un modèle et sa grille, ajouter des cases, ou modifier le modèle
 *  - VariantGrid       : tableau taille × couleur du stock d'un modèle (fiche article)
 *  - VariantLabels     : impression des étiquettes de toutes les variantes d'un modèle
 *  - VariantPicker     : choix de la variante en caisse
 */
import React, { useMemo, useState } from 'react';
import { X, Plus, Printer, Shirt } from 'lucide-react';
import type { Product, Category, Brand, Supplier, Warehouse } from '../types';
import { SIZE_PRESETS, COLOR_PRESETS, cellKey, cleanList, compareSizes, variantLabel } from '../services/variants';
import { createVariants, updateModel } from '../services/productsService';
import { useMoney } from '../services/CurrencyContext';
import { showAlert } from '../services/dialog';
import { showToast } from '../services/toast';
import BarcodeSVG from './Barcode';
import { getExportCompany } from '../services/exportContext';

const field =
  'w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';
const labelCls = 'text-xs text-slate-400 block mb-1';

/** Variantes d'un modèle, et listes ordonnées de ses tailles et couleurs. */
export function modelVariants(products: Product[], group: string) {
  const variants = products.filter((p) => p.variantGroup === group);
  const sizes = [...new Set(variants.map((v) => v.variantSize || ''))].sort(compareSizes);
  const colors = [...new Set(variants.map((v) => v.variantColor || ''))].sort((a, b) => a.localeCompare(b, 'fr'));
  return { variants, sizes, colors, modelName: variants[0]?.modelName || variants[0]?.name || '' };
}

// ---------------------------------------------------------------------------------------
// Sélecteur de valeurs (tailles ou couleurs) : puces à cocher + saisie libre
// ---------------------------------------------------------------------------------------
function ChipPicker({
  title, values, onChange, suggestions, presets, locked = [], placeholder,
}: {
  title: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  presets?: { label: string; sizes: string[] }[];
  locked?: string[]; // déjà présentes dans le modèle (non retirables)
  placeholder: string;
}) {
  const [custom, setCustom] = useState('');
  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());
  const toggle = (v: string) => {
    if (locked.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange(has(v) ? values.filter((x) => x.toLowerCase() !== v.toLowerCase()) : [...values, v]);
  };
  const addCustom = () => {
    const parts = cleanList(custom.split(/[,;]/));
    if (parts.length) onChange(cleanList([...values, ...parts]));
    setCustom('');
  };
  const shown = cleanList([...suggestions, ...values]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</span>
        {presets && (
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(cleanList([...values, ...p.sizes]))}
                className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 hover:text-cyan-500 hover:border-cyan-500"
              >
                + {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((v) => {
          const on = has(v);
          const isLocked = locked.some((x) => x.toLowerCase() === v.toLowerCase());
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              aria-pressed={on}
              title={isLocked ? 'Déjà dans le modèle' : undefined}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                on
                  ? isLocked
                    ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-500 cursor-default'
                    : 'bg-cyan-500 border-cyan-500 text-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-cyan-500'
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder={placeholder}
          className={field}
        />
        <button type="button" onClick={addCustom} className="px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-cyan-500 shrink-0">
          Ajouter
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Modale : nouveau modèle / ajouter des tailles-couleurs / modifier le modèle
// ---------------------------------------------------------------------------------------
export type VariantModalMode = { kind: 'create' } | { kind: 'add'; group: string } | { kind: 'edit'; group: string };

export function VariantModelModal({
  mode, products, categories, brands, suppliers, warehouses, onClose, onDone, sizePresets = SIZE_PRESETS,
}: {
  mode: VariantModalMode;
  /** Grilles de tailles, dans l'ordre utile au secteur (chaussures d'abord pour un chausseur) */
  sizePresets?: typeof SIZE_PRESETS;
  products: Product[];
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  onClose: () => void;
  onDone: (createdIds?: string[]) => void;
}) {
  const model = mode.kind === 'create' ? null : modelVariants(products, mode.group);
  const ref = model?.variants[0];
  const topCategories = categories.filter((c) => !c.parentId);
  const activeWarehouses = warehouses.filter((w) => w.status !== 'inactive');

  const [modelName, setModelName] = useState(model?.modelName || '');
  const [baseSku, setBaseSku] = useState('');
  const [categoryId, setCategoryId] = useState(ref?.categoryId || '');
  const [brandId, setBrandId] = useState(ref?.brandId || '');
  const [supplierId, setSupplierId] = useState(ref?.supplierId || '');
  const [purchasePrice, setPurchasePrice] = useState<string>(ref ? String(ref.purchasePrice) : '');
  const [salePrice, setSalePrice] = useState<string>(ref ? String(ref.salePrice) : '');
  const [minStock, setMinStock] = useState<string>(ref ? String(ref.minStock) : '1');
  const [description, setDescription] = useState(ref?.description || '');
  const [image, setImage] = useState(ref?.image || '');
  const [warehouseId, setWarehouseId] = useState(activeWarehouses[0]?.id || '');
  const existingSizes = model?.sizes.filter(Boolean) || [];
  const existingColors = model?.colors.filter(Boolean) || [];
  const [sizes, setSizes] = useState<string[]>(existingSizes);
  const [colors, setColors] = useState<string[]>(existingColors);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const existingCells = new Set((model?.variants || []).map((v) => cellKey(v.variantSize, v.variantColor)));
  const rows = sizes.length ? [...sizes].sort(compareSizes) : [''];
  const cols = colors.length ? colors : [''];
  const newCells = rows.flatMap((s) => cols.map((c) => cellKey(s || null, c || null))).filter((k) => !existingCells.has(k));
  const isEdit = mode.kind === 'edit';

  const onImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return void showAlert('Choisissez une image (JPG, PNG, WEBP).', { variant: 'warning' });
    if (file.size > 2 * 1024 * 1024) return void showAlert('Image trop volumineuse : 2 Mo maximum.', { variant: 'warning' });
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && newCells.length === 0) {
      return void showAlert('Choisissez au moins une nouvelle taille ou couleur.', { variant: 'warning' });
    }
    const cat = categories.find((c) => c.id === categoryId);
    const common = {
      description,
      categoryId: categoryId || undefined,
      categoryName: cat?.name || '',
      brandId: brandId || undefined,
      brandName: brands.find((b) => b.id === brandId)?.name || '',
      supplierId: supplierId || undefined,
      supplierName: suppliers.find((s) => s.id === supplierId)?.name || '',
      image: image || undefined,
      purchasePrice: Number(purchasePrice) || 0,
      salePrice: Number(salePrice) || 0,
      minStock: Number(minStock) || 0,
    };
    setBusy(true);
    try {
      if (isEdit) {
        const r = await updateModel(mode.group, { modelName, ...common });
        showToast(`Modèle « ${modelName} » mis à jour (${r.count} variantes).`, { title: 'Articles' });
        onDone();
      } else {
        const qty: Record<string, number> = {};
        for (const [k, v] of Object.entries(quantities)) if (Number(v) > 0) qty[k] = Math.floor(Number(v));
        const r = await createVariants(
          mode.kind === 'add'
            ? { variantGroup: mode.group, sizes, colors, quantities: qty, warehouseId }
            : { modelName, baseSku, sizes, colors, quantities: qty, warehouseId, unit: 'Pièces', vatRate: 0, maxStock: 100, ...common },
        );
        showToast(`${r.products.length} variante${r.products.length > 1 ? 's' : ''} créée${r.products.length > 1 ? 's' : ''} pour « ${r.modelName} ».`, { title: 'Articles' });
        onDone(r.products.map((p) => p.id));
      }
    } catch (err: any) {
      showAlert(err?.message || 'Enregistrement impossible.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const title = mode.kind === 'create' ? 'Nouveau modèle avec tailles / couleurs' : mode.kind === 'add' ? `Ajouter des tailles / couleurs — ${model?.modelName}` : `Modifier le modèle — ${model?.modelName}`;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shirt className="w-4 h-4 text-cyan-400" />
            {title}
          </h3>
          <button type="button" onClick={() => !busy && onClose()} aria-label="Fermer" className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-5 text-xs">
          {mode.kind !== 'add' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2">
                <span className={labelCls}>Nom du modèle *</span>
                <input required value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="ex. T-shirt Polo, Basket Air Run…" className={field} />
              </label>
              {mode.kind === 'create' && (
                <label>
                  <span className={labelCls}>Référence (début des SKU)</span>
                  <input value={baseSku} onChange={(e) => setBaseSku(e.target.value)} placeholder="ex. POLO → POLO-M-NOIR" className={`${field} font-mono`} />
                </label>
              )}
              <label>
                <span className={labelCls}>Catégorie</span>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
                  <option value="">—</option>
                  {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>
                <span className={labelCls}>Marque</span>
                <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={field}>
                  <option value="">—</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label>
                <span className={labelCls}>Fournisseur</span>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={field}>
                  <option value="">—</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label>
                <span className={labelCls}>Prix d'achat (par pièce)</span>
                <input type="number" min="0" step="any" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className={`${field} font-mono`} />
              </label>
              <label>
                <span className={labelCls}>Prix de vente (par pièce)</span>
                <input type="number" min="0" step="any" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className={`${field} font-mono`} />
              </label>
              <label>
                <span className={labelCls}>Seuil d'alerte (par variante)</span>
                <input type="number" min="0" step="1" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={`${field} font-mono`} />
              </label>
              <div>
                <span className={labelCls}>Photo du modèle</span>
                <div className="flex items-center gap-2">
                  {image && <img src={image} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700" referrerPolicy="no-referrer" />}
                  <label className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-cyan-500 cursor-pointer">
                    Choisir une image
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onImage} />
                  </label>
                  {image && <button type="button" onClick={() => setImage('')} className="text-red-400 hover:underline">Retirer</button>}
                </div>
              </div>
              <label className="sm:col-span-2">
                <span className={labelCls}>Description</span>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
              </label>
              {isEdit && (
                <p className="sm:col-span-2 text-[11px] text-slate-500">
                  Ces changements s'appliquent aux {model?.variants.length} variantes. Le stock, les SKU et les codes-barres de chaque variante ne changent pas.
                </p>
              )}
            </div>
          )}

          {!isEdit && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-slate-200 dark:border-slate-800 pt-4">
                <ChipPicker
                  title="Tailles"
                  values={sizes}
                  onChange={setSizes}
                  suggestions={[]}
                  presets={sizePresets}
                  locked={existingSizes}
                  placeholder="Autre taille (ex. 4XL, 47)…"
                />
                <ChipPicker
                  title="Couleurs"
                  values={colors}
                  onChange={setColors}
                  suggestions={COLOR_PRESETS}
                  locked={existingColors}
                  placeholder="Autre couleur (ex. Corail)…"
                />
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Stock initial par variante (facultatif)</span>
                    <p className="text-[11px] text-slate-500">
                      {newCells.length} nouvelle{newCells.length > 1 ? 's' : ''} variante{newCells.length > 1 ? 's' : ''} — chacune aura son SKU et son code-barres.
                    </p>
                  </div>
                  <label className="min-w-[200px]">
                    <span className={labelCls}>Entrepôt du stock initial</span>
                    <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={field}>
                      {activeWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </label>
                </div>
                {(sizes.length > 0 || colors.length > 0) && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="text-xs border-collapse w-full">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/30 text-[10px] text-slate-400 uppercase">
                          <th className="p-2 text-left">Taille \ Couleur</th>
                          {cols.map((c) => <th key={c} className="p-2 text-center font-semibold whitespace-nowrap">{c || '—'}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((s) => (
                          <tr key={s} className="border-t border-slate-200 dark:border-slate-800">
                            <th className="p-2 text-left font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{s || '—'}</th>
                            {cols.map((c) => {
                              const k = cellKey(s || null, c || null);
                              const exists = existingCells.has(k);
                              return (
                                <td key={c} className="p-1.5 text-center">
                                  {exists ? (
                                    <span className="text-[10px] text-slate-400">existe</span>
                                  ) : (
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      inputMode="numeric"
                                      aria-label={`Stock initial ${s} ${c}`}
                                      value={quantities[k] ?? ''}
                                      onChange={(e) => setQuantities({ ...quantities, [k]: e.target.value })}
                                      placeholder="0"
                                      className="w-16 bg-white dark:bg-slate-950/20 p-1.5 text-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-cyan-500"
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-semibold">
              Annuler
            </button>
            <button type="submit" disabled={busy} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-semibold disabled:opacity-60">
              {busy ? 'Enregistrement…' : isEdit ? 'Enregistrer le modèle' : `Créer ${newCells.length} variante${newCells.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Grille taille × couleur d'un modèle (fiche article)
// ---------------------------------------------------------------------------------------
export function VariantGrid({
  products, group, selectedId, onSelect, onAdd, onEdit, onLabels, canWrite,
}: {
  products: Product[];
  group: string;
  selectedId?: string;
  onSelect: (p: Product) => void;
  onAdd: () => void;
  onEdit: () => void;
  onLabels: () => void;
  canWrite: boolean;
}) {
  const { variants, sizes, colors, modelName } = modelVariants(products, group);
  const byCell = new Map(variants.map((v) => [cellKey(v.variantSize, v.variantColor), v]));
  const total = variants.reduce((s, v) => s + (Number(v.quantity) || 0), 0);
  return (
    <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800/60 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">Modèle « {modelName} »</h4>
        <span className="text-[10px] text-slate-400">{variants.length} var. · {total} pce{total > 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-collapse w-full">
          <thead>
            <tr className="text-[9px] text-slate-400 uppercase">
              <th className="p-1 text-left"></th>
              {colors.map((c) => <th key={c} className="p-1 text-center font-semibold">{c || '—'}</th>)}
            </tr>
          </thead>
          <tbody>
            {sizes.map((s) => (
              <tr key={s}>
                <th className="p-1 text-left font-semibold text-slate-600 dark:text-slate-300">{s || '—'}</th>
                {colors.map((c) => {
                  const v = byCell.get(cellKey(s || null, c || null));
                  if (!v) return <td key={c} className="p-1 text-center text-slate-300 dark:text-slate-700">·</td>;
                  const q = Number(v.quantity) || 0;
                  return (
                    <td key={c} className="p-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => onSelect(v)}
                        title={`${v.name} — ${q} en stock`}
                        className={`w-full min-w-[2.2rem] py-1 rounded-md font-mono font-bold border ${
                          v.id === selectedId ? 'border-cyan-500 ring-1 ring-cyan-500' : 'border-transparent'
                        } ${q <= 0 ? 'bg-red-500/10 text-red-500' : q <= v.minStock ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}
                      >
                        {q}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {canWrite && (
          <button type="button" onClick={onAdd} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:border-cyan-500 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Tailles / couleurs
          </button>
        )}
        {canWrite && (
          <button type="button" onClick={onEdit} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:border-cyan-500">
            Modifier le modèle
          </button>
        )}
        <button type="button" onClick={onLabels} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:border-cyan-500 flex items-center gap-1">
          <Printer className="w-3 h-3" /> Étiquettes
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Étiquettes de toutes les variantes d'un modèle (une par variante, ou autant que le stock)
// ---------------------------------------------------------------------------------------
export function VariantLabels({ products, group, onClose }: { products: Product[]; group: string; onClose: () => void }) {
  const { format } = useMoney();
  const { variants, sizes, colors, modelName } = modelVariants(products, group);
  const [perStock, setPerStock] = useState(false);
  const ordered = useMemo(
    () => sizes.flatMap((s) => colors.map((c) => variants.find((v) => cellKey(v.variantSize, v.variantColor) === cellKey(s || null, c || null)))).filter(Boolean) as Product[],
    [variants, sizes, colors],
  );
  const labels = ordered.flatMap((v) => Array.from({ length: perStock ? Math.max(0, Math.floor(Number(v.quantity) || 0)) : 1 }, () => v));
  const printable = labels.filter((v) => /^\d{13}$/.test(v.barcode || ''));
  const company = getExportCompany() || 'Vokatra-ko';
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <style>{`@media print { @page { size: 58mm 40mm; margin: 2mm; } body * { visibility: hidden; } .vlabels, .vlabels * { visibility: visible; } .vlabels { position: absolute; left: 0; top: 0; width: 100%; } .vlabel { width: 54mm; height: 35mm; page-break-after: always; break-after: page; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; } .vlabels-noprint { display: none !important; } }`}</style>
      <div className="bg-white text-slate-950 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-5 border-b border-slate-200 vlabels-noprint space-y-2">
          <h3 className="text-sm font-bold">Étiquettes — {modelName}</h3>
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-1.5"><input type="radio" checked={!perStock} onChange={() => setPerStock(false)} /> 1 par variante ({ordered.length})</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={perStock} onChange={() => setPerStock(true)} /> Autant que le stock ({ordered.reduce((s, v) => s + Math.max(0, Math.floor(Number(v.quantity) || 0)), 0)})</label>
          </div>
          <p className="text-[11px] text-slate-500">Format 58 × 40 mm, une étiquette par page (imprimante d'étiquettes).</p>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          <div className="vlabels grid grid-cols-2 gap-3">
            {printable.length === 0 && <p className="text-xs text-slate-500 col-span-2 text-center py-6">Aucune étiquette à imprimer.</p>}
            {printable.map((v, i) => (
              <div key={`${v.id}-${i}`} className="vlabel border border-dashed border-slate-300 rounded-lg p-2 text-center">
                <span className="text-[9px] font-bold uppercase tracking-wide">{company}</span>
                <p className="text-[10px] font-semibold leading-tight truncate max-w-full">{v.modelName || v.name}</p>
                <p className="text-sm font-black">{variantLabel(v) || '—'}</p>
                <p className="text-xs font-bold">{format(v.salePrice)}</p>
                <BarcodeSVG code={v.barcode} height={34} moduleWidth={1.6} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 vlabels-noprint">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold">Fermer</button>
          <button onClick={() => window.print()} disabled={printable.length === 0} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
            <Printer className="w-4 h-4" /> Imprimer {printable.length}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Caisse : choix de la variante d'un modèle (stock de l'entrepôt actif)
// ---------------------------------------------------------------------------------------
export function VariantPicker({
  products, group, available, onPick, onClose,
}: {
  products: Product[];
  group: string;
  /** Quantité encore vendable (stock de l'entrepôt actif − panier) */
  available: (p: Product) => number;
  onPick: (p: Product) => void;
  onClose: () => void;
}) {
  const { format } = useMoney();
  const { variants, sizes, colors, modelName } = modelVariants(products, group);
  const byCell = new Map(variants.map((v) => [cellKey(v.variantSize, v.variantColor), v]));
  const prices = [...new Set(variants.map((v) => v.salePrice))];
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Choisir la variante — ${modelName}`} onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {variants[0]?.image && <img src={variants[0].image} alt="" className="w-12 h-12 rounded-lg object-cover" referrerPolicy="no-referrer" />}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{modelName}</h3>
              <p className="text-xs text-cyan-500 font-mono">{prices.length === 1 ? format(prices[0]) : `${format(Math.min(...prices))} – ${format(Math.max(...prices))}`}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[11px] text-slate-500">Touchez une case pour l'ajouter au panier. Le chiffre = pièces disponibles dans l'entrepôt actif.</p>
        <div className="overflow-x-auto">
          <table className="border-collapse w-full text-xs">
            <thead>
              <tr className="text-[10px] text-slate-400 uppercase">
                <th className="p-1.5 text-left">Taille</th>
                {colors.map((c) => <th key={c} className="p-1.5 text-center font-semibold whitespace-nowrap">{c || '—'}</th>)}
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => (
                <tr key={s}>
                  <th className="p-1.5 text-left font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{s || '—'}</th>
                  {colors.map((c) => {
                    const v = byCell.get(cellKey(s || null, c || null));
                    if (!v) return <td key={c} className="p-1 text-center text-slate-300 dark:text-slate-700">·</td>;
                    const q = available(v);
                    return (
                      <td key={c} className="p-1">
                        <button
                          type="button"
                          disabled={q <= 0}
                          onClick={() => onPick(v)}
                          aria-label={`${v.name} — ${q} disponible${q > 1 ? 's' : ''}`}
                          className="w-full min-w-[3.2rem] py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-mono font-bold hover:border-cyan-500 hover:bg-cyan-500/10 disabled:opacity-30 disabled:cursor-not-allowed text-slate-900 dark:text-white"
                        >
                          {q}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Pour la caisse : regroupe les variantes d'un même modèle en une seule carte. */
export function groupForPos(list: Product[]): { key: string; product: Product; group?: string; count: number }[] {
  const out: { key: string; product: Product; group?: string; count: number }[] = [];
  const seen = new Map<string, number>();
  for (const p of list) {
    if (!p.variantGroup) { out.push({ key: p.id, product: p, count: 1 }); continue; }
    const i = seen.get(p.variantGroup);
    if (i === undefined) { seen.set(p.variantGroup, out.length); out.push({ key: p.variantGroup, product: p, group: p.variantGroup, count: 1 }); }
    else out[i].count++;
  }
  return out;
}

