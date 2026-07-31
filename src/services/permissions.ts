// Contrôle d'accès de navigation par rôle (RBAC).
// La matrice par défaut ci-dessous sert de repli ; elle est surchargeable
// depuis Configuration ERP (persistée dans settings.rolePermissions).

export const ALL_TABS = [
  'dashboard',
  'products',
  'pos',
  'receivables',
  'partners',
  'purchases',
  'sales',
  'reorder',
  'expenses',
  'deliveries',
  'calendar',
  'audits',
  'movements',
  'warehouses',
  'accounting',
  'users',
  'settings',
];

export const TAB_LABELS: Record<string, string> = {
  dashboard: 'Tableau de bord',
  products: 'Articles & Stocks',
  pos: 'Caisse POS',
  receivables: 'Créances Clients',
  partners: 'Clients & Fournisseurs',
  purchases: 'Achats',
  sales: 'Ventes',
  reorder: 'Réapprovisionnement',
  expenses: 'Dépenses',
  deliveries: 'Livraisons',
  calendar: 'Calendrier',
  audits: 'Audits & Ajustements',
  movements: 'Historique des Flux',
  warehouses: 'Entrepôts & Localisations',
  accounting: 'Comptabilité',
  users: 'Utilisateurs',
  settings: 'Configuration ERP',
};

export const ROLES = [
  'Super Admin',
  'Admin',
  'Manager',
  'Commercial',
  'Acheteur',
  'Auditeur',
  'Comptable',
  'Magasinier',
];

export const DEFAULT_ROLE_TABS: Record<string, string[]> = {
  'Super Admin': [...ALL_TABS],
  Admin: [...ALL_TABS],
  // Le Manager gère tout sauf les comptes utilisateurs.
  Manager: ALL_TABS.filter((t) => t !== 'users'),
  Commercial: ['dashboard', 'products', 'pos', 'receivables', 'partners', 'sales', 'deliveries', 'calendar', 'movements'],
  Acheteur: ['products', 'calendar'],
  Auditeur: ['dashboard', 'products', 'movements', 'warehouses', 'audits'],
  Comptable: ['dashboard', 'products', 'pos', 'receivables', 'partners', 'purchases', 'sales', 'expenses', 'deliveries', 'calendar', 'movements', 'accounting', 'settings'],
  Magasinier: ['dashboard', 'products', 'purchases', 'reorder', 'deliveries', 'calendar', 'movements', 'warehouses', 'audits'],
};

// Note : 'users' (gestion des comptes) reste réservé à Super Admin / Admin.

/** Onglets autorisés pour un rôle, en tenant compte de la matrice personnalisée. */
export function allowedTabsFor(
  role: string | undefined,
  matrix?: Record<string, string[]> | null,
): string[] {
  // Le Super Admin garde toujours l'accès complet (impossible de se verrouiller).
  if (role === 'Super Admin') return [...ALL_TABS];
  const m = matrix && Object.keys(matrix).length ? matrix : DEFAULT_ROLE_TABS;
  return m[role || ''] || DEFAULT_ROLE_TABS[role || ''] || ['dashboard', 'products'];
}

// --- Droits d'écriture (créer / éditer / supprimer) par module ---

export const WRITE_SCOPES = ['products', 'partners', 'purchases', 'expenses', 'deliveries', 'audits'];

export const WRITE_LABELS: Record<string, string> = {
  products: 'Articles & Stocks',
  partners: 'Clients & Fournisseurs',
  purchases: 'Achats',
  expenses: 'Dépenses',
  deliveries: 'Livraisons',
  audits: 'Audits & Ajustements',
};

// Défauts alignés sur l'ancien comportement en dur de chaque module.
export const DEFAULT_WRITE_PERMS: Record<string, string[]> = {
  'Super Admin': [...WRITE_SCOPES],
  Admin: [...WRITE_SCOPES],
  Manager: [...WRITE_SCOPES],
  Commercial: ['partners', 'deliveries'],
  Acheteur: [], // lecture seule par défaut (droits Achats/Fournisseurs à accorder via la matrice)
  Auditeur: ['audits'],
  Comptable: ['purchases', 'expenses'], // règlements fournisseurs + dépenses
  Magasinier: ['products', 'purchases', 'deliveries'], // réception des marchandises
};

/** Le rôle peut-il écrire (créer/éditer/supprimer) dans un module donné ? */
export function canWrite(
  role: string | undefined,
  scope: string,
  matrix?: Record<string, string[]> | null,
): boolean {
  if (role === 'Super Admin') return true; // accès total garanti
  const m = matrix && Object.keys(matrix).length ? matrix : DEFAULT_WRITE_PERMS;
  const list = m[role || ''] || DEFAULT_WRITE_PERMS[role || ''] || [];
  return list.includes(scope);
}
