/**
 * Service front pour les partenaires : clients et fournisseurs (API PostgreSQL).
 * Le type ('clients' | 'suppliers') correspond directement au chemin de l'API.
 */
import { apiFetch } from './api';
import type { Client, Supplier } from '../types';

export type PartnerType = 'clients' | 'suppliers';

export function listClients(): Promise<Client[]> {
  return apiFetch<Client[]>('/clients');
}

export function listSuppliers(): Promise<Supplier[]> {
  return apiFetch<Supplier[]>('/suppliers');
}

// Crée (POST) ou met à jour (PUT) un partenaire selon la présence d'un id.
export function savePartner(type: PartnerType, data: Record<string, unknown>, id?: string): Promise<any> {
  return apiFetch(`/${type}${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deletePartner(type: PartnerType, id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/${type}/${id}`, { method: 'DELETE' });
}
