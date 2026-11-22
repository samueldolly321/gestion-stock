# Vokatra-ko (version 1.1.0)

Logiciel de **gestion de stock, de caisse et de comptabilité** pour les commerces : React 19 + Vite + Tailwind côté front, API **Express** côté serveur, base de données **PostgreSQL** (via Drizzle ORM).

Deux façons de l'utiliser :
- **Version de bureau (.exe Windows)** : Electron + PostgreSQL intégré, 100 % hors ligne — `npm run desktop:build` produit `release/Vokatra-ko Setup 1.1.0.exe`. Essai de 7 jours puis licence à vie liée au PC (voir `GUIDE_LICENCES.md`).
- **Version serveur / web** : API + front, en local ou sur Render.

Authentification maison (JWT, mots de passe hachés bcrypt) — aucune dépendance cloud.

## Modules

Authentification & rôles (RBAC) · Secteurs d'activité (épicerie, restauration, grossiste, mode, high-tech, quincaillerie…) · Catégories & sous-catégories · Articles & stocks par entrepôt · **Vente en gros (conditionnement carton ↔ pièces)** · Tailles/couleurs · N° de série / IMEI · Mouvements de stock (+ historique par article) · **Caisse POS** (ticket 80 mm, facture A4 multi-pages, client de passage par défaut, crédit) · **Restauration** (plats et boissons à recette, saisie g/cl/ml, tailles, suppléments, bon de cuisine / bon de bar, pertes, rapports cuisine) · Achats & fournisseurs (catalogue multi-fournisseurs, réception valorisée) · Tarifs de vente par client · Ventes, créances & avoirs · Dépenses (loyer, salaires, énergie…) · Livraisons · **Comptabilité** (TVA, résultat, **rentabilité du fonds de départ**) · Audits d'inventaire · Entrepôts & transferts · Réglages entreprise · Journal d'audit · Notifications temps réel (SSE) · **Licences** (essai 7 jours, clé hors ligne signée).

## Documentation

| Document | Contenu |
|---|---|
| `MODE_EMPLOI_CLIENT.docx` | **Mode d'emploi pour les clients** (38 pages, captures) : installation, licence, chaque onglet, restaurant, rentabilité, dépannage. |
| [`GUIDE_DEMARRAGE_MAGASIN.md`](GUIDE_DEMARRAGE_MAGASIN.md) | Mise en route d'un magasin ou d'un restaurant avec le `.exe` (check-lists). |
| [`GUIDE_LICENCES.md`](GUIDE_LICENCES.md) | Vendre et générer les licences (`generer-licence.cmd`), essai de 7 jours. |
| [`GUIDE_RESEAU_LOCAL.md`](GUIDE_RESEAU_LOCAL.md) | Plusieurs caisses en réseau local autour du PC principal. |
| [`GUIDE_INSTALLATION.md`](GUIDE_INSTALLATION.md) | Installation développeur pas-à-pas (Node, PostgreSQL, `.env`, lancement, dépannage). |
| [`GUIDE_RENDER.md`](GUIDE_RENDER.md) | Déploiement en production sur Render. |
| `DOCUMENTATION_PROJET.docx` | Documentation fonctionnelle et technique (`node scripts/generate-doc.mjs`). |
| `ARGUMENTAIRE_COMMERCIAL.docx` / `ARGUMENTAIRE_FLYER.docx` | Plaquette et flyer commerciaux (`scripts/generate-argumentaire.mjs`, `scripts/generate-flyer.mjs`). |
| [`RECAP.md`](RECAP.md) | Journal technique détaillé des évolutions. |

> ⚡ Tu connais déjà l'environnement ? Le [récapitulatif express](GUIDE_INSTALLATION.md#9-récapitulatif-express-si-tu-connais-déjà) du guide d'installation liste toutes les commandes d'un coup.

## Prérequis

- **Node.js** 20+
- **PostgreSQL** 14+ avec une base et un utilisateur créés

## Installation

1. Installer les dépendances :
   ```bash
   npm install
   ```

2. Copier `.env.example` vers `.env` et renseigner la connexion PostgreSQL :
   ```bash
   cp .env.example .env
   ```
   Variables principales : `SQL_HOST`, `SQL_PORT`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `JWT_SECRET`.

3. Créer les tables dans la base :
   ```bash
   npm run db:push
   ```
   Vérifier la connexion à tout moment : `npm run db:check`

## Lancement (développement)

Deux processus, dans deux terminaux :

```bash
npm run server   # API Express   -> http://localhost:3001
npm run dev      # Front (Vite)   -> http://localhost:3000
```

Ouvrir **http://localhost:3000**. Le tout premier compte créé devient automatiquement **Super Admin**.

> En dev, le front proxifie les appels `/api` vers l'API (port 3001) — aucune configuration CORS à faire.

## Scripts utiles

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur de développement front (Vite) |
| `npm run server` | API Express (rechargement auto) |
| `npm run build` | Build de production du front |
| `npm run lint` | Vérification TypeScript (`tsc --noEmit`) |
| `npm run db:check` | Teste la connexion PostgreSQL + liste les tables |
| `npm run db:push` | Crée/met à jour les tables depuis le schéma Drizzle |
| `npm run db:generate` | Génère les migrations SQL |

## Structure

```
src/
  components/     Écrans React (Dashboard, Products, POS, Partners, Audits, Settings…)
  services/       Clients d'API front (fetch + JWT), contexte devise, temps réel
  db/             Schéma Drizzle + connexion PostgreSQL
  server/         API Express : routes, middlewares d'auth (JWT/RBAC), events SSE
  server.ts       Point d'entrée de l'API
```
