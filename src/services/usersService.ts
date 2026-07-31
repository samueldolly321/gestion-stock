/**
 * Service front pour la gestion des utilisateurs (Super Admin / Admin).
 */
import { apiFetch } from './api';
import type { User } from '../types';

export function listUsers(): Promise<User[]> {
  return apiFetch<User[]>('/users');
}

export function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: string;
  active?: boolean;
  warehouseId?: string | null;
}): Promise<User> {
  return apiFetch<User>('/users', { method: 'POST', body: JSON.stringify(data) });
}

export function updateUser(
  id: string,
  data: { name?: string; role?: string; active?: boolean; warehouseId?: string | null },
): Promise<User> {
  return apiFetch<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function resetUserPassword(id: string, password: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/users/${id}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function deleteUser(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' });
}
