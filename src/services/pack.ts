/**
 * Conditionnement (vente en gros) : conversion carton ↔ pièces.
 * Le stock est TOUJOURS tracké en pièces (unité de base). Le « carton » n'est qu'une
 * aide à la saisie et à l'affichage : 1 carton = packSize pièces.
 */

/** packSize normalisé : entier ≥ 1 (1 = pas de conditionnement). */
export function packSizeOf(packSize?: number | null): number {
  const n = Math.floor(Number(packSize) || 1);
  return n >= 1 ? n : 1;
}

/** Un produit a-t-il un conditionnement en gros exploitable ? */
export function hasPack(packSize?: number | null): boolean {
  return packSizeOf(packSize) > 1;
}

/**
 * Décompose une quantité en pièces vers « X cartons + Y pièces ».
 * Ex. (148, 12, 'Carton') → « 12 Carton + 4 ».
 * Retourne null si pas de conditionnement (packSize ≤ 1).
 */
export function packBreakdown(
  pieces: number,
  packSize?: number | null,
  label?: string | null,
): string | null {
  const size = packSizeOf(packSize);
  if (size <= 1) return null;
  const qty = Math.max(0, Math.floor(Number(pieces) || 0));
  const cartons = Math.floor(qty / size);
  const rest = qty % size;
  const lbl = (label || 'Carton').trim() || 'Carton';
  if (cartons === 0) return `${rest} pcs`;
  return rest === 0 ? `${cartons} ${lbl}` : `${cartons} ${lbl} + ${rest}`;
}
