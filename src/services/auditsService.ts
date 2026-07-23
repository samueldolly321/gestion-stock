/**
 * Service front pour les inventaires (audits) — API PostgreSQL.
 */
import { apiFetch } from './api';
import type { InventoryAudit, AuditItem } from '../types';

export function listAudits(): Promise<InventoryAudit[]> {
  return apiFetch<InventoryAudit[]>('/audits');
}

export function createAudit(data: {
  title: string;
  warehouseId?: string;
  warehouseName?: string;
  items: AuditItem[];
}): Promise<InventoryAudit> {
  return apiFetch<InventoryAudit>('/audits', { method: 'POST', body: JSON.stringify(data) });
}

// Valide l'inventaire : ajuste les stocks selon les écarts (côté serveur).
export function validateAudit(id: string, items: AuditItem[]): Promise<InventoryAudit> {
  return apiFetch<InventoryAudit>(`/audits/${id}/validate`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export function cancelAudit(id: string): Promise<InventoryAudit> {
  return apiFetch<InventoryAudit>(`/audits/${id}/cancel`, { method: 'POST' });
}
