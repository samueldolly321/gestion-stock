/**
 * Service front pour le catalogue d'approvisionnement : quels produits chaque
 * fournisseur fournit, avec son prix d'achat négocié (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { SupplierProduct } from '../types';

// Liste les associations fournisseur↔produit (toutes, ou filtrées par fournisseur).
export function listSupplierProducts(supplierId?: string): Promise<SupplierProduct[]> {
  const qs = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : '';
  return apiFetch<SupplierProduct[]>(`/supplier-products${qs}`);
}

// Associe un produit à un fournisseur (ou met à jour son prix si déjà présent).
export function saveSupplierProduct(data: {
  supplierId: string;
  productId: string;
  purchasePrice: number;
  supplierRef?: string | null;
}): Promise<SupplierProduct> {
  return apiFetch<SupplierProduct>('/supplier-products', { method: 'POST', body: JSON.stringify(data) });
}

// Met à jour le prix / la référence d'une ligne existante.
export function updateSupplierProduct(
  id: string,
  data: { purchasePrice?: number; supplierRef?: string | null },
): Promise<SupplierProduct> {
  return apiFetch<SupplierProduct>(`/supplier-products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

// Retire un produit du catalogue d'un fournisseur.
export function deleteSupplierProduct(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/supplier-products/${id}`, { method: 'DELETE' });
}
