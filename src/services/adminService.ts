/**
 * Service front pour les actions d'administration sensibles (Super Admin).
 */
import { apiFetch } from './api';

export interface ResetFiguresResult {
  ok: boolean;
  cleared: Record<string, number>;
}

/**
 * Remet les chiffres à zéro (stock, ventes, achats, soldes clients…) en gardant
 * le catalogue produits, les clients et les fournisseurs. Le mot de confirmation
 * (« REINITIALISER ») est revérifié côté serveur.
 */
export function resetFigures(confirm: string): Promise<ResetFiguresResult> {
  return apiFetch<ResetFiguresResult>('/admin/reset-figures', {
    method: 'POST',
    body: JSON.stringify({ confirm }),
  });
}
