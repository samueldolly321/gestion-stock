/**
 * Service front pour les mouvements de stock (API PostgreSQL).
 * La création d'un mouvement met automatiquement à jour la quantité du produit côté serveur.
 */
import { apiFetch } from './api';
import type { StockMovement, Product } from '../types';

export function listMovements(): Promise<StockMovement[]> {
  return apiFetch<StockMovement[]>('/movements');
}

// Entrée d'un mouvement : le serveur renvoie le mouvement créé et le produit mis à jour.
export function createMovement(
  data: Omit<StockMovement, 'id' | 'createdAt' | 'performedBy'>,
): Promise<{ movement: StockMovement; product: Product }> {
  return apiFetch('/movements', { method: 'POST', body: JSON.stringify(data) });
}
