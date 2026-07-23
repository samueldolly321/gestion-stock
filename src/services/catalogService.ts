/**
 * Service front pour le catalogue transverse : marques et entrepôts (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { Brand, Warehouse } from '../types';

// --- Marques ---
export function listBrands(): Promise<Brand[]> {
  return apiFetch<Brand[]>('/brands');
}
export function createBrand(data: { name: string; description?: string }): Promise<Brand> {
  return apiFetch<Brand>('/brands', { method: 'POST', body: JSON.stringify(data) });
}
export function deleteBrand(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/brands/${id}`, { method: 'DELETE' });
}

// --- Entrepôts ---
export function listWarehouses(): Promise<Warehouse[]> {
  return apiFetch<Warehouse[]>('/warehouses');
}
export function createWarehouse(data: {
  name: string;
  location?: string;
  code?: string;
  capacity?: number;
}): Promise<Warehouse> {
  return apiFetch<Warehouse>('/warehouses', { method: 'POST', body: JSON.stringify(data) });
}
export function deleteWarehouse(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/warehouses/${id}`, { method: 'DELETE' });
}
