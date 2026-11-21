/**
 * Restauration — plats avec recette (partagé front + serveur).
 *
 * Un plat (`kind = 'dish'`) n'a pas de stock propre : sa recette indique, pour UNE
 * portion, la quantité de chaque ingrédient (dans l'unité de l'ingrédient : 0,12 kg,
 * 0,3 L…). Vendre N portions retire N × quantité de chaque ingrédient du stock.
 */
import type { DishOption, Product, RecipeItem } from '../types';

export const MAX_RECIPE_LINES = 60;
export const MAX_DISH_OPTIONS = 20;

/**
 * Nettoie les suppléments d'un plat : libellé obligatoire, prix ≥ 0, ingrédient et quantité > 0.
 * Un identifiant stable est conservé (ou créé) pour chaque supplément.
 */
export function normalizeOptions(raw: unknown): DishOption[] {
  if (!Array.isArray(raw)) return [];
  const out: DishOption[] = [];
  const seen = new Set<string>();
  for (const o of raw) {
    const label = String(o?.label ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const ingredientId = typeof o?.ingredientId === 'string' ? o.ingredientId.trim() : '';
    const quantity = Number(String(o?.quantity ?? '').replace(',', '.'));
    const price = Number(String(o?.price ?? '').replace(',', '.'));
    if (!label || !ingredientId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) continue;
    let id = typeof o?.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(o.id) ? o.id : '';
    if (!id || seen.has(id)) id = 'OPT-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    seen.add(id);
    out.push({ id, label, price: Math.round(price * 100) / 100, ingredientId, quantity: round3(quantity) });
    if (out.length >= MAX_DISH_OPTIONS) break;
  }
  return out;
}

/** Coût d'un supplément = quantité × prix d'achat de son ingrédient. */
export function optionCost(o: Pick<DishOption, 'ingredientId' | 'quantity'>, productsById: Map<string, Pick<Product, 'purchasePrice'>>): number {
  return Math.round(o.quantity * (Number(productsById.get(o.ingredientId)?.purchasePrice) || 0) * 100) / 100;
}

/**
 * Lignes de facture regroupées par article (un même plat peut figurer sur plusieurs lignes
 * avec des suppléments différents) : quantités et montants cumulés. Sert aux avoirs.
 */
export function mergeByProduct<T extends { productId: string; quantity: number }>(items: T[]): T[] {
  const acc = new Map<string, any>();
  for (const it of items as any[]) {
    const cur = acc.get(it.productId);
    if (!cur) { acc.set(it.productId, { ...it }); continue; }
    cur.quantity = (Number(cur.quantity) || 0) + (Number(it.quantity) || 0);
    cur.total = (Number(cur.total) || 0) + (Number(it.total) || 0);
    if (Array.isArray(it.serials)) cur.serials = [...(cur.serials || []), ...it.serials];
  }
  return [...acc.values()];
}

/** Clé d'une combinaison plat + suppléments (ordre indifférent) — une ligne de panier par combinaison. */
export const optionsKey = (productId: string, optionIds: string[]) =>
  optionIds.length ? `${productId}|${[...optionIds].sort().join(',')}` : productId;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export const isDish = (p: { kind?: string | null } | null | undefined) => p?.kind === 'dish';

/**
 * Nettoie une recette reçue (formulaire, API) : lignes valides seulement, quantités
 * positives arrondies au millième, un même ingrédient regroupé sur une seule ligne.
 */
export function normalizeRecipe(raw: unknown): RecipeItem[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, number>();
  for (const line of raw) {
    const id = typeof line?.ingredientId === 'string' ? line.ingredientId.trim() : '';
    const qty = Number(String(line?.quantity ?? '').replace(',', '.'));
    if (!id || !Number.isFinite(qty) || qty <= 0) continue;
    byId.set(id, round3((byId.get(id) || 0) + qty));
  }
  return [...byId].slice(0, MAX_RECIPE_LINES).map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
}

/** Coût de revient d'une portion = Σ quantité × prix d'achat de l'ingrédient. */
export function recipeCost(recipe: RecipeItem[] | null | undefined, productsById: Map<string, Pick<Product, 'purchasePrice'>>): number {
  let total = 0;
  for (const line of recipe || []) {
    const ing = productsById.get(line.ingredientId);
    if (ing) total += line.quantity * (Number(ing.purchasePrice) || 0);
  }
  return Math.round(total * 100) / 100;
}

/**
 * Portions réalisables avec le stock disponible (`stockOf` = stock de l'ingrédient dans
 * l'entrepôt concerné). `null` si la recette est vide (plat sans suivi d'ingrédients).
 */
export function portionsPossible(recipe: RecipeItem[] | null | undefined, stockOf: (ingredientId: string) => number): number | null {
  if (!recipe || recipe.length === 0) return null;
  let min = Infinity;
  for (const line of recipe) {
    const available = Math.max(0, Number(stockOf(line.ingredientId)) || 0);
    min = Math.min(min, Math.floor(round3(available / line.quantity)));
  }
  return Number.isFinite(min) ? min : 0;
}

/** Marge et part du coût matière dans le prix de vente (en %). */
export function dishMargin(salePrice: number, cost: number) {
  const margin = Math.round((salePrice - cost) * 100) / 100;
  const costRatio = salePrice > 0 ? Math.round((cost / salePrice) * 1000) / 10 : null;
  return { margin, costRatio };
}
