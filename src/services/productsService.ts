/**
 * Service front pour les produits (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { Product } from '../types';

export function listProducts(): Promise<Product[]> {
  return apiFetch<Product[]>('/products');
}

export function createProduct(data: Omit<Product, 'id'>): Promise<Product> {
  return apiFetch<Product>('/products', { method: 'POST', body: JSON.stringify(data) });
}

export function updateProduct(id: string, data: Partial<Product>): Promise<Product> {
  return apiFetch<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteProduct(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' });
}
