/**
 * Variantes d'articles (vêtements, chaussures…) — partagé front + serveur.
 *
 * Un « modèle » (ex. « T-shirt Polo ») se décline en variantes taille × couleur.
 * Chaque variante est un VRAI article (`products`) avec son stock par entrepôt, son
 * code-barres et son étiquette ; les variantes d'un même modèle partagent
 * `variantGroup` (identifiant du modèle) et `modelName`.
 */

export interface VariantFields {
  variantGroup?: string | null;
  modelName?: string | null;
  variantSize?: string | null;
  variantColor?: string | null;
}

/** Grilles de tailles proposées (modifiables : on peut en saisir d'autres). */
export const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: 'Vêtements', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
  { label: 'Chaussures adulte', sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'] },
  { label: 'Chaussures enfant', sizes: ['24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35'] },
  { label: 'Enfant (âge)', sizes: ['2 ans', '4 ans', '6 ans', '8 ans', '10 ans', '12 ans', '14 ans'] },
  { label: 'Pantalons (tour de taille)', sizes: ['28', '30', '32', '34', '36', '38', '40', '42'] },
  { label: 'Taille unique', sizes: ['Unique'] },
];

export const COLOR_PRESETS = [
  'Noir', 'Blanc', 'Gris', 'Bleu', 'Bleu marine', 'Rouge', 'Vert', 'Jaune',
  'Orange', 'Rose', 'Violet', 'Beige', 'Marron', 'Kaki', 'Bordeaux',
];

/** Nom affiché d'une variante : « T-shirt Polo — M — Noir ». */
export function variantName(model: string, size?: string | null, color?: string | null): string {
  return [model.trim(), size?.trim(), color?.trim()].filter(Boolean).join(' — ');
}

/** Libellé court « M · Noir » (vide si l'article n'est pas une variante). */
export function variantLabel(p: VariantFields): string {
  return [p.variantSize, p.variantColor].filter(Boolean).join(' · ');
}

/** Clé d'une case de la grille taille × couleur. */
export const cellKey = (size?: string | null, color?: string | null) => `${size || ''}|${color || ''}`;

/** Morceau de SKU sans accents ni espaces : « Bleu marine » → « BLEUMARINE ». */
export function skuPart(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10);
}

/** Liste nettoyée et dédoublonnée (insensible à la casse), dans l'ordre donné. */
export function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out;
}

/** Ordre naturel des tailles : XS < S < M < L < XL…, puis numérique (36 < 40), puis alphabétique. */
const LETTER_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
export function compareSizes(a: string, b: string): number {
  const ia = LETTER_ORDER.indexOf(a.toUpperCase());
  const ib = LETTER_ORDER.indexOf(b.toUpperCase());
  if (ia !== -1 && ib !== -1) return ia - ib;
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b, 'fr');
}
