/**
 * Secteurs d'activité — partagé front + serveur.
 *
 * Au premier démarrage, l'application demande « Quel est votre commerce ? » (plusieurs
 * choix possibles). Les fonctions affichées en dépendent ; changer de secteur ne supprime
 * rien (on masque / réaffiche seulement). Modifiable dans Configuration ERP.
 */
import { SIZE_PRESETS } from './variants';

export type SectorId = 'alimentation' | 'poissonnerie' | 'grossiste' | 'vetements' | 'chaussures' | 'hightech' | 'quincaillerie' | 'general';

export interface Features {
  /** Variantes taille × couleur (bouton « Nouveau modèle ») */
  variants: boolean;
  /** Conditionnement carton ↔ pièce (vente en gros) */
  packs: boolean;
  /** Date de péremption + numéro de lot */
  expiry: boolean;
  /** Numéros de série / IMEI + garantie (à venir) */
  serials: boolean;
}

export interface CategoryTemplate {
  name: string;
  children?: string[];
}

export interface Sector {
  id: SectorId;
  label: string;
  examples: string;
  features: Partial<Features>;
  categories: CategoryTemplate[];
  /** Valeurs proposées à la création d'un article (unité de base, nom du conditionnement) */
  productDefaults?: { unit: string; packLabel: string };
}

export const SECTORS: Sector[] = [
  {
    id: 'alimentation',
    label: 'Alimentation, épicerie, supérette',
    examples: 'Épicerie, supermarché, produits frais, boulangerie',
    features: { expiry: true, packs: true },
    categories: [
      { name: 'Épicerie', children: ['Riz et céréales', 'Huiles et condiments', 'Sucre et farine', 'Conserves'] },
      { name: 'Boissons', children: ['Eaux', 'Sodas et jus', 'Café et thé'] },
      { name: 'Produits frais', children: ['Produits laitiers', 'Viandes et poissons', 'Fruits et légumes'] },
      { name: 'Hygiène et entretien', children: ['Savons et soins', 'Lessive et ménage'] },
    ],
  },
  {
    id: 'poissonnerie',
    label: 'Poissonnerie (gros et détail)',
    examples: 'Poisson frais, fruits de mer, séché ou fumé — vente au kg et à la caisse',
    // Détail = au kg (quantités décimales) ; gros = à la caisse (ex. 1 caisse = 10 kg, prix caisse)
    // + tarifs négociés par client grossiste. Péremption pour la fraîcheur.
    features: { packs: true, expiry: true },
    productDefaults: { unit: 'Kg', packLabel: 'Caisse' },
    categories: [
      { name: 'Poissons frais', children: ['Poissons de mer', "Poissons d'eau douce"] },
      { name: 'Fruits de mer', children: ['Crevettes', 'Crabes', 'Calamars et poulpes', 'Langoustes'] },
      { name: 'Poissons séchés et fumés' },
      { name: 'Surgelés' },
      { name: 'Glace et conditionnement', children: ['Glace', 'Caisses et emballages'] },
    ],
  },
  {
    id: 'grossiste',
    label: 'Grossiste, dépôt, boissons',
    examples: 'Vente en gros et demi-gros, dépôt de boissons, distributeur',
    features: { packs: true },
    categories: [
      { name: 'Boissons', children: ['Eaux', 'Sodas', 'Bières', 'Jus'] },
      { name: 'Produits de base', children: ['Riz', 'Sucre', 'Huile', 'Farine'] },
      { name: 'Hygiène et entretien' },
    ],
  },
  {
    id: 'vetements',
    label: 'Vêtements et mode',
    examples: 'Prêt-à-porter, boutique de mode, friperie',
    features: { variants: true },
    categories: [
      { name: 'Hommes', children: ['T-shirts et polos', 'Chemises', 'Pantalons et jeans', 'Vestes'] },
      { name: 'Femmes', children: ['Robes', 'Hauts', 'Jupes', 'Pantalons et jeans'] },
      { name: 'Enfants', children: ['Garçons', 'Filles', 'Bébés'] },
      { name: 'Accessoires', children: ['Sacs', 'Ceintures', 'Casquettes et chapeaux'] },
    ],
  },
  {
    id: 'chaussures',
    label: 'Chaussures',
    examples: 'Magasin de chaussures, baskets, sandales',
    features: { variants: true },
    categories: [
      { name: 'Chaussures hommes', children: ['Baskets', 'Chaussures de ville', 'Sandales'] },
      { name: 'Chaussures femmes', children: ['Baskets', 'Escarpins et talons', 'Sandales'] },
      { name: 'Chaussures enfants' },
      { name: 'Entretien', children: ['Cirages', 'Lacets'] },
    ],
  },
  {
    id: 'hightech',
    label: 'High-tech, téléphonie, informatique',
    examples: 'Téléphones, ordinateurs, électronique, accessoires',
    features: { serials: true },
    categories: [
      { name: 'Smartphones' },
      { name: 'Ordinateurs', children: ['Portables', 'Ordinateurs de bureau'] },
      { name: 'Tablettes' },
      { name: 'Accessoires', children: ['Chargeurs et câbles', 'Écouteurs', 'Coques et protections'] },
      { name: 'Audio et TV' },
    ],
  },
  {
    id: 'quincaillerie',
    label: 'Quincaillerie, matériaux',
    examples: 'Quincaillerie, matériaux de construction, outillage',
    features: { packs: true },
    categories: [
      { name: 'Outillage', children: ['Outils à main', 'Électroportatif'] },
      { name: 'Plomberie' },
      { name: 'Électricité' },
      { name: 'Peinture' },
      { name: 'Matériaux', children: ['Ciment', 'Fer et acier', 'Bois'] },
    ],
  },
  {
    id: 'general',
    label: 'Commerce général / autre',
    examples: 'Bazar, magasin multi-produits, autre activité',
    features: { packs: true, expiry: true },
    categories: [],
  },
];

export const SECTOR_IDS = SECTORS.map((s) => s.id);

/** Garde seulement des secteurs connus, sans doublon, dans l'ordre de la liste. */
export function cleanSectors(value: unknown): SectorId[] {
  if (!Array.isArray(value)) return [];
  return SECTOR_IDS.filter((id) => value.includes(id));
}

/**
 * Fonctions à afficher. Secteur pas encore choisi (null) → tout est affiché, pour ne
 * rien retirer aux installations existantes.
 */
export function featuresFor(sectors: string[] | null | undefined): Features {
  const chosen = SECTORS.filter((s) => sectors?.includes(s.id));
  if (!sectors || chosen.length === 0) return { variants: true, packs: true, expiry: true, serials: false };
  const has = (k: keyof Features) => chosen.some((s) => s.features[k]);
  return { variants: has('variants'), packs: has('packs'), expiry: has('expiry'), serials: has('serials') };
}

/** Grilles de tailles dans l'ordre le plus utile pour ces secteurs (chaussures d'abord pour un chausseur). */
export function sizePresetsFor(sectors: string[] | null | undefined) {
  const shoes = !!sectors?.includes('chaussures');
  const clothes = !!sectors?.includes('vetements');
  if (shoes && !clothes) {
    return [...SIZE_PRESETS].sort((a, b) => Number(!a.label.startsWith('Chaussures')) - Number(!b.label.startsWith('Chaussures')));
  }
  return SIZE_PRESETS;
}

/** Catégories proposées pour ces secteurs (fusionnées : une catégorie commune n'apparaît qu'une fois). */
export function categoriesFor(sectors: string[]): CategoryTemplate[] {
  const out: CategoryTemplate[] = [];
  for (const s of SECTORS.filter((x) => sectors.includes(x.id))) {
    for (const c of s.categories) {
      const same = out.find((o) => o.name.toLowerCase() === c.name.toLowerCase());
      if (!same) out.push({ name: c.name, children: [...(c.children || [])] });
      else for (const ch of c.children || []) {
        if (!same.children!.some((x) => x.toLowerCase() === ch.toLowerCase())) same.children!.push(ch);
      }
    }
  }
  return out;
}

export const sectorLabel = (id: string) => SECTORS.find((s) => s.id === id)?.label || id;

/** Unité et conditionnement proposés pour un nouvel article (1er secteur choisi qui en définit). */
export function productDefaultsFor(sectors: string[] | null | undefined): { unit: string; packLabel: string } {
  const s = SECTORS.find((x) => sectors?.includes(x.id) && x.productDefaults);
  return s?.productDefaults ?? { unit: 'Pièces', packLabel: 'Carton' };
}

/** Suffixe de prix selon l'unité : « /kg », « /L », sinon « /pce ». */
export function priceUnitSuffix(unit?: string | null): string {
  const u = (unit || '').toLowerCase();
  if (u === 'kg') return '/kg';
  if (u === 'litre' || u === 'l') return '/L';
  if (u === 'mètres' || u === 'm') return '/m';
  if (u === 'm²') return '/m²';
  if (u === 'paires') return '/paire';
  return '/pce';
}
