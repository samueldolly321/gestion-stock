/**
 * Restauration — création / modification d'un PLAT avec sa recette.
 *
 * Un plat n'a pas de stock propre : sa recette indique la quantité de chaque ingrédient
 * pour UNE portion (dans l'unité de l'ingrédient). À chaque vente, les ingrédients sont
 * retirés du stock. Le coût de revient, la marge et le coût matière sont calculés en direct.
 */
import React, { useMemo, useState } from 'react';
import { ChefHat, Search, Trash2, ImagePlus, AlertTriangle } from 'lucide-react';
import type { Category, Product, ProductStock } from '../types';
import { createProduct, updateProduct } from '../services/productsService';
import { generateId } from '../services/ids';
import { generateEan13 } from '../services/barcode';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import { fmtQty, parseDecimal } from '../services/pack';
import { dishMargin, isDish, normalizeRecipe, portionsPossible, recipeCost } from '../services/recipes';

const field =
  'w-full bg-white dark:bg-slate-950/20 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500';

/** Réduit la photo du plat (600 px max) avant de la garder en Data URL. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, 600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

interface Line { ingredientId: string; quantity: string }

export default function DishForm({
  dish, products, categories, productStock, format, onClose, onSaved,
}: {
  /** Plat à modifier, ou null pour un nouveau plat */
  dish: Product | null;
  products: Product[];
  categories: Category[];
  productStock: ProductStock[];
  format: (n: number) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const topCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories]);
  const defaultCat = topCategories.find((c) => /^plats?$/i.test(c.name.trim())) || topCategories[0];

  const [name, setName] = useState(dish?.name || '');
  const [categoryId, setCategoryId] = useState(dish?.categoryId || defaultCat?.id || '');
  const [subCategoryId, setSubCategoryId] = useState(dish?.subCategoryId || '');
  const [salePrice, setSalePrice] = useState<string>(dish ? String(dish.salePrice) : '');
  const [vatRate, setVatRate] = useState<number>(dish?.vatRate ?? 20);
  const [description, setDescription] = useState(dish?.description || '');
  const [image, setImage] = useState<string>(dish?.image || '');
  const [lines, setLines] = useState<Line[]>(
    (dish?.recipe || []).map((l) => ({ ingredientId: l.ingredientId, quantity: String(l.quantity).replace('.', ',') })),
  );
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  // Ingrédients possibles : tous les articles stockés (pas les autres plats).
  const ingredients = useMemo(() => products.filter((p) => !isDish(p)), [products]);
  const byId = useMemo(() => new Map(ingredients.map((p) => [p.id, p])), [ingredients]);
  const stockTotal = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of productStock) m.set(s.productId, (m.get(s.productId) || 0) + (Number(s.quantity) || 0));
    return m;
  }, [productStock]);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const used = new Set(lines.map((l) => l.ingredientId));
    return ingredients
      .filter((p) => !used.has(p.id) && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [search, ingredients, lines]);

  const recipe = useMemo(() => normalizeRecipe(lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity }))), [lines]);
  const cost = recipeCost(recipe, byId);
  const price = parseDecimal(salePrice) || 0;
  const { margin, costRatio } = dishMargin(price, cost);
  const portions = portionsPossible(recipe, (id) => stockTotal.get(id) || 0);
  const invalidLines = lines.filter((l) => !(parseDecimal(l.quantity) > 0));

  const addIngredient = (p: Product) => {
    setLines((ls) => [...ls, { ingredientId: p.id, quantity: '' }]);
    setSearch('');
  };

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return showAlert('Choisissez une image (JPG, PNG, WEBP…).', { variant: 'warning' });
    try { setImage(await shrinkImage(file)); } catch { showAlert("Impossible de lire cette image.", { variant: 'error' }); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return showAlert('Donnez un nom au plat.', { variant: 'warning' });
    if (!(price > 0)) return showAlert('Indiquez le prix de vente du plat.', { variant: 'warning' });
    if (invalidLines.length) return showAlert('Indiquez la quantité de chaque ingrédient (par portion).', { variant: 'warning' });
    if (recipe.length === 0 && !(await showConfirm(
      "Ce plat n'a pas encore de recette : il sera vendu sans retirer d'ingrédients du stock. Continuer ?",
      { title: 'Plat sans recette', confirmText: 'Enregistrer quand même' },
    ))) return;
    if (price < cost) {
      return showAlert(`Le prix de vente (${format(price)}) est inférieur au coût de revient (${format(cost)}) : la caisse refuserait la vente. Augmentez le prix ou revoyez la recette.`, { variant: 'warning' });
    }

    const cat = categories.find((c) => c.id === categoryId);
    const sub = categories.find((c) => c.id === subCategoryId);
    const now = new Date().toISOString();
    const data = {
      kind: 'dish' as const,
      recipe,
      name: name.trim(),
      sku: dish?.sku || 'PLAT-' + generateId().slice(0, 6).toUpperCase(),
      barcode: dish?.barcode || generateEan13(products.map((p) => p.barcode)),
      description,
      categoryId,
      categoryName: cat?.name || '',
      subCategoryId: subCategoryId || null,
      subCategoryName: sub?.name || '',
      // Coût de revient de la recette : sert aux marges des rapports (le serveur recalcule à la vente).
      purchasePrice: cost,
      salePrice: price,
      vatRate: Number(vatRate) || 0,
      unit: 'Portions',
      image,
      quantity: 0,
      minStock: 0,
      maxStock: 0,
      status: 'in_stock' as const,
      createdAt: dish?.createdAt || now,
      updatedAt: now,
    };
    setBusy(true);
    try {
      if (dish) await updateProduct(dish.id, data);
      else await createProduct(data as Omit<Product, 'id'>);
      showToast(dish ? `Plat « ${data.name} » modifié.` : `Plat « ${data.name} » créé.`, { title: 'Plats' });
      onSaved();
    } catch (err: any) {
      showAlert(err?.message || "Erreur d'enregistrement du plat.", { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const ratioCls = costRatio == null ? 'text-slate-400' : costRatio > 60 ? 'text-red-500' : costRatio > 40 ? 'text-amber-500' : 'text-emerald-500';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-label={dish ? 'Modifier le plat' : 'Nouveau plat'}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-fade-in">
        <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-cyan-500" />
            {dish ? 'Modifier le plat' : 'Nouveau plat'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm" aria-label="Fermer">✕</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-5 max-h-[80vh] overflow-y-auto text-xs">
          {/* Identité du plat */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-slate-400 block mb-1">Nom du plat *</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="ex. Soupe Won Ton, Riz cantonais, Mine sao poulet" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Catégorie</label>
                <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubCategoryId(''); }} className={field}>
                  <option value="">— Aucune —</option>
                  {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Sous-catégorie</label>
                <select value={subCategoryId} onChange={(e) => setSubCategoryId(e.target.value)} className={field} disabled={!categories.some((c) => c.parentId === categoryId)}>
                  <option value="">— Aucune —</option>
                  {categories.filter((c) => c.parentId === categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Prix de vente (1 portion) *</label>
                <input required inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className={`${field} font-mono`} placeholder="ex. 14000" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">TVA (%)</label>
                <input type="number" min={0} max={100} value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} className={`${field} font-mono`} />
              </div>
            </div>
            <div className="flex md:flex-col items-center gap-2">
              <div className="w-28 h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 overflow-hidden flex items-center justify-center">
                {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <ChefHat className="w-8 h-8 text-slate-300" />}
              </div>
              <label className="cursor-pointer text-[11px] text-cyan-500 hover:underline flex items-center gap-1">
                <ImagePlus className="w-3.5 h-3.5" /> {image ? 'Changer la photo' : 'Ajouter une photo'}
                <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
              </label>
              {image && <button type="button" onClick={() => setImage('')} className="text-[11px] text-slate-400 hover:text-red-500">Retirer</button>}
            </div>
          </div>

          {/* Recette */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <p className="font-bold text-slate-900 dark:text-white">Recette — pour 1 portion</p>
              <p className="text-[11px] text-slate-500 mt-0.5">À chaque vente, ces quantités sont retirées du stock. Saisissez-les dans l'unité de l'ingrédient (ex. 0,12 kg, 0,3 L).</p>
            </div>

            <div className="p-3.5 space-y-2">
              {lines.length === 0 && <p className="text-slate-400 italic">Aucun ingrédient pour l'instant — cherchez-en un ci-dessous.</p>}
              {lines.map((l, i) => {
                const ing = byId.get(l.ingredientId);
                const qty = parseDecimal(l.quantity);
                const lineCost = ing && qty > 0 ? qty * ing.purchasePrice : 0;
                const bad = l.quantity !== '' && !(qty > 0);
                return (
                  <div key={l.ingredientId} className="flex items-center gap-2" data-testid="recipe-line">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{ing?.name || 'Ingrédient supprimé'}</p>
                      <p className="text-[10px] text-slate-400">
                        {ing ? <>Stock : {fmtQty(stockTotal.get(ing.id) || 0)} {ing.unit} · {format(ing.purchasePrice)} / {ing.unit}</> : '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        inputMode="decimal"
                        aria-label={`Quantité de ${ing?.name || 'ingrédient'} par portion`}
                        value={l.quantity}
                        autoFocus={i === lines.length - 1 && l.quantity === ''}
                        onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                        className={`${field} w-24 text-right font-mono ${bad ? 'border-red-500' : ''}`}
                        placeholder="0,000"
                      />
                      <span className="w-14 text-slate-500 truncate">{ing?.unit}</span>
                    </div>
                    <span className="w-24 text-right font-mono text-slate-600 dark:text-slate-300">{format(lineCost)}</span>
                    <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="p-1.5 text-slate-400 hover:text-red-500" aria-label={`Retirer ${ing?.name || "l'ingrédient"}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              <div className="relative pt-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-[1.1rem] text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${field} pl-8`}
                  placeholder="Ajouter un ingrédient : tapez son nom (riz, poulet, huile…)"
                  aria-label="Rechercher un ingrédient"
                />
                {suggestions.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                    {suggestions.map((p) => (
                      <button key={p.id} type="button" onClick={() => addIngredient(p)} className="w-full text-left px-3 py-2 hover:bg-cyan-500/10 flex justify-between gap-2">
                        <span className="text-slate-800 dark:text-slate-100">{p.name}</span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtQty(stockTotal.get(p.id) || 0)} {p.unit} · {format(p.purchasePrice)}/{p.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
                {search.trim() && suggestions.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-400">Aucun article ne correspond. Créez d'abord l'ingrédient comme un article normal (avec son stock et son prix d'achat).</p>
                )}
              </div>
            </div>
          </div>

          {/* Coût & marge */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="dish-summary">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
              <p className="text-[10px] uppercase text-slate-400">Coût de revient</p>
              <p className="font-bold font-mono text-slate-900 dark:text-white" data-testid="dish-cost">{format(cost)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
              <p className="text-[10px] uppercase text-slate-400">Marge par portion</p>
              <p className={`font-bold font-mono ${margin < 0 ? 'text-red-500' : 'text-emerald-500'}`} data-testid="dish-margin">{format(margin)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
              <p className="text-[10px] uppercase text-slate-400">Coût matière</p>
              <p className={`font-bold font-mono ${ratioCls}`} data-testid="dish-ratio">{costRatio == null ? '—' : `${String(costRatio).replace('.', ',')} %`}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
              <p className="text-[10px] uppercase text-slate-400">Portions possibles</p>
              <p className="font-bold font-mono text-slate-900 dark:text-white" data-testid="dish-portions">{portions == null ? '—' : portions}</p>
            </div>
          </div>
          {price > 0 && price < cost && (
            <p className="flex items-center gap-1.5 text-red-500"><AlertTriangle className="w-3.5 h-3.5" /> Prix inférieur au coût de revient : la caisse refusera la vente.</p>
          )}
          {costRatio != null && costRatio > 40 && price >= cost && (
            <p className="text-amber-600 dark:text-amber-400 text-[11px]">Coût matière élevé (plus de 40 % du prix). En restauration, on vise souvent 25 à 35 %.</p>
          )}

          <div>
            <label className="text-slate-400 block mb-1">Description (menu, reçu)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={field} placeholder="ex. Bouillon maison, raviolis crevettes, pak choï" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Annuler</button>
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-60">
              {busy ? 'Enregistrement…' : dish ? 'Enregistrer le plat' : 'Créer le plat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Liste « utilisé dans … » d'un ingrédient (fiche article). */
export function usedInDishes(ingredientId: string, products: Product[]) {
  return products.filter((p) => isDish(p) && (p.recipe || []).some((l) => l.ingredientId === ingredientId));
}

