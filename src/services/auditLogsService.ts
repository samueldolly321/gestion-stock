/**
 * Service front pour le journal d'audit (lecture seule) — API PostgreSQL.
 */
import { apiFetch } from './api';
import type { AuditLog } from '../types';

export function listAuditLogs(): Promise<AuditLog[]> {
  return apiFetch<AuditLog[]>('/audit-logs');
}
