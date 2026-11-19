/**
 * Service front pour les réglages de l'entreprise (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { Setting } from '../types';

export function getSettings(): Promise<Setting | null> {
  return apiFetch<Setting | null>('/settings');
}

export function saveSettings(data: Partial<Setting>): Promise<Setting> {
  return apiFetch<Setting>('/settings', { method: 'PUT', body: JSON.stringify(data) });
}

/** Fiche société (nom, logo, NIF, STAT, coordonnées) — écran qui suit le choix du secteur. */
export function saveCompany(data: {
  companyName: string;
  logo?: string | null;
  taxId?: string;
  statNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
}): Promise<Setting> {
  return apiFetch<Setting>('/settings/company', { method: 'PUT', body: JSON.stringify(data) });
}

/** Secteurs d'activité + création optionnelle des catégories proposées. */
export function saveSectors(
  sectors: string[],
  categories: { name: string; children?: string[] }[] = [],
): Promise<{ settings: Setting; createdCategories: number }> {
  return apiFetch('/settings/sectors', { method: 'PUT', body: JSON.stringify({ sectors, categories }) });
}

// Infos publiques (sans authentification) pour le portail de connexion.
export interface PublicPages {
  brandName: string | null;
  companyName: string | null;
  aboutText: string | null;
  privacyText: string | null;
}
export function getPublicPages(): Promise<PublicPages> {
  return apiFetch<PublicPages>('/settings/public');
}
