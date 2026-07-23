/**
 * Service front pour les livraisons (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { Delivery, DeliveryType } from '../types';

// Types de transport + tarif par défaut (Ariary), modifiable à la saisie.
export const DELIVERY_TYPES: { value: DeliveryType; label: string; icon: string; defaultFee: number }[] = [
  { value: 'moto', label: 'Moto', icon: '🏍️', defaultFee: 5000 },
  { value: 'voiture', label: 'Voiture', icon: '🚗', defaultFee: 15000 },
  { value: 'camion', label: 'Camion', icon: '🚚', defaultFee: 50000 },
  { value: 'velo', label: 'Vélo', icon: '🚲', defaultFee: 3000 },
  { value: 'pied', label: 'À pied', icon: '🚶', defaultFee: 0 },
];

export function deliveryTypeLabel(t: DeliveryType): string {
  return DELIVERY_TYPES.find((d) => d.value === t)?.label ?? t;
}

export function defaultFeeFor(t: DeliveryType): number {
  return DELIVERY_TYPES.find((d) => d.value === t)?.defaultFee ?? 0;
}

export function listDeliveries(): Promise<Delivery[]> {
  return apiFetch<Delivery[]>('/deliveries');
}

export function createDelivery(
  data: Omit<Delivery, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
): Promise<Delivery> {
  return apiFetch<Delivery>('/deliveries', { method: 'POST', body: JSON.stringify(data) });
}

export function updateDelivery(id: string, data: Partial<Delivery>): Promise<Delivery> {
  return apiFetch<Delivery>(`/deliveries/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteDelivery(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/deliveries/${id}`, { method: 'DELETE' });
}
