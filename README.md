# StockFlow ERP

Application web de **gestion de stock / ERP** : React 19 + Vite + Tailwind côté front, API **Express** côté serveur, base de données **PostgreSQL** (via Drizzle ORM).

Authentification maison (JWT, mots de passe hachés bcrypt) — aucune dépendance cloud.

## Modules

Authentification & rôles (RBAC) · Catégories & sous-catégories · Articles & stocks · Mouvements de stock · Caisse POS (avec impression ticket/A4) · Clients & fournisseurs · Audits d'inventaire · Marques & entrepôts · Réglages entreprise · Journal d'audit · Notifications temps réel (SSE).

## Documentation

| Document | Contenu |
|---|---|
| [`GUIDE_INSTALLATION.md`](GUIDE_INSTALLATION.md) | Installation complète pas-à-pas sur un PC Windows (Node, PostgreSQL, base de données, `.env`, lancement, dépannage). **Commence ici pour installer le projet.** |
| [`GUIDE_RENDER.md`](GUIDE_RENDER.md) | Déploiement en production sur Render. |
| `DOCUMENTATION_PROJET.docx` | Documentation fonctionnelle : tous les onglets, la comptabilité, les rôles… |
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
