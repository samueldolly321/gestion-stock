/**
 * Logique de période partagée (jour / mois / trimestre / année).
 * Source unique pour les écrans qui filtrent par période calendaire (Ventes, Comptabilité)
 * — évite de réimplémenter le bornage et la navigation à plusieurs endroits.
 * Fonctions pures : l'ancre (date de référence) est fournie par l'appelant.
 */
export type Gran = 'day' | 'month' | 'quarter' | 'year';

export interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
}

// Met une majuscule à la première lettre (libellés « juillet » → « Juillet »).
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Bornes [début, fin] (incluses) + libellé lisible de la période contenant `anchor`. */
export function periodRange(gran: Gran, anchor: Date): PeriodRange {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();

  if (gran === 'year') {
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999), label: `Année ${y}` };
  }
  if (gran === 'quarter') {
    const q = Math.floor(m / 3);
    return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 0, 23, 59, 59, 999), label: `T${q + 1} ${y}` };
  }
  if (gran === 'day') {
    const label = anchor.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return { start: new Date(y, m, d, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999), label: cap(label) };
  }
  // month
  const label = anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999), label: cap(label) };
}

/** Décale l'ancre d'une unité de période (dir = -1 précédent, +1 suivant). */
export function shiftAnchor(gran: Gran, anchor: Date, dir: number): Date {
  const d = new Date(anchor);
  if (gran === 'year') d.setFullYear(d.getFullYear() + dir);
  else if (gran === 'quarter') d.setMonth(d.getMonth() + 3 * dir);
  else if (gran === 'day') d.setDate(d.getDate() + dir);
  else d.setMonth(d.getMonth() + dir);
  return d;
}
