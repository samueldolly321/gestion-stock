/**
 * Service front pour les tarifs de vente par client (API PostgreSQL).
 * Absence de tarif = prix de vente par défaut de la fiche article.
 */
import { apiFetch } from './api';
import type { ClientPrice } from '../types';

// Liste les tarifs négociés (tous, ou filtrés par client).
export function listClientPrices(clientId?: string): Promise<ClientPrice[]> {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  return apiFetch<ClientPrice[]>(`/client-prices${qs}`);
}

// Définit le prix de vente d'un produit pour un client (ou met à jour s'il existe).
export function saveClientPrice(data: {
  clientId: string;
  productId: string;
  salePrice: number;
}): Promise<ClientPrice> {
  return apiFetch<ClientPrice>('/client-prices', { method: 'POST', body: JSON.stringify(data) });
}

// Met à jour le prix d'un tarif existant.
export function updateClientPrice(id: string, data: { salePrice: number }): Promise<ClientPrice> {
  return apiFetch<ClientPrice>(`/client-prices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

// Supprime un tarif négocié (retour au prix par défaut).
export function deleteClientPrice(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/client-prices/${id}`, { method: 'DELETE' });
}
