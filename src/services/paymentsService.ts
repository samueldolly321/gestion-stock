/**
 * Service front pour l'historique des règlements (clients / fournisseurs).
 */
import { apiFetch } from './api';
import type { Payment } from '../types';

export function listPayments(params?: { refId?: string; partyId?: string }): Promise<Payment[]> {
  const q = params?.refId
    ? `?refId=${encodeURIComponent(params.refId)}`
    : params?.partyId
    ? `?partyId=${encodeURIComponent(params.partyId)}`
    : '';
  return apiFetch<Payment[]>(`/payments${q}`);
}
