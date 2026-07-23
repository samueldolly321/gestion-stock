/**
 * Service front pour les dépenses diverses (API PostgreSQL).
 */
import { apiFetch } from './api';
import type { Expense, ExpenseCategory } from '../types';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: 'transport', label: 'Transport', icon: '🚚' },
  { value: 'douane', label: 'Douane', icon: '🛃' },
  { value: 'taxe', label: 'Taxe / Impôt', icon: '🧾' },
  { value: 'commission', label: 'Commission', icon: '🤝' },
  { value: 'manutention', label: 'Manutention', icon: '📦' },
  { value: 'carburant', label: 'Carburant', icon: '⛽' },
  { value: 'autre', label: 'Autre', icon: '💸' },
];

export function expenseCategoryLabel(c: string): string {
  return EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export function listExpenses(): Promise<Expense[]> {
  return apiFetch<Expense[]>('/expenses');
}

export function createExpense(data: Partial<Expense>): Promise<Expense> {
  return apiFetch<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) });
}

export function updateExpense(id: string, data: Partial<Expense>): Promise<Expense> {
  return apiFetch<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteExpense(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/expenses/${id}`, { method: 'DELETE' });
}
