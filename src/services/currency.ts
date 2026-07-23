/**
 * Gestion de la devise.
 * Devise de BASE = Ariary (MGA). Tous les montants stockés sont en Ariary.
 * L'utilisateur peut afficher en Euro : conversion via un taux (1 € = `eurRate` Ar).
 */
export type DisplayCurrency = 'MGA' | 'EUR';

export const BASE_CURRENCY: DisplayCurrency = 'MGA';
export const DEFAULT_EUR_RATE = 5000; // 1 € ≈ 5000 Ar (modifiable dans les réglages)

export function currencySymbol(currency: DisplayCurrency): string {
  return currency === 'EUR' ? '€' : 'Ar';
}

/**
 * Formate un montant (exprimé en Ariary) selon la devise d'affichage choisie.
 * @param baseAmount montant en Ariary
 */
export function formatMoney(
  baseAmount: number,
  display: DisplayCurrency,
  eurRate: number,
): string {
  const amount = Number.isFinite(baseAmount) ? baseAmount : 0;
  if (display === 'EUR') {
    const eur = eurRate > 0 ? amount / eurRate : 0;
    return `${eur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }
  // Ariary : pas de décimales, séparateur de milliers.
  return `${Math.round(amount).toLocaleString('fr-FR')} Ar`;
}

// Conversion pour les saisies : de la devise affichée vers la base (Ariary).
export function toBase(displayAmount: number, display: DisplayCurrency, eurRate: number): number {
  if (display === 'EUR') return displayAmount * eurRate;
  return displayAmount;
}

// Conversion inverse : de la base (Ariary) vers la devise affichée.
export function fromBase(baseAmount: number, display: DisplayCurrency, eurRate: number): number {
  if (display === 'EUR') return eurRate > 0 ? baseAmount / eurRate : 0;
  return baseAmount;
}
