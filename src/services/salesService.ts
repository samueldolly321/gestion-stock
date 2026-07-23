/**
 * Service front pour les ventes / POS (API PostgreSQL).
 * La création d'une vente déduit le stock et crédite la fidélité côté serveur.
 */
import { apiFetch } from './api';
import type { Sale } from '../types';

export function listSales(): Promise<Sale[]> {
  return apiFetch<Sale[]>('/sales');
}

// Le serveur génère l'id, la date, et renseigne le caissier depuis le jeton.
export function createSale(
  data: Omit<Sale, 'id' | 'createdAt' | 'cashierId' | 'cashierName' | 'paidAmount'> & { paidAmount?: number },
): Promise<Sale> {
  return apiFetch<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) });
}

/** Enregistre un règlement client sur une vente (réduit le reste dû). */
export function paySale(id: string, amount: number, method?: string, note?: string): Promise<Sale> {
  return apiFetch<Sale>(`/sales/${id}/pay`, { method: 'POST', body: JSON.stringify({ amount, method, note }) });
}

export interface CreditNoteLine { productId: string; quantity: number; }

/**
 * Établit un avoir (note de crédit) sur une facture : le serveur crée l'avoir
 * numéroté (AV-…), réintègre le stock (sauf restock === false) et ajuste la créance.
 */
export function createCreditNote(
  saleId: string,
  data: { lines: CreditNoteLine[]; reason?: string; restock?: boolean },
): Promise<Sale> {
  return apiFetch<Sale>(`/sales/${saleId}/credit-note`, { method: 'POST', body: JSON.stringify(data) });
}
