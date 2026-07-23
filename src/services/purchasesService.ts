/**
 * Service front pour les achats / fournisseurs (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { Purchase, PurchaseItem } from '../types';

export function listPurchases(): Promise<Purchase[]> {
  return apiFetch<Purchase[]>('/purchases');
}

export function createPurchase(data: {
  supplierId: string;
  supplierName?: string;
  items: PurchaseItem[];
  discountAmount?: number;
  notes?: string;
}): Promise<Purchase> {
  return apiFetch<Purchase>('/purchases', { method: 'POST', body: JSON.stringify(data) });
}

export function receivePurchase(id: string): Promise<Purchase> {
  return apiFetch<Purchase>(`/purchases/${id}/receive`, { method: 'POST' });
}

export function payPurchase(id: string, amount: number): Promise<Purchase> {
  return apiFetch<Purchase>(`/purchases/${id}/pay`, { method: 'POST', body: JSON.stringify({ amount }) });
}

export function deletePurchase(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/purchases/${id}`, { method: 'DELETE' });
}
