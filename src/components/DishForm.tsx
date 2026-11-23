/**
 * Restauration — création / modification d'un PLAT avec sa recette.
 *
 * Un plat n'a pas de stock propre : sa recette indique la quantité de chaque ingrédient
 * pour UNE portion (dans l'unité de l'ingrédient). À chaque vente, les ingrédients sont
 * retirés du stock. Le coût de revient, la marge et le coût matière sont calculés en direct.
 */
import React, { useMemo, useState } from 'react';
import { ChefHat, Trash2, ImagePlus, AlertTriangle, PackagePlus } from 'lucide-react';
import type { Category, Product, ProductStock } from '../types';
import { createProduct, updateProduct, declareDishLoss } from '../services/productsService';
import { createMovement } from '../services/movementsService';
import { generateId } from '../services/ids';
import { generateEan13 } from '../services/barcode';
import { showAlert, showConfirm } from '../services/dialog';
import { showToast } from '../services/toast';
import { fmtQty, parseDecimal } from '../services/pack';
import { dishMargin, isDish, normalizeRecipe, normalizeOptions, normalizeSizes, portionsPossible, recipeCost, roundPrice, entryUnits, toEntry, fromEntry, defaultEntryUnit } from '../services/recipes';

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

/** Ligne de recette : quantité saisie dans l'unité de saisie `unit` (g, cl… ou l'unité de stock). */
interface Line { ingredientId: string; quantity: string; unit?: string }

/** Unités proposées pour un nouvel ingrédient (unité de stock). */
const INGREDIENT_UNITS = ['Kg', 'Litre', 'Pièces', 'Bouteilles', 'Sacs', 'Pots', 'Unités'];

export default function DishForm({
  dish, products, categories, productStock, warehouses = [], defaultVatRate = 20, format, onManageCategories, onClose, onSaved, onIngredientCreated,
}: {
  /** TVA par défaut d'un nouveau plat (Paramètres) */
  defaultVatRate?: number;
  /** Entrepôts (stock initial d'un ingrédient créé depuis la recette) */
  warehouses?: { id: string; name: string }[];
  /** Un ingrédient vient d'être créé depuis la fiche : recharger la liste des articles */
  onIngredientCreated?: () => void;
  /** Ouvre la gestion des catégories (parentId = catégorie parente présélectionnée) */
  onManageCategories?: (parentId?: string) => void;
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
  const [vatRate, setVatRate] = useState<number>(dish?.vatRate ?? defaultVatRate);
  const [description, setDescription] = useState(dish?.description || '');
  const [image, setImage] = useState<string>(dish?.image || '');
  const [lines, setLines] = useState<Line[]>(
    (dish?.recipe || []).map((l) => {
      const e = toEntry(products.find((p) => p.id === l.ingredientId)?.unit, l.quantity);
      return { ingredientId: l.ingredientId, quantity: e.value, unit: e.unit };
    }),
  );
  // Ingrédients créés depuis cette fiche (visibles avant le rechargement de la liste).
  const [created, setCreated] = useState<Product[]>([]);
  const [newIng, setNewIng] = useState<null | { name: string; unit: string; price: string; qty: string; warehouseId: string }>(null);
  const [creatingIng, setCreatingIng] = useState(false);
  const [busy, setBusy] = useState(false);
  // Tailles de portion (« Petite », « Grande ») : prix propre + coefficient sur la recette.
  const [sizeLines, setSizeLines] = useState<{ id?: string; label: string; factor: string; price: string }[]>(
    (dish?.sizes || []).map((s) => ({ id: s.id, label: s.label, factor: String(s.factor).replace('.', ','), price: String(s.price) })),
  );
  // Suppléments proposés en caisse (« + œuf ») : libellé, ingrédient, quantité, prix.
  const [optLines, setOptLines] = useState<{ id?: string; label: string; ingredientId: string; quantity: string; unit?: string; price: string }[]>(
    (dish?.options || []).map((o) => {
      const e = toEntry(products.find((p) => p.id === o.ingredientId)?.unit, o.quantity);
      return { id: o.id, label: o.label, ingredientId: o.ingredientId, quantity: e.value, unit: e.unit, price: String(o.price) };
    }),
  );

  // Ingrédients possibles : tous les articles stockés (pas les autres plats).
  const ingredients = useMemo(
    () => [...products.filter((p) => !isDish(p)), ...created.filter((c) => !products.some((p) => p.id === c.id))],
    [products, created],
  );
  const byId = useMemo(() => new Map(ingredients.map((p) => [p.id, p])), [ingredients]);
  const stockTotal = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of productStock) m.set(s.productId, (m.get(s.productId) || 0) + (Number(s.quantity) || 0));
    return m;
  }, [productStock]);

  // Liste de TOUS les ingrédients disponibles (pas encore dans la recette), groupés par rayon :
  // d'abord la catégorie « Ingrédients » (par sous-catégorie), puis les autres articles.
  const ingredientGroups = useMemo(() => {
    const used = new Set(lines.map((l) => l.ingredientId));
    const groups = new Map<string, { label: string; first: boolean; items: Product[] }>();
    for (const p of ingredients) {
      if (used.has(p.id)) continue;
      const isIngr = /ingr[ée]dient/i.test(p.categoryName || '');
      const label = isIngr ? (p.subCategoryName || p.categoryName || 'Ingrédients') : (p.categoryName || 'Autres articles');
      const key = `${isIngr ? 0 : 1}|${label}`;
      if (!groups.has(key)) groups.set(key, { label, first: isIngr, items: [] });
      groups.get(key)!.items.push(p);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([, g]) => ({ ...g, items: g.items.sort((x, y) => x.name.localeCompare(y.name, 'fr')) }));
  }, [ingredients, lines]);
  const availableCount = ingredientGroups.reduce((s, g) => s + g.items.length, 0);

  // Quantité d'une ligne dans l'unité de stock de l'ingrédient (4 cl → 0,04 L ; 120 g → 0,12 kg).
  const baseQty = (l: Line) => {
    const v = parseDecimal(l.quantity);
    return v > 0 ? fromEntry(byId.get(l.ingredientId)?.unit, v, l.unit) : 0;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recipe = useMemo(() => normalizeRecipe(lines.map((l) => ({ ingredientId: l.ingredientId, quantity: baseQty(l) }))), [lines, byId]);
  const cost = recipeCost(recipe, byId);
  const price = parseDecimal(salePrice) || 0;
  const { margin, costRatio } = dishMargin(price, cost);
  const portions = portionsPossible(recipe, (id) => stockTotal.get(id) || 0);
  const invalidLines = lines.filter((l) => !(parseDecimal(l.quantity) > 0));

  const addIngredient = (p: Product) => {
    setLines((ls) => (ls.some((l) => l.ingredientId === p.id) ? ls : [...ls, { ingredientId: p.id, quantity: '', unit: defaultEntryUnit(p.unit) }]));
  };

  // Création rapide d'un ingrédient sans quitter la fiche du plat.
  const openNewIngredient = (nm = '') =>
    setNewIng({ name: nm.trim(), unit: 'Kg', price: '', qty: '', warehouseId: warehouses[0]?.id || '' });
  const saveNewIngredient = async () => {
    if (!newIng) return;
    const nm = newIng.name.trim();
    if (!nm) return showAlert("Donnez un nom à l'ingrédient.", { variant: 'warning' });
    const existing = ingredients.find((p) => p.name.trim().toLowerCase() === nm.toLowerCase());
    if (existing) { addIngredient(existing); setNewIng(null); return; }
    const buy = parseDecimal(newIng.price);
    if (newIng.price.trim() === '' || !(buy >= 0)) return showAlert(`Indiquez le prix d'achat (par ${newIng.unit}).`, { variant: 'warning' });
    const qty = newIng.qty.trim() === '' ? 0 : parseDecimal(newIng.qty);
    if (!(qty >= 0)) return showAlert('Stock initial invalide.', { variant: 'warning' });
    const cat = categories.find((c) => !c.parentId && /ingr[ée]dient/i.test(c.name));
    const now = new Date().toISOString();
    setCreatingIng(true);
    try {
      const p = await createProduct({
        sku: 'ING-' + generateId().slice(0, 6).toUpperCase(),
        barcode: generateEan13(products.map((x) => x.barcode)),
        qrCode: '',
        name: nm,
        description: '',
        categoryId: cat?.id || '',
        categoryName: cat?.name || '',
        subCategoryId: null,
        subCategoryName: '',
        brandId: '',
        brandName: '',
        purchasePrice: buy,
        salePrice: Math.round(buy * 1.3),
        vatRate: 0,
        unit: newIng.unit,
        packSize: 1,
        packLabel: null,
        packPurchasePrice: null,
        packSalePrice: null,
        minStock: 0,
        maxStock: 0,
        image: '',
        expirationDate: null,
        lotNumber: '',
        supplierId: '',
        supplierName: '',
        locationId: newIng.warehouseId,
        quantity: 0,
        trackSerial: false,
        warrantyMonths: 0,
        status: 'out_of_stock',
        createdAt: now,
        updatedAt: now,
      } as Omit<Product, 'id'>);
      if (qty > 0) {
        await createMovement({
          type: 'entry_reception',
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          warehouseId: newIng.warehouseId,
          quantity: qty,
          reason: "Quantité d'entrée initiale",
          costPrice: buy,
          costTotal: buy * qty,
          referenceId: 'INITIAL',
        } as any);
      }
      setCreated((c) => [...c, { ...p, quantity: qty }]);
      setLines((ls) => [...ls, { ingredientId: p.id, quantity: '', unit: defaultEntryUnit(p.unit) }]);
      setNewIng(null);
      onIngredientCreated?.();
      showToast(`Ingrédient « ${p.name} » créé${qty > 0 ? ` (stock ${String(qty).replace('.', ',')} ${p.unit})` : ''}.`, { title: 'Ingrédients' });
    } catch (err: any) {
      showAlert(err?.message || "Erreur de création de l'ingrédient.", { variant: 'error' });
    } finally {
      setCreatingIng(false);
    }
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
    if (!name.trim()) return showAlert('Donnez un nom au plat ou à la boisson.', { variant: 'warning' });
    if (!(price > 0)) return showAlert('Indiquez le prix de vente du plat.', { variant: 'warning' });
    if (invalidLines.length) return showAlert('Indiquez la quantité de chaque ingrédient (par portion).', { variant: 'warning' });
    if (recipe.length === 0 && !(await showConfirm(
      "Ce plat n'a pas encore de recette : il sera vendu sans retirer d'ingrédients du stock. Continuer ?",
      { title: 'Plat sans recette', confirmText: 'Enregistrer quand même' },
    ))) return;
    const badOpt = optLines.find((o) => !o.label.trim() || !o.ingredientId || !(parseDecimal(o.quantity) > 0) || !(parseDecimal(o.price) >= 0) || o.price.trim() === '');
    if (badOpt) return showAlert('Complétez chaque supplément : nom, ingrédient, quantité et prix (ou supprimez la ligne).', { variant: 'warning' });
    const badSize = sizeLines.find((s) => !s.label.trim() || !(parseDecimal(s.price) > 0) || !(parseDecimal(s.factor) >= 0.1 && parseDecimal(s.factor) <= 5));
    if (badSize) return showAlert('Complétez chaque taille : nom, coefficient (entre 0,1 et 5) et prix (ou supprimez la ligne).', { variant: 'warning' });
    const sizeBelowCost = sizeLines.find((s) => parseDecimal(s.price) < cost * parseDecimal(s.factor));
    if (sizeBelowCost) return showAlert(`La taille « ${sizeBelowCost.label} » est vendue sous son coût de revient (${format(cost * parseDecimal(sizeBelowCost.factor))}) : la caisse refuserait la vente.`, { variant: 'warning' });
    if (price < cost) {
      return showAlert(`Le prix de vente (${format(price)}) est inférieur au coût de revient (${format(cost)}) : la caisse refuserait la vente. Augmentez le prix ou revoyez la recette.`, { variant: 'warning' });
    }

    const cat = categories.find((c) => c.id === categoryId);
    const sub = categories.find((c) => c.id === subCategoryId);
    const now = new Date().toISOString();
    const data = {
      kind: 'dish' as const,
      recipe,
      options: normalizeOptions(optLines.map((o) => ({ ...o, quantity: fromEntry(byId.get(o.ingredientId)?.unit, parseDecimal(o.quantity), o.unit), price: o.price }))),
      sizes: normalizeSizes(sizeLines),
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
            {dish ? 'Modifier le plat' : 'Nouveau plat ou boisson préparée'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm" aria-label="Fermer">✕</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-5 max-h-[80vh] overflow-y-auto text-xs">
          {/* Identité du plat */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-slate-400 block mb-1">Nom (plat ou boisson) *</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="ex. Riz cantonais, Mine sao poulet, Mojito, Jus de mangue frais" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 block">Catégorie</label>
                  {onManageCategories && (
                    <button type="button" onClick={() => onManageCategories()} className="text-[10px] text-cyan-400 hover:underline">+ Gérer</button>
                  )}
                </div>
                <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubCategoryId(''); }} className={field}>
                  <option value="">— Aucune —</option>
                  {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 block">Sous-catégorie</label>
                  {onManageCategories && (
                    <button
                      type="button"
                      onClick={() => onManageCategories(categoryId || undefined)}
                      title={categoryId ? 'Ajouter une sous-catégorie dans la catégorie choisie' : 'Gérer les catégories et sous-catégories'}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      + Gérer
                    </button>
                  )}
                </div>
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
              <p className="text-[11px] text-slate-500 mt-0.5">À chaque vente, ces quantités sont retirées du stock. Saisissez en g, kg, cl, ml ou L : la conversion vers l'unité de stock est automatique (ex. 4 cl de rhum, 120 g de riz).</p>
            </div>

            <div className="p-3.5 space-y-2">
              {lines.length === 0 && <p className="text-slate-400 italic">Aucun ingrédient pour l'instant — cherchez-en un ci-dessous.</p>}
              {lines.map((l, i) => {
                const ing = byId.get(l.ingredientId);
                const qty = parseDecimal(l.quantity);
                const base = baseQty(l);
                const lineCost = ing && base > 0 ? base * ing.purchasePrice : 0;
                const bad = l.quantity !== '' && !(qty > 0);
                const units = entryUnits(ing?.unit);
                const converted = ing && base > 0 && (l.unit || ing.unit) !== ing.unit;
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
                        placeholder={l.unit === 'g' ? '120' : l.unit === 'cl' ? '4' : l.unit === 'ml' ? '30' : '0,000'}
                      />
                      {units.length > 1 ? (
                        <select
                          value={l.unit || ing?.unit}
                          onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}
                          className={`${field} w-20 px-1.5`}
                          aria-label={`Unité de saisie de ${ing?.name || 'ingrédient'}`}
                        >
                          {units.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                        </select>
                      ) : (
                        <span className="w-20 text-slate-500 truncate">{ing?.unit}</span>
                      )}
                    </div>
                    <span className="w-20 text-right text-[10px] text-slate-400 font-mono" data-testid="recipe-line-base">
                      {converted ? `= ${fmtQty(base)} ${ing!.unit}` : ''}
                    </span>
                    <span className="w-24 text-right font-mono text-slate-600 dark:text-slate-300">{format(lineCost)}</span>
                    <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="p-1.5 text-slate-400 hover:text-red-500" aria-label={`Retirer ${ing?.name || "l'ingrédient"}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              <div className="pt-1">
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__new__') openNewIngredient();
                    else { const p = byId.get(v); if (p) addIngredient(p); }
                  }}
                  className={`${field} font-semibold text-cyan-700 dark:text-cyan-300`}
                  aria-label="Ajouter un ingrédient"
                  data-testid="ingredient-picker"
                >
                  <option value="">
                    {availableCount ? `+ Ajouter un ingrédient (${availableCount} disponibles)…` : '+ Ajouter un ingrédient…'}
                  </option>
                  {ingredientGroups.map((g) => (
                    <optgroup key={g.label + g.first} label={g.label}>
                      {g.items.map((p) => {
                        const st = stockTotal.get(p.id) || 0;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} — stock {fmtQty(st)} {p.unit}{st <= 0 ? ' ⚠ rupture' : ''} · {format(p.purchasePrice)}/{p.unit}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                  <option value="__new__">➕ Créer un nouvel ingrédient…</option>
                </select>
              </div>

              {!newIng && (
                <button type="button" onClick={() => openNewIngredient()} className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
                  <PackagePlus className="w-3.5 h-3.5" /> Nouvel ingrédient (pas encore dans la liste)
                </button>
              )}

              {newIng && (
                <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3 space-y-2" data-testid="new-ingredient-form">
                  <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <PackagePlus className="w-3.5 h-3.5 text-cyan-500" /> Nouvel ingrédient
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <label className="text-slate-400 block mb-1">Nom *</label>
                      <input autoFocus value={newIng.name} onChange={(e) => setNewIng({ ...newIng, name: e.target.value })} className={field} placeholder="Rhum blanc, citron vert…" aria-label="Nom du nouvel ingrédient" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Unité de stock *</label>
                      <select value={newIng.unit} onChange={(e) => setNewIng({ ...newIng, unit: e.target.value })} className={field} aria-label="Unité du nouvel ingrédient">
                        {INGREDIENT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Prix d'achat / {newIng.unit} *</label>
                      <input inputMode="decimal" value={newIng.price} onChange={(e) => setNewIng({ ...newIng, price: e.target.value })} className={`${field} font-mono text-right`} placeholder="0" aria-label="Prix d'achat du nouvel ingrédient" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Stock actuel ({newIng.unit})</label>
                      <input inputMode="decimal" value={newIng.qty} onChange={(e) => setNewIng({ ...newIng, qty: e.target.value })} className={`${field} font-mono text-right`} placeholder="0" aria-label="Stock initial du nouvel ingrédient" />
                    </div>
                    {warehouses.length > 1 && (
                      <div className="col-span-2 sm:col-span-1">
                        <label className="text-slate-400 block mb-1">Entrepôt</label>
                        <select value={newIng.warehouseId} onChange={(e) => setNewIng({ ...newIng, warehouseId: e.target.value })} className={field} aria-label="Entrepôt du nouvel ingrédient">
                          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Astuce : stockez les liquides en <b>Litre</b> et le reste en <b>Kg</b> : dans la recette vous pourrez saisir en cl, ml ou g.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setNewIng(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">Annuler</button>
                    <button type="button" disabled={creatingIng} onClick={saveNewIngredient} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-50">
                      {creatingIng ? 'Création…' : "Créer et ajouter à la recette"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tailles de portion */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800" data-testid="dish-sizes">
            <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Tailles <span className="font-normal text-slate-400">(facultatif)</span></p>
                <p className="text-[11px] text-slate-500 mt-0.5">La recette ci-dessus est la portion <b>normale</b> (×1). Une grande portion ×1,5 retire 1,5 fois chaque ingrédient. Avec des tailles, la caisse demande la taille.</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {sizeLines.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setSizeLines([
                      { label: 'Petite', factor: '0,7', price: String(roundPrice(price * 0.75)) },
                      { label: 'Normale', factor: '1', price: String(price) },
                      { label: 'Grande', factor: '1,5', price: String(roundPrice(price * 1.4)) },
                    ])}
                    className="text-[11px] text-cyan-500 hover:underline"
                    disabled={!(price > 0)}
                    title={price > 0 ? 'Préremplit Petite (×0,7), Normale (×1) et Grande (×1,5) avec des prix proposés' : "Indiquez d'abord le prix de vente"}
                  >
                    Petite / Normale / Grande
                  </button>
                )}
                <button type="button" onClick={() => setSizeLines((ls) => [...ls, { label: '', factor: '1', price: price > 0 ? String(price) : '' }])} className="text-[11px] text-cyan-500 hover:underline">
                  + Ajouter une taille
                </button>
              </div>
            </div>
            {sizeLines.length === 0 ? (
              <p className="p-3.5 text-slate-400 italic">Une seule taille (prix de vente ci-dessus).</p>
            ) : (
              <div className="p-3.5 space-y-2">
                <div className="grid grid-cols-[1.2fr_0.8fr_0.9fr_1.6fr_auto] gap-2 text-[10px] uppercase text-slate-400">
                  <span>Taille</span><span>Coefficient</span><span>Prix</span><span>Coût / marge</span><span />
                </div>
                {sizeLines.map((s, i) => {
                  const f = parseDecimal(s.factor);
                  const p = parseDecimal(s.price) || 0;
                  const sCost = f > 0 ? cost * f : 0;
                  const ratio = p > 0 ? Math.round((sCost / p) * 1000) / 10 : null;
                  const set = (patch: Partial<typeof s>) => setSizeLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className="grid grid-cols-[1.2fr_0.8fr_0.9fr_1.6fr_auto] gap-2 items-center" data-testid="size-line">
                      <input value={s.label} onChange={(e) => set({ label: e.target.value })} className={field} placeholder="Grande" aria-label="Nom de la taille" />
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">×</span>
                        <input inputMode="decimal" value={s.factor} onChange={(e) => set({ factor: e.target.value })} className={`${field} text-right font-mono`} aria-label="Coefficient de la taille" />
                      </div>
                      <input inputMode="decimal" value={s.price} onChange={(e) => set({ price: e.target.value })} className={`${field} text-right font-mono`} aria-label="Prix de la taille" />
                      <span className={`text-[11px] font-mono ${p > 0 && p < sCost ? 'text-red-500' : ratio != null && ratio > 40 ? 'text-amber-500' : 'text-slate-500'}`}>
                        {f > 0 ? `${format(sCost)} · ${format(p - sCost)}${ratio != null ? ` · ${String(ratio).replace('.', ',')} %` : ''}` : '—'}
                      </span>
                      <button type="button" onClick={() => setSizeLines((ls) => ls.filter((_, j) => j !== i))} className="p-1.5 text-slate-400 hover:text-red-500" aria-label="Supprimer la taille">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Suppléments proposés en caisse */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800" data-testid="dish-options">
            <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Suppléments <span className="font-normal text-slate-400">(facultatif)</span></p>
                <p className="text-[11px] text-slate-500 mt-0.5">Proposés à la caisse quand on ajoute ce plat (ex. « + œuf » : 1 œuf, 1 500 Ar). L'ingrédient est retiré du stock à la vente.</p>
              </div>
              <button
                type="button"
                onClick={() => setOptLines((ls) => [...ls, { label: '', ingredientId: '', quantity: '', price: '' }])}
                className="shrink-0 text-[11px] text-cyan-500 hover:underline"
              >
                + Ajouter un supplément
              </button>
            </div>
            {optLines.length === 0 ? (
              <p className="p-3.5 text-slate-400 italic">Aucun supplément.</p>
            ) : (
              <div className="p-3.5 space-y-2">
                <div className="grid grid-cols-[1.3fr_1.3fr_0.7fr_0.8fr_auto] gap-2 text-[10px] uppercase text-slate-400">
                  <span>Nom affiché</span><span>Ingrédient retiré</span><span>Quantité</span><span>Prix</span><span />
                </div>
                {optLines.map((o, i) => {
                  const ing = byId.get(o.ingredientId);
                  const oBase = parseDecimal(o.quantity) > 0 ? fromEntry(ing?.unit, parseDecimal(o.quantity), o.unit) : 0;
                  const oCost = ing && oBase > 0 ? oBase * ing.purchasePrice : 0;
                  const oUnits = entryUnits(ing?.unit);
                  const oPrice = parseDecimal(o.price) || 0;
                  const set = (patch: Partial<typeof o>) => setOptLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} data-testid="option-line">
                      <div className="grid grid-cols-[1.3fr_1.3fr_0.7fr_0.8fr_auto] gap-2 items-center">
                        <input value={o.label} onChange={(e) => set({ label: e.target.value })} className={field} placeholder="+ œuf" aria-label="Nom du supplément" />
                        <select
                          value={o.ingredientId}
                          onChange={(e) => {
                            const picked = byId.get(e.target.value);
                            set({ ingredientId: e.target.value, unit: defaultEntryUnit(picked?.unit), label: o.label || (picked ? `+ ${picked.name}` : '') });
                          }}
                          className={field}
                          aria-label="Ingrédient du supplément"
                        >
                          <option value="">— Choisir —</option>
                          {ingredients.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                          <input inputMode="decimal" value={o.quantity} onChange={(e) => set({ quantity: e.target.value })} className={`${field} text-right font-mono`} placeholder="1" aria-label="Quantité du supplément" />
                          {oUnits.length > 1 ? (
                            <select value={o.unit || ing?.unit} onChange={(e) => set({ unit: e.target.value })} className={`${field} w-14 px-1 text-[10px]`} aria-label="Unité du supplément">
                              {oUnits.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-[10px] text-slate-400 w-8 truncate">{ing?.unit}</span>
                          )}
                        </div>
                        <input inputMode="decimal" value={o.price} onChange={(e) => set({ price: e.target.value })} className={`${field} text-right font-mono`} placeholder="1500" aria-label="Prix du supplément" />
                        <button type="button" onClick={() => setOptLines((ls) => ls.filter((_, j) => j !== i))} className="p-1.5 text-slate-400 hover:text-red-500" aria-label="Supprimer le supplément">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {ing && oPrice > 0 && (
                        <p className={`text-[10px] mt-0.5 ${oPrice < oCost ? 'text-red-500' : 'text-slate-400'}`}>
                          Coût {format(oCost)} · marge {format(oPrice - oCost)}{oPrice < oCost ? ' — prix inférieur au coût !' : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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

/**
 * Caisse : choix des suppléments d'un plat (cases à cocher), prix total en direct.
 */
export function DishOptionsPicker({
  dish, basePrice, format, onCancel, onConfirm,
}: {
  dish: Product;
  basePrice: number;
  format: (n: number) => string;
  onCancel: () => void;
  onConfirm: (optionIds: string[], sizeId?: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const options = dish.options || [];
  const sizes = dish.sizes || [];
  // Taille présélectionnée : la normale (×1) si elle existe, sinon la première.
  const [sizeId, setSizeId] = useState<string | undefined>((sizes.find((s) => s.factor === 1) || sizes[0])?.id);
  const size = sizes.find((s) => s.id === sizeId);
  const total = (size ? size.price : basePrice) + options.filter((o) => picked.includes(o.id)).reduce((s, o) => s + o.price, 0);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-label="Suppléments">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-fade-in">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          {dish.image ? <img src={dish.image} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <ChefHat className="w-8 h-8 text-cyan-500" />}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900 dark:text-white truncate">{dish.name}</p>
            <p className="text-[11px] text-slate-400">{sizes.length ? 'Taille' : ''}{sizes.length && options.length ? ' et suppléments' : options.length ? 'Suppléments ? (facultatif)' : ''}</p>
          </div>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm" aria-label="Fermer">✕</button>
        </div>
        <div className="p-3 space-y-1.5 max-h-[50vh] overflow-y-auto">
          {sizes.length > 0 && (
            <div className="grid gap-1.5 pb-2 mb-1 border-b border-slate-200 dark:border-slate-800" style={{ gridTemplateColumns: `repeat(${Math.min(sizes.length, 3)}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Taille">
              {sizes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={sizeId === s.id}
                  onClick={() => setSizeId(s.id)}
                  className={`p-2.5 rounded-xl border text-center ${sizeId === s.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">{s.label}</span>
                  <span className="block text-xs font-mono text-cyan-600 dark:text-cyan-400">{format(s.price)}</span>
                </button>
              ))}
            </div>
          )}
          {options.map((o) => (
            <label key={o.id} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer text-sm ${picked.includes(o.id) ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
              <input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} className="w-4 h-4 accent-cyan-600" aria-label={o.label} />
              <span className="flex-1 text-slate-800 dark:text-slate-100">{o.label}</span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400">+{format(o.price)}</span>
            </label>
          ))}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <span className="text-xs text-slate-400 mr-auto">Total : <b className="font-mono text-slate-900 dark:text-white" data-testid="options-total">{format(total)}</b></span>
          {options.length > 0 && (
            <button type="button" onClick={() => onConfirm([], sizeId)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Sans supplément</button>
          )}
          <button type="button" onClick={() => onConfirm(picked, sizeId)} className="px-3 py-2 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold">Ajouter au panier</button>
        </div>
      </div>
    </div>
  );
}

const LOSS_REASONS = ['Plat raté', 'Invendu jeté en fin de service', 'Renversé / tombé', 'Retourné par le client', 'Autre'];

/**
 * Perte d'un plat (raté, invendu jeté…) : retire du stock, en « Perte / Casse », les
 * ingrédients de N portions. Aperçu des quantités et du coût avant validation.
 */
export function DishLossModal({
  dish, products, productStock, warehouses, format, onClose, onDone,
}: {
  dish: Product;
  products: Product[];
  productStock: ProductStock[];
  warehouses: { id: string; name: string }[];
  format: (n: number) => string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [portions, setPortions] = useState('1');
  const [reason, setReason] = useState(LOSS_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const n = parseDecimal(portions);
  const lossSizes = dish.sizes || [];
  const [lossSizeId, setLossSizeId] = useState<string>((lossSizes.find((s) => s.factor === 1) || lossSizes[0])?.id || '');
  const lossFactor = lossSizes.find((s) => s.id === lossSizeId)?.factor ?? 1;
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const stockHere = (id: string) =>
    productStock.filter((s) => s.productId === id && (!warehouseId || s.warehouseId === warehouseId)).reduce((a, s) => a + (Number(s.quantity) || 0), 0);
  const lines = (dish.recipe || []).map((l) => {
    const ing = byId.get(l.ingredientId);
    const need = n > 0 ? Math.round(l.quantity * lossFactor * n * 1000) / 1000 : 0;
    const available = stockHere(l.ingredientId);
    return { ing, need, available, cost: ing ? Math.min(need, available) * ing.purchasePrice : 0 };
  });
  const total = lines.reduce((s, l) => s + l.cost, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(n > 0)) return showAlert('Indiquez le nombre de portions perdues.', { variant: 'warning' });
    const motif = reason === 'Autre' ? (detail.trim() || 'Autre') : detail.trim() ? `${reason} — ${detail.trim()}` : reason;
    setBusy(true);
    try {
      const r = await declareDishLoss(dish.id, { portions: n, reason: motif, warehouseId: warehouseId || undefined, sizeId: lossSizeId || undefined });
      if (r.shortages.length) {
        showAlert(
          `Perte enregistrée (coût ${format(r.cost)}), mais le stock de certains ingrédients était déjà insuffisant :\n• ${r.shortages.map((s) => `${s.name} : il manquait ${fmtQty(s.missing)} ${s.unit}`).join('\n• ')}`,
          { title: 'Perte enregistrée', variant: 'warning' },
        );
      } else {
        showToast(`Perte de ${fmtQty(n)} « ${dish.name} » enregistrée — coût ${format(r.cost)}.`, { title: 'Stock' });
      }
      onDone();
    } catch (err: any) {
      showAlert(err?.message || "Erreur lors de l'enregistrement de la perte.", { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-label="Déclarer une perte">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in">
        <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Déclarer une perte — {dish.name}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm" aria-label="Fermer">✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4 text-xs">
          <p className="text-slate-500">Les ingrédients de ces portions sont retirés du stock en « Perte / Casse » (visible dans l'Historique des flux).</p>
          {lossSizes.length > 0 && (
            <div>
              <label className="text-slate-400 block mb-1">Taille</label>
              <select value={lossSizeId} onChange={(e) => setLossSizeId(e.target.value)} className={field} aria-label="Taille perdue">
                {lossSizes.map((s) => <option key={s.id} value={s.id}>{s.label} (×{String(s.factor).replace('.', ',')})</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Portions perdues *</label>
              <input required inputMode="decimal" value={portions} onChange={(e) => setPortions(e.target.value)} className={`${field} font-mono`} aria-label="Portions perdues" />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Motif</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={field} aria-label="Motif">
                {LOSS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {warehouses.length > 1 && (
              <div className="col-span-2">
                <label className="text-slate-400 block mb-1">Entrepôt (cuisine)</label>
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={field}>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2">
              <label className="text-slate-400 block mb-1">Précision {reason === 'Autre' ? '*' : '(facultatif)'}</label>
              <input value={detail} onChange={(e) => setDetail(e.target.value)} required={reason === 'Autre'} className={field} placeholder="ex. trop cuit, commande annulée…" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800" data-testid="loss-preview">
            <p className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-white">Sera retiré du stock</p>
            <ul className="p-3 space-y-1">
              {lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-200 truncate">{l.ing?.name || 'Ingrédient supprimé'}</span>
                  <span className={`font-mono whitespace-nowrap ${l.need > l.available ? 'text-amber-500' : 'text-slate-500'}`} title={l.need > l.available ? `Il n'en reste que ${fmtQty(l.available)} ${l.ing?.unit || ''}` : undefined}>
                    −{fmtQty(l.need)} {l.ing?.unit}{l.need > l.available ? ' (stock insuffisant)' : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 flex justify-between">
              <span className="text-slate-400">Coût de la perte :</span>
              <span className="font-mono font-bold text-red-500" data-testid="loss-cost">{format(Math.round(total))}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Annuler</button>
            <button type="submit" disabled={busy || !(n > 0)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold disabled:opacity-60">
              {busy ? 'Enregistrement…' : 'Déclarer la perte'}
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

