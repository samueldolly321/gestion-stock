/**
 * Génération d'identifiants côté client (pour SKU/code-barres par défaut, etc.).
 * Les identifiants d'entités persistées sont générés par le serveur.
 */
export const generateId = () => Math.random().toString(36).substring(2, 11).toUpperCase();
