/**
 * Service front pour les produits (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { Product } from '../types';

export function listProducts(): Promise<Product[]> {
  return apiFetch<Product[]>('/products');
}

export function createProduct(data: Omit<Product, 'id'>): Promise<Product> {
  return apiFetch<Product>('/products', { method: 'POST', body: JSON.stringify(data) });
}

export function updateProduct(id: string, data: Partial<Product>): Promise<Product> {
  return apiFetch<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export interface DishLossResult {
  portions: number;
  reason: string;
  reference: string;
  cost: number;
  removed: { name: string; unit: string; quantity: number; cost: number }[];
  shortages: { name: string; unit: string; missing: number }[];
}

/** Restauration : déclare la perte de N portions d'un plat (retire ses ingrédients en « perte »). */
export function declareDishLoss(id: string, data: { portions: number; reason?: string; warehouseId?: string; sizeId?: string }): Promise<DishLossResult> {
  return apiFetch<DishLossResult>(`/products/${id}/dish-loss`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteProduct(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' });
}

// ---------- Variantes (modèle taille × couleur) ----------

export interface VariantGridInput {
  modelName?: string;
  baseSku?: string;
  /** Modèle existant : ajoute seulement les cases manquantes. */
  variantGroup?: string;
  sizes: string[];
  colors: string[];
  /** Stock initial par case, clé « taille|couleur ». */
  quantities?: Record<string, number>;
  warehouseId?: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  subCategoryId?: string | null;
  subCategoryName?: string;
  brandId?: string;
  brandName?: string;
  supplierId?: string;
  supplierName?: string;
  image?: string;
  unit?: string;
  purchasePrice?: number;
  salePrice?: number;
  vatRate?: number;
  minStock?: number;
  maxStock?: number;
}

export function createVariants(data: VariantGridInput): Promise<{ variantGroup: string; modelName: string; products: Product[] }> {
  return apiFetch('/products/variants', { method: 'POST', body: JSON.stringify(data) });
}

/** Modifie les champs communs (nom du modèle, prix, catégorie…) de toutes les variantes. */
export function updateModel(variantGroup: string, data: Partial<VariantGridInput>): Promise<{ ok: boolean; count: number }> {
  return apiFetch(`/products/variants/${encodeURIComponent(variantGroup)}`, { method: 'PUT', body: JSON.stringify(data) });
}
