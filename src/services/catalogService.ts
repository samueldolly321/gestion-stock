/**
 * Service front pour le catalogue transverse : marques et entrepôts (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { Brand, Warehouse, ProductStock } from '../types';

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
export type WarehouseInput = {
  name: string;
  location?: string;
  code?: string;
  capacity?: number;
  status?: 'active' | 'inactive';
  managerId?: string;
};
export function createWarehouse(data: WarehouseInput): Promise<Warehouse> {
  return apiFetch<Warehouse>('/warehouses', { method: 'POST', body: JSON.stringify(data) });
}
export function updateWarehouse(id: string, data: WarehouseInput): Promise<Warehouse> {
  return apiFetch<Warehouse>(`/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export function deleteWarehouse(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/warehouses/${id}`, { method: 'DELETE' });
}

// --- Stock par entrepôt (répartition produit × entrepôt) ---
export function listProductStock(): Promise<ProductStock[]> {
  return apiFetch<ProductStock[]>('/warehouses/stock');
}
