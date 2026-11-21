/**
 * Restauration — plats avec recette (partagé front + serveur).
 *
 * Un plat (`kind = 'dish'`) n'a pas de stock propre : sa recette indique, pour UNE
 * portion, la quantité de chaque ingrédient (dans l'unité de l'ingrédient : 0,12 kg,
 * 0,3 L…). Vendre N portions retire N × quantité de chaque ingrédient du stock.
 */
import type { Product, RecipeItem } from '../types';

export const MAX_RECIPE_LINES = 60;

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
