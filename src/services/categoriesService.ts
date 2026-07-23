/**
 * Service front pour les catégories / sous-catégories (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { Category } from '../types';

export function listCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/categories');
}

export function createCategory(input: {
  name: string;
  description?: string;
  parentId?: string | null;
}): Promise<Category> {
  return apiFetch<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCategory(id: string, input: { name: string; description?: string }): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteCategory(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/categories/${id}`, { method: 'DELETE' });
}
