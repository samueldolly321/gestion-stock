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
