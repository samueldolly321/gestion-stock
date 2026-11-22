# 📦 Vokatra-ko — Récapitulatif du projet

> ERP de **gestion de stock, ventes, achats et comptabilité** — contexte **Madagascar** (devise Ariary).
> Dernière mise à jour : **2026-08-03**.

---

## 1. Vue d'ensemble

| | |
|---|---|
| **Nom applicatif** | **Vokatra-ko** (« mon produit » en malgache ; raison sociale + initiales du logo administrables) |
| **Front** | React 19 + Vite + Tailwind v4 |
| **API** | Express (`src/server`, point d'entrée `src/server.ts`, port 3001) |
| **Base** | PostgreSQL 16 via Drizzle ORM (`src/db`) |
| **Auth** | Maison — JWT + mots de passe hachés bcrypt, RBAC par rôle |
| **Devise** | Base **Ariary (MGA)**, affichage Ar ou € converti (taux configurable) |
| **Temps réel** | Server-Sent Events (SSE) — toasts + notifications navigateur |
| **Dépôt** | GitHub `samueldolly321/gestion-stock` (branche `main`) |
| **Déploiement** | ✅ **En ligne sur Render** (Blueprint `render.yaml` — 1 web service `vokatra-ko` qui sert API + front, + base PostgreSQL `vokatra-ko-db`) **· ou 🖥️ application desktop AUTONOME `.exe`** (PostgreSQL EMBARQUÉ, zéro installation, 100 % hors-ligne, un seul poste — `electron/main.cjs`). *(L'ancien client réseau LAN `desktop/` a été remplacé par cette version autonome — voir §Version bureau.)* |

> Historique : l'app tournait à l'origine sur **Firebase/Firestore** (générée par Google AI Studio), puis **migrée intégralement vers PostgreSQL** — Firebase a été entièrement retiré. Noms successifs : **StockFlow → Invenzo → Vokatra-ko** (nom actuel).

---

## 2. Démarrer (2 terminaux)

```bash
npm install
npm run server   # API Express  -> http://localhost:3001
npm run dev      # Front (Vite)  -> http://localhost:3000
```

### Base de données
- Base `stock`, utilisateur `user`, mot de passe `user`, `localhost:5432` (voir `.env`).
- `npm run db:check` — teste la connexion + liste les tables
- `npm run db:push` — (re)crée/mets à jour les tables depuis `src/db/schema.ts`
- `npm run db:seed` — **données de démo** (rejouable ; vide les tables métier, garde les comptes users)
- `npm run db:reset-figures` — **remise à zéro des chiffres** (mise en service) : garde catalogue produits + clients + fournisseurs + tarifs + users + réglages, remet à zéro stock/soldes clients et purge ventes/achats/règlements/dépenses/livraisons/inventaires/mouvements/journal/compteurs. **Aperçu par défaut ; exécute réellement seulement avec `-- --confirm`**. *(Alternative sans accès serveur : bouton in-app « Zone de danger » de Configuration ERP, réservé au Super Admin.)*
- `npm run reset-password -- <email> <nouveau_mdp>` — **récupération de mot de passe** de secours (débloque un Super Admin qui a oublié son mot de passe ; hache en bcrypt, réactive le compte). En prod : à lancer depuis le Shell Render.

### Compte de test

- Le 1er compte créé sur une base vide devient automatiquement Super Admin.
- **Mot de passe oublié** : un employé demande la réinitialisation à un Admin (onglet Utilisateurs) ; le Super Admin utilise la commande `npm run reset-password`. Le lien « Mot de passe oublié ? » du portail de connexion rappelle ces deux voies.

---

## 3. Modules fonctionnels

| Module | Onglet | Contenu |
|---|---|---|
| **Tableau de bord** | Dashboard | KPI, graphiques, alertes cliquables (rupture/périmés), **Performance commerciale** (7/30/90 j) : meilleures ventes, meilleurs clients, **Recettes / Dépenses / Solde**, **carte « Résumé d'activité (IA) »** : résumé en langage naturel jour/mois généré par Claude (`POST /api/ai/summary`, clé `ANTHROPIC_API_KEY`) |
| **Articles & Stocks** | products | Catalogue produits (CRUD, import image **avec limite 2 Mo**, catégories/sous-cat, marques, entrepôts), **champ Fournisseur** (à côté de Marque), **unité de base en liste déroulante** (+ « Autre »), **quantités décimales** (poids/volume : 1,5 kg, 0,75 L…), **prix de vente facultatif à la création** (le tarif peut être défini par client via les Tarifs), **conditionnement « vente en gros » (1 carton = N pièces, prix carton achat/vente)**, **code-barres EAN-13** (génération + rendu SVG scannable + **étiquette imprimable**), fiche article **avec historique des mouvements**, ajustement rapide **+ bouton « Créer un achat » (transforme une entrée en commande fournisseur réceptionnée)**, **colonne « Entrepôt(s) » (répartition du stock par entrepôt dans la liste)** |
| **Caisse POS** | pos | Encaissement, **image produit en grand sur les cartes**, panier (**quantité décimale éditable au clavier** + boutons +/−), **vente à la pièce OU au carton par ligne**, **prix de vente éditable par ligne + tarif client auto-appliqué (blocage vente à perte < prix d'achat)**, remise, moyens de paiement (+ référence), **livraison**, **paiement partiel / avance**, **TVA optionnelle (case « Appliquer la TVA », désactivée par défaut → vente sans TVA)**, reçu (ticket 80mm / A4, **avec la ligne « Entrepôt »**), **sélecteur « entrepôt actif » (la vente déduit le stock de cet entrepôt ; défaut = lieu de travail du caissier, sinon l'entrepôt le mieux approvisionné ; disponibilité affichée par entrepôt)**, **scan code-barres : douchette USB (code + Entrée → ajout auto au panier, bip + toast) ou caméra (bouton « Scanner », API `BarcodeDetector`)** |
| **Entrepôts & Localisations** | warehouses | **CRUD entrepôts** (nom, code, localisation, capacité, statut actif/inactif ; suppression bloquée si stock présent), **répartition du stock par entrepôt** (tableau produit × entrepôt), **transfert de stock A→B** (sort de la source, entre en destination, total inchangé, refus si stock source insuffisant) |
| **Créances Clients** | receivables | Avances/reste par vente, encaissements, **historique détaillé** des règlements, états payé/partiel/non payé, **établissement d'avoirs** (notes de crédit) |
| **Clients & Fournisseurs** | partners | CRUD clients & fournisseurs (**nom + téléphone obligatoires, email facultatif** ; tableau sans colonne Email — email dans la fiche détaillée), **colonne « Produits fournis » dans le tableau fournisseurs** (à la place de l'ex-colonne Entreprise), coffre-fort documents, fiche en ligne mobile, **catalogue « Produits fournis » par fournisseur (prix d'achat négocié, multi-fournisseurs) — panneau Package**, **« Tarifs » de vente par client (prix négocié par produit, panneau Tag) appliqués en caisse** |
| **Achats** | purchases | Commandes fournisseurs, **colonne « Produits » (nom + quantité)**, **saisie à la pièce ou au carton par ligne (quantités décimales)**, **pré-remplissage auto des produits du fournisseur sélectionné (avec son prix négocié)**, **sélecteur d'entrepôt de réception + colonne « Entrepôt »**, **réception valorisée** (→ stock de l'entrepôt choisi), **suivi des règlements** (dette fournisseurs), détails |
| **Ventes** | sales | **Journal des ventes** : filtre Jour/Mois/Année + navigation, cartes de synthèse (nb ventes, CA TTC, encaissé, reste dû), recherche, **colonne « Entrepôt »**, **détail d'une vente + réimpression du reçu** (ticket 80mm / A4), export PDF/Excel |
| **Réapprovisionnement** | reorder | Articles sous seuil mini, quantités suggérées, **création de commande d'achat** groupée par fournisseur, **indicateur « commande en cours »** (anti-doublon) |
| **Dépenses** | expenses | Frais divers (transport, douane, taxes…), liés aux achats, statut payé/non payé |
| **Livraisons** | deliveries | Livraisons client (type moto/voiture/camion…, tarif ajouté à la facture), statuts, chauffeur |
| **Calendrier** | calendar | Vue mensuelle : **commandes fournisseurs** (réception prévue), **livraisons planifiées** et **échéances de créances** ; navigation mois, clic → onglet concerné ; **bouton « + » par date → création rapide d'une commande fournisseur ou d'une livraison à cette date** |
| **Audits & Ajustements** | audits | Inventaires physiques, validation (ajustement stock), historique |
| **Historique des Flux** | movements | Registre inaltérable des mouvements de stock (dont retours d'avoirs) |
| **Comptabilité** | accounting | **État de TVA** (collectée/déductible/nette) + **compte de résultat** (CA HT, COGS, marge, résultat net) par mois/trimestre/année, exports PDF/Excel |
| **Utilisateurs** | users | Gestion des comptes (création, rôles, activation, reset mot de passe) — SA/Admin, **« lieu de travail » (entrepôt) par compte — défaut « Entrepôt général », modifiable en ligne ; sert de défaut à l'entrepôt actif en caisse** |
| **Configuration ERP** | settings | Raison sociale, NIF/Stat, logo (initiales), devise/taux, thème, **matrice de permissions**, **pages « À propos » & « Confidentialité » éditables (affichées sur le portail de connexion)**, **« Zone de danger » (Super Admin) : bouton « Remettre les chiffres à zéro » avec confirmation par saisie de `REINITIALISER`** |

Tous les tableaux : **recherche, filtres, pagination (20/page), export PDF & Excel** (avec en-tête raison sociale).

---

## 4. Contrôle d'accès (RBAC)

Système à **deux dimensions**, **configurable** depuis Configuration ERP et **appliqué côté serveur** :

1. **Accès aux onglets** (`rolePermissions`) — quels onglets chaque rôle voit.
2. **Droits d'écriture** (`writePermissions`) — dans quels modules chaque rôle peut créer/éditer/supprimer.

- **Rôles** : Super Admin, Admin, Manager, Commercial, **Caissier** (centré caisse : POS + articles + clients + créances + ventes ; permet des comptes « Caissier 1/2/3… »), Acheteur, Auditeur, Comptable, Magasinier.
- **Super Admin** : accès complet garanti (non verrouillable).
- Matrices éditables via cases à cocher dans Config ERP (réservé SA/Admin/Manager).
- **Défaut par rôle** dans `src/services/permissions.ts` (repli si non configuré).
- **Sécurité serveur** : middleware `requireWrite(scope)` (`src/server/auth-middleware.ts`) lit la matrice en base et refuse (403) les mutations non autorisées — les routes CRUD sont protégées (products, partners, purchases, expenses, deliveries, audits).
- ~~Simulateur de rôle~~ : **retiré le 2026-11-20** (pour tester un rôle, se connecter avec un compte de ce rôle).

---

## 5. Endpoints API (`/api`, JWT requis sauf login/register)

| Ressource | Routes |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Utilisateurs | `GET/POST /users`, `PUT /users/:id`, `POST /users/:id/password`, `DELETE /users/:id` |
| Catégories | `GET/POST/PUT/DELETE /categories` |
| Produits | `GET/POST/PUT/DELETE /products` |
| Mouvements | `GET/POST /movements` |
| Clients / Fournisseurs | `GET/POST/PUT/DELETE /clients` · `/suppliers` |
| Catalogue appro (fournisseur↔produit) | `GET /supplier-products` (filtre `?supplierId=`) · `POST` (upsert par (supplierId,productId)) · `PUT /:id` · `DELETE /:id` |
| Tarifs client (client↔produit) | `GET /client-prices` (filtre `?clientId=`) · `POST` (upsert, refus si < prix d'achat) · `PUT /:id` · `DELETE /:id` |
| Ventes (POS) | `GET/POST /sales`, `POST /sales/:id/pay`, `POST /sales/:id/credit-note` (avoir) |
| Règlements | `GET /payments` (filtres `?refId=` / `?partyId=`) |
| Achats | `GET/POST /purchases`, `POST /purchases/:id/receive`, `POST /purchases/:id/pay`, `DELETE /purchases/:id` |
| Dépenses | `GET/POST/PUT/DELETE /expenses` |
| Livraisons | `GET/POST/PUT/DELETE /deliveries` |
| Inventaires | `GET/POST /audits`, `POST /audits/:id/validate`, `POST /audits/:id/cancel` |
| Journal | `GET /audit-logs` |
| Marques / Entrepôts | `GET/POST/PUT/DELETE /brands` · `/warehouses` (PUT = édition entrepôt) |
| Stock par entrepôt | **`GET /warehouses/stock`** (répartition produit × entrepôt) · **transfert = `POST /movements` type `transfer`** (corps `fromWarehouseId` + `warehouseId` destination ; refus si stock source insuffisant) |
| Réglages | `GET /settings`, `PUT /settings`, **`GET /settings/public`** (sans auth : marque + pages À propos/Confidentialité pour le portail) |
| Administration | **`POST /admin/reset-figures`** (Super Admin uniquement : remise à zéro des chiffres ; corps `{confirm:'REINITIALISER'}` revérifié serveur) |
| Temps réel | `GET /events?token=JWT` (SSE) |

---

## 6. Modèle de données (tables Drizzle — `src/db/schema.ts`)

`users` (+ **`warehouse_id`** = lieu de travail, null = Entrepôt général), `categories`, `brands`, `suppliers`, `clients`, `warehouses`, `products`,
**`supplier_products`** (catalogue appro : `supplier_id` + `product_id` + `purchase_price` négocié + `supplier_ref`, unicité `(supplier_id, product_id)` — un produit peut avoir plusieurs fournisseurs),
**`client_prices`** (tarifs de vente par client : `client_id` + `product_id` + `sale_price`, unicité `(client_id, product_id)` — prix de vente différent par client, appliqué en caisse),
**`product_stock`** (**stock réel par entrepôt** : `product_id` + `warehouse_id` + `quantity`, unicité `(product_id, warehouse_id)` — `products.quantity` reste le TOTAL dénormalisé = somme des lignes ; tous les flux passent par `src/server/stock.ts`),
`products` (+ **conditionnement gros** : `pack_size`, `pack_label`, `pack_purchase_price`, `pack_sale_price` — 1 carton = `pack_size` pièces ; le stock reste compté en pièces ; **`quantity`, `min_stock`, `max_stock` en `double precision`** → quantités décimales poids/volume),
`stock_movements` (**`quantity` en `double precision`**), `inventory_audits`, `purchases` (+ `paid_amount`, `received_at`, **`expected_date`** = réception prévue, **`warehouse_id`/`warehouse_name`** = entrepôt de destination à la réception ; items enrichis de `unit_label`/`pack_qty` pour l'affichage carton),
`sales` (+ `paid_amount`, **`invoice_number`** unique, **`related_sale_id`** = facture d'origine d'un avoir, **`due_date`** = échéance de créance), `payments` (kind `sale`/`purchase`/**`credit_note`**), `expenses`, `deliveries`, `audit_logs`,
`document_counters` (compteurs de séquences légales — clés `invoice` **et `credit_note`**),
`settings` (+ `role_permissions`, `write_permissions`, `logo_initials`, **`invoice_prefix`**, **`credit_note_prefix`**, **`invoice_padding`**, **`about_text`**, **`privacy_text`** = pages éditables du portail).

Un **avoir** = ligne `sales` `type='return'` (montants négatifs, n° `AV-…`, `related_sale_id`). Mouvement de stock `entry_return` à la réintégration.

**Flux comptable clé** :
`Achat (commande) → Réception (entrée stock valorisée) → Dépenses divers → Règlements fournisseurs`
et côté client :
`Vente (avance/crédit) → Créance client → Encaissements → Avoir (retour/annulation) → historique des règlements`.

---

## 7. Architecture technique (fichiers)

### Front — `src/services/` (clients d'API, `fetch` + JWT)
- `api.ts` — wrapper fetch, JWT stocké dans `localStorage` (clé `stockflow_token`)
- `authService.ts` — register / login / me / logout
- Services métier : `categoriesService`, `productsService`, `movementsService` (dont **transfert** = mouvement type `transfer`), `partnersService` (clients+fournisseurs), `supplierProductsService` (catalogue appro), `salesService`, `auditsService`, `auditLogsService`, `catalogService` (marques + entrepôts + **`listProductStock`/`updateWarehouse`**), `settingsService`, `adminService` (remise à zéro des chiffres) (+ services achats/dépenses/livraisons/règlements/utilisateurs)
- Composants clés : `Warehouses.tsx` (**onglet Entrepôts & Localisations** : CRUD + répartition + transfert), `BarcodeScannerModal.tsx` (**scan caméra** via `BarcodeDetector`) ; la **Caisse POS** gère l'entrepôt actif + l'auto-ajout au scan douchette (Entrée + bip)
- `permissions.ts` — **source de vérité RBAC** (partagée front + serveur)
- `currency.ts` + `CurrencyContext.tsx` — devise base Ariary, affichage Ar ou € converti (`useMoney()`), taux + préférence en `localStorage`
- `realtime.ts` — connexion **SSE** (`EventSource`) pour le temps réel
- `ids.ts` — `generateId()` local (SKU/code-barres)

### Front — `src/App.tsx`
- Restaure la session via `/api/auth/me` au chargement
- Charge toutes les données à la connexion et expose des `reloadXxx`
- `useEffect` d'abonnement SSE → toasts + notifications navigateur + maj du journal en direct

### Backend — `src/server/`
- `auth-middleware.ts` — `signToken`, `verifyToken`, `requireAuth`, `requireRole`, `requireWrite(scope)` (lit la matrice de permissions en base)
- `helpers.ts` — `generateId(prefix)`, `computeProductStatus()`, `writeAuditLog()` (publie aussi en SSE), `pickFields`/`pickProductFields` (anti-injection)
- `events.ts` — bus SSE en mémoire (`publish`)
- `stock.ts` — **point d'entrée UNIQUE du stock par entrepôt** : `adjustWarehouseStock`/`setWarehouseStock`/`getWarehouseStock`/`resolveWarehouseId` (met à jour la ligne `product_stock` ET recalcule `products.quantity` total + statut). Utilisé par vente, réception, mouvement/transfert, inventaire, création/édition produit.
- `login-rate-limit.ts` — limiteur anti-force-brute du login (en mémoire, sans dépendance ; clé IP+e-mail)
- `reset-figures.ts` — cœur de la remise à zéro des chiffres (transaction), partagé par la route admin
- `routes/` : `auth`, `users`, `categories`, `products`, `movements`, `clients`, `suppliers`, `supplierProducts`, `clientPrices`, `sales`, `payments`, `purchases`, `expenses`, `deliveries`, `audits`, `auditLogs`, `brands`, `warehouses`, `settings`, `events`, `admin` (remise à zéro — Super Admin)
- `ensure-schema.ts` — migrations idempotentes appliquées au **démarrage** du serveur (Render ne crée pas les tables ; port 5432 souvent bloqué en local) : crée `supplier_products`, `client_prices`, colonne `settings.brand_name`, **conversion des colonnes de quantité `integer` → `double precision`** (guardée : ne convertit que si encore en `integer`, pas de rewrite à chaque boot), **colonnes `purchases.warehouse_id`/`warehouse_name`**, **colonne `users.warehouse_id`** (lieu de travail), **table `product_stock` + backfill du stock existant** dans l'entrepôt de chaque produit (crée « Entrepôt Central » si aucun ; ne remplit que les produits sans ligne → rejouable).
- `reset-password.ts` — script de récupération de mot de passe (`npm run reset-password -- <email> <mdp>`), hors application (accès serveur requis).

### Base — `src/db/`
- `schema.ts` — tables Drizzle (aligné sur `src/types.ts`, **source de vérité des types métier**)
- `index.ts` — pool `pg` + instance Drizzle
- `drizzle.config.ts`, `check-connection.ts`, `seed.ts`, `reset-figures.ts` (remise à zéro des chiffres), `reset-password.ts` (récupération de mot de passe)

### 🖥️ Application desktop AUTONOME `.exe` — PostgreSQL EMBARQUÉ (zéro installation) — 2026-08-10
**L'utilisateur double-clique le `.exe` et ça marche, sans rien installer** (ni Postgres, ni serveur, ni réseau). Un seul poste, 100 % hors-ligne. **Validé de bout en bout** (migrations + auth + login).
- **`electron/main.cjs`** (racine) : `app.setName('Vokatra-ko')` → données dans **`%APPDATA%/Vokatra-ko/pgdata`** (persistantes). Démarre un **PostgreSQL portable** (`embedded-postgres`, PG 18.4, port **54339**), crée la base **`stock`**, puis `fork` le serveur bundlé (`dist/server.cjs`, port **34519**) avec les `SQL_*` du PG embarqué + `RUN_MIGRATIONS=true`, attend `/api/health`, ouvre la fenêtre. Arrêt propre via `before-quit` → `pg.stop()`.
- **Schéma** : `src/server.ts` applique les **migrations Drizzle** au boot **si `RUN_MIGRATIONS=true`** (dossier **`drizzle/`** généré via `npm run db:generate`, 20 tables) — crée tout au 1er lancement. Sur Render, `RUN_MIGRATIONS` n'est pas défini → schéma toujours créé par `db:push` au build (inchangé). `ensureSchema()` reste appliqué ensuite (patchs idempotents).
- **JWT_SECRET** : le desktop **génère et persiste** un secret fort (aléatoire 96 hex) dans `%APPDATA%/Vokatra-ko/desktop-config.json` → passe la validation prod (`auth-middleware.ts` exige ≥16 car. et ≠ défaut) sans configuration, sessions stables. Un `.env` **à côté de l'exe** surcharge tout (SQL_*, JWT_SECRET…).
- **Impression** : les reçus/étiquettes s'impriment via **`window.print()`** sur la page courante → **natif Electron**, aucun réglage. Le `setWindowOpenHandler` autorise en plus les fenêtres internes (about:blank + pages locales) et n'envoie au navigateur système que les vrais liens externes. Permission **caméra** conservée (`setPermissionRequestHandler('media')`) pour le scan par webcam.
- **Build** : `npm run build` (front) + `npm run build:server` (esbuild → `dist/server.cjs`) + `electron-builder --win`. Script tout-en-un : **`npm run desktop:build`**. Config `build` dans `package.json` racine (`asar:false`, `npmRebuild:false`, appId `mg.vokatra.autonome`).
  - ⚠️ **Piège EPERM** (Defender/« Accès contrôlé aux dossiers » sur `D:\perso`) : builder hors du dossier projet → `npx electron-builder --win -c.directories.output="$env:LOCALAPPDATA\vokatra-release"`. **Installateur ~152 Mo** → `%LOCALAPPDATA%\vokatra-release\Vokatra-ko Setup 0.0.0.exe` (copié sur le Bureau).
  - ⚠️ **Orphelins** : si l'app est tuée de force, `postgres.exe` peut rester (port 54339 occupé) → redémarrer le PC avant de relancer.
  - Après un changement de `src/db/schema.ts` : **`npm run db:generate`** avant de rebâtir le `.exe`.
- **Remplacement** : l'ancien **client réseau `desktop/`** (Electron léger connecté à un PC serveur LAN) a été **supprimé** au profit de cette version autonome.
- **Multi-postes** : le `.exe` du **PC principal** écoute aussi sur le réseau (Express bind toutes interfaces, port 34519) → les autres postes ouvrent un **navigateur** vers `http://<ip>:34519` (ne PAS installer le `.exe` ailleurs, sinon base séparée). Nécessite d'ouvrir le pare-feu (`netsh advfirewall ... localport=34519`).
- **Guides réécrits pour l'autonome** : `GUIDE_DEMARRAGE_MAGASIN.md` (mise en route magasin, mono ou multi-postes) et `GUIDE_RESEAU_LOCAL.md` (partage réseau via navigateur). `GUIDE_INSTALLATION.md` reste le guide **développeur** (sources) avec un renvoi vers le `.exe`. Sauvegarde = copier `%APPDATA%\Vokatra-ko\pgdata` **app fermée**.

---

## 8. Fonctionnalités transverses

- **Exports** : PDF (jsPDF, paysage, en-tête coloré) & Excel natif .xlsx (ExcelJS, en-tête cyan) — **chargés dynamiquement** (hors bundle initial). En-tête = **raison sociale**.
- **Thème clair/sombre** (Tailwind v4, classe `.dark`), corrigé partout (fonds, champs, modales, sidebar).
- **Charte « Cobalt Sky »** : l'accent (échelle `cyan-*`) est remappé sur une rampe cobalt→sky→navy dans `@theme` (`src/index.css`) — 300 = sky `#82c8e5`, 500 = cobalt `#0047ab`, 900 = navy `#000080`. Reskin global sans toucher les composants ; les boutons pleins passent en `text-white` (contraste sur cobalt sombre). Couleurs codées en dur mises à jour : graphiques Dashboard/POS, en-têtes exports PDF/Excel.
- **Notifications SSE** : toasts stylés ; les actions de l'utilisateur courant ont un toast client (pas de doublon), celles des autres via SSE. **Cloche « Historique »** (bas-droite) : panneau latéral listant **toutes les actions** (journal d'audit), recherche + badge « nouvelles actions » depuis le dernier affichage.
- **Devise** : montants stockés en Ariary, affichage Ar ou € converti (`useMoney()`).
- **Identité entreprise** : raison sociale + **initiales du logo** (1-2 lettres) administrables, propagées (sidebar, reçus, exports).

---

## 9. Pièges / conventions (IMPORTANT)

- **Windows** : lancer via `./node_modules/.bin/tsx watch src/server.ts` et `./node_modules/.bin/vite`. `npm install` **tue les serveurs dev** → relancer. Jamais 2 `npm install` en parallèle. Libérer un port : `Get-NetTCPConnection -LocalPort 3001`.
- **Drizzle + pg** : le code d'erreur Postgres (`23505` unique, `23503` FK) est sur **`err.cause.code`**, pas `err.code`.
- **SSE** : `EventSource` ne peut pas envoyer d'en-tête → le JWT passe en query (`?token=`). Le proxy Vite stream bien le SSE (testé).
- **Thème** : Tailwind v4 exige `@custom-variant dark (&:where(.dark, .dark *));` dans `src/index.css` (sinon `dark:` suit la préférence système). Classe `.dark` posée sur `<html>`.
- **Serveur** : après ajout d'une route/colonne, `tsx watch` recharge seul ; penser à `db:push` pour les nouvelles colonnes/tables.
- **Permissions** : `src/services/permissions.ts` est la **source de vérité** (partagée front + serveur).
- **`db:push` interactif** : drizzle-kit demande confirmation (TTY) pour certaines opérations (ex. ajout d'une contrainte `unique` sur une table déjà remplie) et échoue en shell non-interactif. Contournement : appliquer le DDL correspondant manuellement (`ALTER TABLE … ADD COLUMN IF NOT EXISTS` / `ADD CONSTRAINT`), puis relancer.
- **Numérotation légale** : `nextDocNumber(tx, 'invoice' | 'credit_note')` (`src/server/helpers.ts`) incrémente `document_counters` **dans la transaction du document** (UPSERT verrouillant, une clé par série) → séquence continue sans trou ; un rollback annule aussi le numéro.
- **Avoirs** : un avoir impute d'abord son montant sur le `paid_amount` de la facture (évite le double comptage si un règlement est saisi ensuite), puis réduit `clients.balance` du total (non borné à 0 → solde négatif = crédit client). Prix repris de la facture (jamais du corps de requête).

---

## 10. Reste à faire (roadmap comptable)

- [x] **Facturation numérotée** (séquence légale) — factures `type='invoice'` : n° séquentiel continu sans trou (`FAC-000001`), attribué atomiquement en transaction (compteur `document_counters`), préfixe/padding configurables (Config ERP). Affiché sur reçu POS + créances + exports.
- [x] **Avoirs / notes de crédit** — avoir = vente `type='return'` numérotée `AV-000001` (séquence continue, compteur `credit_note`), établi depuis les Créances (sélection ligne/quantité, motif, remise en stock optionnelle). Réintègre le stock (`entry_return`), impute sur le reste dû de la facture puis réduit le solde client (crédit client si déjà réglée), reprend la fidélité au prorata, justificatif imprimable. Route `POST /sales/:id/credit-note`.
- [ ] Numérotation des **devis** (série séparée) — non couvert pour l'instant
- [ ] **Remboursement cash** d'un avoir (v1 = crédit client uniquement)
- [x] **États TVA** (collectée/déductible) & **compte de résultat** — module Comptabilité (`Accounting.tsx`), sélecteur Mois/Trimestre/Année + navigation, calcul 100 % front. TVA nette = collectée (ventes) − déductible (achats) ; compte de résultat = CA HT net des avoirs − COGS (prix d'achat × qté vendue) − charges externes. Exports PDF/Excel. Onglet `accounting` (RBAC : SA/Admin/Manager/Comptable).
- [ ] **Réception partielle** des commandes d'achat
- [x] **Prix d'achat en PMP à la réception** — `POST /purchases/:id/receive` réactualise `products.purchase_price` en coût moyen pondéré (CUMP) avec le coût réceptionné → fiabilise COGS + garde-fou vente à perte.
- [x] **Solde client — crédit préservé** — `/sales/:id/pay` n'écrête plus le solde à 0 (`GREATEST` retiré) : un crédit client (solde négatif issu d'un avoir) n'est plus effacé par un règlement ultérieur.
- [x] **Historique des règlements fournisseurs** — `/purchases/:id/pay` insère désormais un `payments` kind `purchase` (en transaction) — symétrie avec les règlements clients.
- [x] **Recalcul serveur des ventes (anti-falsification)** — `POST /sales` recalcule total/TVA/fidélité depuis les articles + prix en base et **rejoue le blocage vente à perte** (ne fait plus confiance aux montants du client). POS envoie `discountPercent`/`deliveryFee`/`applyVat` pour ce recalcul.
- [x] **Auto-inscription fermée après le bootstrap** — `POST /auth/register` refuse (403) dès qu'un compte existe ; endpoint `GET /auth/registration-open` ; AuthPage masque l'inscription hors 1ère installation. *(Reste : changement de mot de passe forcé au 1ᵉʳ login.)*
- [x] **RBAC en lecture** — middleware `requireAnyTab(...)` (`auth-middleware.ts`) sur les GET sensibles (`sales`, `payments`, `purchases`, `client-prices`, `supplier-products`, `expenses`) : lit `rolePermissions`, refuse (403) si le rôle n'a aucun onglet consommant la donnée.
- [x] **JWT durci + simulateur verrouillé** — le serveur **refuse de démarrer** si `JWT_SECRET` est absent/faible en prod ; le **simulateur de rôle n'est visible que pour le Super Admin réel** (`realRole` immuable issu du JWT) et n'est plus qu'une prévisualisation UI (les droits serveur restent ceux du compte). Bouton « Charger Données Démo » (stub) retiré.
- [x] **Comptabilité corrigée** — CA HT **exclut les frais de livraison** (`totalAmount − TVA − livraison`) ; **COGS au coût historique** (`stock_movements.costTotal` des `exit_sale`, net des `entry_return`) au lieu du prix d'achat courant.
- [x] **Récupération de mot de passe (sans e-mail)** — reset par un Admin depuis l'onglet Utilisateurs (employés) + **commande de secours `npm run reset-password`** pour débloquer un Super Admin (documentée dans `GUIDE_RENDER.md`, plus exposée sur le portail) ; lien « Mot de passe oublié ? » explicatif sur le portail. (Pas d'infra e-mail : choix assumé pour le contexte.)
- [x] **Anti-force-brute sur le login** — limiteur en mémoire (`src/server/login-rate-limit.ts`) : 5 échecs par (IP, e-mail) sur 15 min → blocage 15 min (HTTP 429 + `Retry-After`), reset au succès. `trust proxy` activé (IP réelle derrière Render).
- [x] **Remise à zéro des chiffres** — conserve produits/clients/fournisseurs/tarifs, remet stock + soldes clients à 0 et purge les transactions ; atomique. **Deux voies** : bouton in-app « Zone de danger » de Configuration ERP (Super Admin, saisie `REINITIALISER`) via `POST /admin/reset-figures` (`src/server/reset-figures.ts` + `routes/admin.ts`) — **ne nécessite pas le Shell Render** (payant) ; ou CLI `npm run db:reset-figures -- --confirm` (`src/db/reset-figures.ts`) si accès serveur.
- [x] **Stock réel par entrepôt + transfert A→B** — table `product_stock` (une ligne par couple produit × entrepôt ; `products.quantity` = total dénormalisé). **Onglet dédié « Entrepôts & Localisations »** : CRUD entrepôts (créer/éditer/supprimer/statut/capacité), répartition du stock par entrepôt, **transfert A→B** (sort de la source, entre en destination, total inchangé, refus si source insuffisante). Tous les flux (vente POS avec **entrepôt actif**, réception achat, ajustement, inventaire, avoir, création/édition produit) branchés sur le point d'entrée unique `src/server/stock.ts`. Migration + backfill idempotents au boot (`ensure-schema.ts`).
- [x] **Scan de code-barres à la caisse** — **douchette USB** : code tapé + Entrée → ajout auto au panier (recherche par code-barres exact/SKU) + **bip + toast** de confirmation ; **caméra/webcam** : bouton « Scanner » → `BarcodeScannerModal` (API native `BarcodeDetector`, anti-doublon, repli si non supporté). Permission caméra autorisée dans le client bureau (`desktop/main.js`) — **reconstruire l'installeur** (`npm run dist`) pour l'activer dans le `.exe`.
- [x] **Entrepôt visible partout + lieu de travail** — colonne « Entrepôt(s) » dans la liste Articles (répartition du stock), colonne « Entrepôt » dans Ventes et Achats (+ sélecteur d'entrepôt de réception sur la commande), **ligne « Entrepôt » sur le reçu/facture** (ticket + A4). Champ **« lieu de travail »** sur les utilisateurs (`users.warehouse_id`, défaut « Entrepôt général ») → défaut de l'entrepôt actif en caisse.
- [x] **Rôle Caissier** — nouveau rôle (POS + articles + clients + créances + ventes ; droit d'enregistrer un client) permettant des comptes nommés « Caissier 1/2/3… » ; ajouté aux gardes serveur ventes/règlements et à la matrice RBAC (défauts ajustables dans Config ERP).
- [ ] Stock par entrepôt — extensions possibles : réception partielle par entrepôt, seuils mini par entrepôt, valorisation par entrepôt.
- [x] **Variantes taille × couleur (vêtements, chaussures)** — 2026-11-18. Un **modèle** se décline en variantes ; **chaque variante est un vrai article** (`products`) avec son stock par entrepôt, son SKU (`RUN-40-NOIR`) et son code-barres EAN-13 (préfixe 2) → caisse, achats, inventaires, avoirs et comptabilité fonctionnent sans changement. Colonnes `products.variant_group` (id du modèle `MDL-…`), `model_name`, `variant_size`, `variant_color` (ajoutées au boot par `ensure-schema.ts`). Partagé front/serveur : `src/services/variants.ts` (grilles de tailles proposées, couleurs, nom « Modèle — M — Noir », tri naturel des tailles). Routes : `POST /api/products/variants` (crée la grille + stock initial par case avec mouvement `entry_reception`, ou ajoute les cases manquantes à un modèle via `variantGroup`) et `PUT /api/products/variants/:group` (champs communs : nom, prix, catégorie, marque, fournisseur, image… sans toucher stock/SKU/codes). UI `src/components/VariantsUI.tsx` : bouton « Nouveau modèle (tailles / couleurs) », grille taille × couleur du stock dans la fiche article (+ « Tailles / couleurs », « Modifier le modèle », « Étiquettes » : 1 par variante ou autant que le stock), **caisse : une carte par modèle → grille de choix** (stock de l'entrepôt actif, cases épuisées désactivées) ; le scan du code-barres d'une variante l'ajoute directement.
- [x] **Secteur d'activité (« Quel est votre commerce ? »)** — 2026-11-18. Au 1er démarrage (Super Admin / Admin, tant que rien n'est choisi — y compris sur les installations existantes ; « Plus tard » = pour la session), écran `src/components/SectorSetup.tsx` : **plusieurs secteurs possibles** (alimentation, **poissonnerie gros et détail**, grossiste, vêtements, chaussures, high-tech, quincaillerie, général), puis **catégories toutes prêtes** à cocher (créées en une transaction, celles qui existent déjà sont ignorées). Modifiable dans Configuration ERP (bloc « Secteur d'activité »). Source de vérité partagée : `src/services/sectors.ts` (`featuresFor` → `variants` / `packs` / `expiry` / `serials`, `sizePresetsFor`, `categoriesFor`). Colonne `settings.business_sectors` (jsonb, `null` = pas choisi → **tout est affiché**, rien n'est retiré aux installations existantes). Route dédiée `PUT /api/settings/sectors` (ne touche à aucun autre réglage ; le `PUT /api/settings` général ne l'écrase pas). Effets : bouton « Nouveau modèle (tailles / couleurs) » seulement si variantes ; sections Conditionnement et Péremption/Lot du formulaire article masquées si le secteur n'en a pas besoin (mais toujours visibles sur un article qui en a déjà) ; grilles de pointures en premier pour un chausseur ; **poissonnerie** : nouvel article proposé en **Kg** (détail, quantités décimales) avec conditionnement **« Caisse »** (gros, prix caisse) — `productDefaultsFor()` ; libellés du conditionnement dynamiques (« Kg / caisse », « Prix de vente / caisse ») et prix affiché en caisse selon l'unité (`/kg`, `/L`, `/pce` — `priceUnitSuffix()`), choix « Au kg (détail) / Caisse ×10 (gros) » dans le panier. Changer de secteur ne supprime rien.
- [x] **Fiche société juste après le secteur** — 2026-11-19. Au 1er démarrage, dès le secteur validé, écran « Votre société » (`src/components/CompanySetup.tsx`) : raison sociale (obligatoire), **logo** (image réduite à 256 px dans le navigateur, Data URL — `LogoPicker.tsx`), **NIF**, **STAT** (nouvelle colonne `settings.stat_number` ; `tax_id` = NIF), adresse, téléphone, email. Route dédiée `PUT /api/settings/company` (ne touche à rien d'autre, email et logo validés). Le logo s'affiche dans la barre latérale et en tête des reçus/factures, qui impriment aussi l'email et « NIF : … · STAT : … ». Revient aussi à chaque démarrage (administrateurs) **tant que le nom de la société est vide** — après l'écran secteur s'il est affiché ; « Plus tard » = pour la session. Mêmes champs (logo, NIF et STAT séparés) dans Configuration ERP. Limite des corps JSON portée à 1 Mo.
- [x] **Articles à livrer sur les livraisons** — 2026-11-19. Colonne `deliveries.items` (jsonb `{ productId, productName, quantity, unit }[]`, décimales acceptées). Saisie « article + quantité » (`src/components/DeliveryItemsEditor.tsx`) dans l'ajout rapide du Calendrier (au moins un article exigé) et dans le formulaire Livraisons ; la Caisse enregistre les articles de la vente (au carton si saisis au carton). Livraisons plus anciennes : articles repris de la vente liée (`deliveryItemsOf`). Calendrier : la pastille affiche « Client · 1er article +N » et un clic ouvre la fiche de la livraison (articles, adresse, transport, chauffeur). Onglet Livraisons : colonne Articles, recherche et exports par article.
- [x] **Plusieurs caisses en réseau local** — 2026-11-20. (1) Stock contrôlé **côté serveur** à la vente : `adjustWarehouseStock(..., { strict: true })` relit le stock sous verrou (`SELECT … FOR UPDATE` sur l'article puis sa ligne d'entrepôt) et lève `StockError` → HTTP 409 « Stock insuffisant… une autre caisse vient peut-être de le vendre » ; la caisse recharge alors le stock (panier conservé). (2) Verrou systématique dans `adjustWarehouseStock` : plus de mise à jour perdue entre vente, réception, ajustement, transfert ; `lockProducts()` verrouille les articles d'un document dans un ordre fixe (vente, avoir, réception d'achat, inventaire) → pas d'interblocage. Testé : dernière pièce vendue par 2 caisses simultanées (1 passe, 1 refusée), 10 ventes simultanées sans perte, ordre inverse sans interblocage, décimales. (3) Temps réel : une action d'un autre poste (journal SSE) recharge les données du module concerné, regroupées à 600 ms (`remoteChangeRef` dans `App.tsx`). (4) Toasts de l'activité des autres postes réservés à Super Admin / Admin / Manager.
- [x] **Rôles simplifiés** — 2026-11-20. Listes (création de compte, rôle simulé, matrice Configuration ERP) réduites à 6 rôles : Super Admin, Admin, Manager, Caissier, Magasinier, Comptable (`ROLES` dans `src/services/permissions.ts`). Commercial, Acheteur, Auditeur → `LEGACY_ROLES` : plus proposés, mais un compte qui les porte garde ses droits par défaut (à réattribuer dans Utilisateurs). Plusieurs caisses = plusieurs comptes au rôle Caissier.
- [x] **Licences de la version .exe + installateur 1.0.0** — 2026-11-20. Essai 7 jours puis clé obligatoire, **à vie, liée au PC** (code machine = SHA-256 du MachineGuid Windows). Clé `VK1.<payload>.<signature Ed25519>` vérifiée hors ligne (`src/server/license.ts`, clé publique `license-public-key.ts`) ; clé privée du vendeur **hors projet** (`%USERPROFILE%\.vokatra-ko-licences\cle-privee.pem`, à sauvegarder). Début d'essai gardé en 3 endroits (fichier `licence.json`, table `app_meta`, registre HKCU) ; date reculée → bloqué. Routes publiques `/api/license/status|activate`, garde 402 sur le reste de l'API ; écran d'activation + bandeau d'essai (`LicenseGate.tsx`). Actif seulement dans le .exe (`LICENSE_REQUIRED=1` posé par `electron/main.cjs`). Outil vendeur : `generer-licence.cmd` / `scripts/licence.mjs` (exclus de l'installateur) — voir `GUIDE_LICENCES.md`. Electron : arrêt **propre** de PostgreSQL (`pg_ctl stop -m fast`, au lieu du `taskkill /f` d'embedded-postgres), **instance unique** (2e lancement = fenêtre ramenée au premier plan), `VOKATRA_USER_DATA` pour tester sur un dossier séparé. Build : `fichier exe/` exclu, `electronDist` local (contourne un EPERM Windows).
- [x] **Restauration : plats avec recette + secteur « Restauration, gargote, snack »** (phase 1) — 2026-11-21. Un plat = article `kind = 'dish'` **sans stock propre** (quantité/seuils à 0, statut toujours `in_stock`) avec `recipe` jsonb `[{ ingredientId, quantity }]` (quantité par portion, dans l'unité de l'ingrédient ; colonnes ajoutées par `ensure-schema.ts`). Logique partagée `src/services/recipes.ts` (nettoyage, coût de revient, portions possibles, marge). **Vente** (`sales.ts`) : un plat est « déplié » dans la même transaction (ingrédients verrouillés avec les autres articles, ordre fixe), un mouvement `exit_sale` par ingrédient (« Vente « X » ×N ») ; **ingrédient insuffisant → vente acceptée**, stock ramené à 0 et manque noté sur la ligne (`items[].shortages`, alerte en caisse) ; recette + coût figés sur la ligne ; garde-fou vente à perte sur le **coût de la recette** ; avoir/retour : rien remis en stock. Refus : recette avec un plat / ingrédient inconnu / le plat lui-même, mouvement manuel, achat ou inventaire d'un plat, suppression d'un ingrédient utilisé (409). Type fixé à la création. Écrans : fenêtre **« Nouveau plat (recette) »** (`DishForm.tsx` : recherche d'ingrédients, coût / marge / coût matière / portions en direct), liste (badge Plat, coût recette, portions possibles), fiche (recette ou « ingrédient de… »), caisse (portions possibles dans l'entrepôt actif, jamais bloquant). Écrans « stock » (tableau de bord, réappro, achats, inventaires, mouvements, entrepôts, partenaires, calendrier) reçoivent `stockProducts` (sans les plats). Secteur `restauration` (fonction `recipes`, péremption, sacs/cartons ; catégories Entrées, Plats, Desserts, Boissons, Ingrédients, Emballages ; unités `g` et `Portions` ajoutées). Testé sur une base temporaire : 33 tests API, 16 ventes simultanées (stock exact), parcours navigateur création → caisse. Compléments : onglets Plats / Ingrédients & articles dans Articles & Stocks, bouton **« Déclarer une perte »** sur un plat (`POST /api/products/:id/dish-loss` : ingrédients retirés en `waste_loss`, motif « Perte « X » ×N : … »).
- [x] **Restauration phase 2 : rapports cuisine** — 2026-11-21. Onglet « Rapports cuisine » (`KitchenReports.tsx`, calculs purs dans `src/services/kitchenReports.ts`) avec période 7 j / 30 j / mois / dates : **marge par plat** (portions nettes des avoirs, CA HT, coût matière figé à la vente — un avoir ne réduit pas le coût —, marge, %, pertes déclarées), **consommation d'ingrédients** (pour les plats / vendu tel quel / pertes, coût, moyenne par jour, **jours de stock restant**), **écarts** (ajustements d'inventaire négatifs = pertes non déclarées ; manques d'ingrédients au moment de la vente). Indicateurs en tête, export Excel de chaque tableau. Testé : 24 tests de calcul, chiffres de l'écran = calcul direct sur les ventes.
- [x] **Restauration : suppléments** — 2026-11-21. `products.options` jsonb `[{ id, label, price, ingredientId, quantity }]` sur un plat (`normalizeOptions`, ingrédient vérifié comme la recette, suppression d'un ingrédient utilisé refusée). Caisse : fenêtre de choix (`DishOptionsPicker`), **une ligne de panier par combinaison** (clé `lineKey` = « plat|suppléments », `keyOf` dans `POS.tsx`), prix = plat + suppléments. Vente : suppléments **relus en base** (inconnu → 400), figés sur la ligne (`items[].options` avec coût), coût et garde-fou vente à perte incluant les suppléments, besoins cumulés par ingrédient (un mouvement par ingrédient, motif « Vente « Plat + œuf » »). Ticket : suppléments sous le plat. Avoir : lignes d'un même plat regroupées (`mergeByProduct`, serveur et écran). Rapport « Suppléments vendus ». Testé : 14 tests API + non-régression (33 + concurrence), parcours navigateur.
- [x] **Restauration : bon de cuisine** — 2026-11-21. Troisième format dans `ReceiptModal.tsx` (caisse et réimpression Ventes) : 80 mm, gros caractères, sans prix — numéro de commande, heure, client, caisse, **plats seulement** (lignes `kind: 'dish'`, boissons exclues) avec leurs suppléments, note de la commande, nombre de plats. Bouton direct « Imprimer le bon de cuisine (N plats) », affiché seulement si la vente contient des plats.
- [x] **Décimales avec virgule partout (12,5 kg, 1,5 L)** — 2026-11-18. Les champs de quantité / poids / prix (`type="number"`) acceptent déjà la virgule ; la **taille du colis** devient décimale : `products.pack_size` passe en `double precision` (`ALTER COLUMN … TYPE` idempotent dans `ensure-schema.ts`), champ texte `inputMode="decimal"` qui accepte « 12,5 » (`parseDecimal()` dans `src/services/pack.ts`), serveur arrondi à 3 décimales. Affichage à la française (`fmtQty()` : « 20,5 Litre », « 13 Bidon + 1 Litre », « Bidon ×1,5 », « = 4,5 L ») dans Articles, Caisse et Achats ; `index.html` en `lang="fr"`. Correctifs au passage : **écran blanc à la modification d'un article sans code-barres** (barcode null) ; section Conditionnement qui disparaissait pendant la frappe de « 1,5 » quand le secteur masque les colis.
- [x] **Numéros de série / IMEI + garantie (high-tech)** — 2026-11-18. Table `product_serials` (une ligne par appareil : `serial` unique, statut `in_stock` / `sold` / `lost` / `defective`, entrepôt, facture, client, `warranty_until`, historique `events` jsonb) ; `products.track_serial` + `warranty_months` (ajoutés par `ensure-schema.ts`). Le stock (`product_stock`) reste la référence des quantités. Serveur `src/server/routes/serials.ts` : `POST /api/serials/register` (complète d'abord les pièces déjà en stock **sans numéro** — réception d'achat, inventaire —, le surplus entre en stock avec un mouvement), `GET /api/serials/lookup/:serial` (statut, vente, client, garantie active), `POST /:id/transfer`, `POST /:id/lost`, `DELETE /:id` (erreur de saisie, appareil en stock seulement). **Vente** (`POST /sales`) : un article suivi exige ses numéros (nombre = quantité entière, en stock dans l'entrepôt vendeur, appartenant à l'article) → `sold`, garantie = date de vente + N mois, écrite sur la ligne de facture (`items[].serials`, `warrantyUntil`) ; refus = `SerialError` 400, transaction annulée (pas de trou de numérotation). **Avoir** : les numéros retournés doivent venir de la facture → remis en stock (ou `defective` si non réintégrés). Mouvements génériques `transfer` / `waste_loss` / `exit_sale` refusés pour un article suivi (se font appareil par appareil). UI `src/components/SerialsUI.tsx` : case « Suivi par numéro de série / IMEI » + garantie dans le formulaire (cochée d'office pour le secteur high-tech, quantité initiale remplacée par le scan), **panneau dans la fiche** (ajout par scan à la douchette, liste, transfert, retrait, suppression, alerte « pièces sans numéro »), bouton **« N° de série / garantie »** (recherche + historique de l'appareil), **caisse** : choix des appareils ou **scan direct de l'IMEI**, puces sur la ligne du panier ; **reçu** : IMEI + « Garantie jusqu'au … » ; **avoir** : cases à cocher des appareils retournés (déjà repris = grisés). Testé de bout en bout sur une base temporaire.
- [x] **Quantités décimales (poids/volume)** — `products.quantity`/`min_stock`/`max_stock` + `stock_movements.quantity` en `double precision` ; retrait des `Math.floor` sur les quantités (POS + avoirs serveur) et `step="any"` sur les champs quantité (Caisse, Achats, Réappro, Calendrier, fiche article, avoirs). Migration auto au boot (`ensure-schema.ts`).
- [ ] Sécurité prod restante : HTTPS (fourni par Render), changement mot de passe forcé au 1er login
- [x] **Version bureau & fonctionnement hors ligne (réseau local)** — client **Electron** (`desktop/`) + **serveur local** (1 PC hôte : Postgres + Express) : plusieurs postes partagent les mêmes données **sans Internet** sur le réseau local. Installeur Windows (`npm run dist`) ou portable (`npm run dist:portable`). Guides `GUIDE_RESEAU_LOCAL.md` & `GUIDE_DEMARRAGE_MAGASIN.md`. *(Séparé de la version en ligne Render, sans synchro — choix assumé.)*
- [ ] Tests automatisés, sauvegardes automatiques, PWA installable (option navigateur)
- [x] **Versionnage git + déploiement Render — FAIT & EN LIGNE.** Repo GitHub `samueldolly321/gestion-stock` ; **déployé sur Render** via Blueprint `render.yaml` (auto-redeploy à chaque `git push` sur `main`). Single web service : l'API Express sert aussi le front buildé (`dist/`) sur la même origine ; base via `DATABASE_URL`+SSL. Script prod `npm start` (`tsx src/server.ts`). Guides `GUIDE_INSTALLATION.md` (local) & `GUIDE_RENDER.md` (cloud).

---

## 11. Comptes & données de démo (`npm run db:seed`)

3 catégories + 7 sous-catégories · 6 marques · **2 entrepôts (stock réparti par entrepôt via `product_stock`)** · 3 fournisseurs · 4 clients ·
12 produits (dont 2 sous seuil pour le réappro) · 12 mouvements (dont 1 retour d'avoir) ·
**11 ventes** (dont 2 à crédit → créances) + **1 avoir `AV-000001`** (retour sur `FAC-000008`) · 1 avance client · **4 livraisons** ·
**3 achats** (statuts variés) · **4 dépenses** · initiales logo `SM`.
- [x] **Restauration : tailles de portion** — 2026-11-21. `products.sizes` jsonb `[{id,label,price,factor}]` (`normalizeSizes` : prix > 0, coefficient 0,1–5, 6 max, sans doublon). Recette = portion normale ; la vente applique le prix de la taille et `factor` aux quantités de la recette (pas aux suppléments) : déduction, coût figé, contrôle de vente à perte, motif « Vente « Plat (Grande) » ». Sans `sizeId` : portion ×1. Taille inconnue → 400. Perte de plat avec taille. Fiche : section Tailles + préréglage Petite/Normale/Grande ; caisse : choix de la taille dans la fenêtre de choix (lignes distinctes par taille) ; ticket, bon de cuisine, rapports (marge par plat et par taille). Testé : 20 tests API, non-régression (33 + concurrence + suppléments 14 + rapports 24), parcours navigateur.
- [x] **Essai visible, ingrédients et boissons préparées** — 2026-11-22. Bandeau d'essai collé en haut (`sticky`, hauteur réservée via `--license-banner-h` dans `App.tsx`), rouge les 2 derniers jours avec rappel du blocage. Restauration : bouton « Nouvel ingrédient / article » ; création d'un ingrédient **depuis la recette** (nom, unité, prix d'achat, stock initial → ajouté à la recette, rangé dans « Ingrédients ») ; saisie des quantités de recette et de suppléments en **g / cl / ml** convertie vers l'unité de stock (`entryUnits`, `toEntry`, `fromEntry` dans `recipes.ts`). « Nouveau plat / boisson » : cocktails et jus frais = plats à recette. Démo : Mojito, Rhum arrangé, Jus de mangue (Verre / Grand verre), Jus de passion + 9 ingrédients de bar. Testé : 15 tests de conversion, 16 tests navigateur (création sur place, 4 cl → 0,04 L), bandeau 10 tests (serveur compilé isolé), réenregistrement de 11 plats sans changement de recette.
- [x] **Caisse : client de passage par défaut ; bon de bar / bon de cuisine** — 2026-11-22. La caisse présélectionnait le 1er client de la liste (ventes du comptoir facturées à un client réel) : option « Client de passage (comptoir) » par défaut, retour au passage après chaque vente, crédit refusé sans client. Bons de préparation séparés (`stationOf` dans `recipes.ts`) : catégorie Boissons (préparées ou en bouteille) → **bon de bar**, autres plats → **bon de cuisine** ; boutons directs + « Imprimer les deux bons » (cuisine puis bar, enchaîné sur `afterprint`). `ReceiptModal` reçoit `products` (caisse et Ventes). Testé : 19 tests caisse cocktails, 11 tests bons (FAC-17 plat + Coca, FAC-20 boissons seules, FAC-16 plats seuls).
