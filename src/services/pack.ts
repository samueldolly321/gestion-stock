/**
 * Conditionnement (vente en gros) : conversion colis ↔ unité de base.
 * Le stock est TOUJOURS tracké dans l'unité de base (pièce, kg, L…). Le colis (carton,
 * caisse, sac…) n'est qu'une aide à la saisie et à l'affichage : 1 colis = packSize unités.
 * packSize peut être décimal (ex. 1 caisse = 12,5 kg).
 */

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Lit un nombre saisi avec une virgule ou un point (« 12,5 » ou « 12.5 »). NaN si illisible. */
export function parseDecimal(value: unknown): number {
  if (typeof value === 'number') return value;
  const s = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return s === '' ? NaN : Number(s);
}

/** Quantité affichée à la française : 12.5 → « 12,5 », 3 → « 3 » (3 décimales max). */
export function fmtQty(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

/** packSize normalisé : nombre ≥ 1 (1 = pas de conditionnement), décimales autorisées. */
export function packSizeOf(packSize?: number | null): number {
  const n = round3(Number(packSize) || 1);
  return n >= 1 ? n : 1;
}

/** Un produit a-t-il un conditionnement en gros exploitable ? */
export function hasPack(packSize?: number | null): boolean {
  return packSizeOf(packSize) > 1;
}

/**
 * Décompose une quantité vers « X colis + Y ».
 * Ex. (148, 12, 'Carton') → « 12 Carton + 4 » ; (30, 12.5, 'Caisse', 'Kg') → « 2 Caisse + 5 Kg ».
 * Retourne null si pas de conditionnement (packSize ≤ 1).
 */
export function packBreakdown(
  pieces: number,
  packSize?: number | null,
  label?: string | null,
  unit?: string | null,
): string | null {
  const size = packSizeOf(packSize);
  if (size <= 1) return null;
  const qty = Math.max(0, round3(Number(pieces) || 0));
  const cartons = Math.floor(qty / size + 1e-9);
  const rest = round3(qty - cartons * size);
  const lbl = (label || 'Carton').trim() || 'Carton';
  const u = unit ? ` ${unit}` : ' pcs';
  if (cartons === 0) return `${fmtQty(rest)}${u}`;
  return rest === 0 ? `${cartons} ${lbl}` : `${cartons} ${lbl} + ${fmtQty(rest)}${unit ? u : ''}`;
}
