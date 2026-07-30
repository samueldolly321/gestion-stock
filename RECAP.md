# 📦 Vokatra-ko — Récapitulatif du projet

> ERP de **gestion de stock, ventes, achats et comptabilité** — contexte **Madagascar** (devise Ariary).
> Dernière mise à jour : **2026-07-30**.

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
| **Déploiement** | ✅ **En ligne sur Render** (Blueprint `render.yaml` — 1 web service `vokatra-ko` qui sert API + front, + base PostgreSQL `vokatra-ko-db`) **· ou 🖥️ en réseau local hors ligne** (1 PC serveur + client bureau Electron sur les postes — dossier `desktop/`) |

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
- `digital@salathis.com` / `secret123` — **Super Admin**
- Le 1er compte créé sur une base vide devient automatiquement Super Admin.
- **Mot de passe oublié** : un employé demande la réinitialisation à un Admin (onglet Utilisateurs) ; le Super Admin utilise la commande `npm run reset-password`. Le lien « Mot de passe oublié ? » du portail de connexion rappelle ces deux voies.

---

## 3. Modules fonctionnels

| Module | Onglet | Contenu |
|---|---|---|
| **Tableau de bord** | Dashboard | KPI, graphiques, alertes cliquables (rupture/périmés), **Performance commerciale** (7/30/90 j) : meilleures ventes, meilleurs clients, **Recettes / Dépenses / Solde**, **carte « Résumé d'activité (IA) »** : résumé en langage naturel jour/mois généré par Claude (`POST /api/ai/summary`, clé `ANTHROPIC_API_KEY`) |
| **Articles & Stocks** | products | Catalogue produits (CRUD, import image **avec limite 2 Mo**, catégories/sous-cat, marques, entrepôts), **champ Fournisseur** (à côté de Marque), **unité de base en liste déroulante** (+ « Autre »), **quantités décimales** (poids/volume : 1,5 kg, 0,75 L…), **conditionnement « vente en gros » (1 carton = N pièces, prix carton achat/vente)**, **code-barres EAN-13** (génération + rendu SVG scannable + **étiquette imprimable**), fiche article **avec historique des mouvements**, ajustement rapide **+ bouton « Créer un achat » (transforme une entrée en commande fournisseur réceptionnée)** |
| **Caisse POS** | pos | Encaissement, **image produit en grand sur les cartes**, panier (**quantité décimale éditable au clavier** + boutons +/−), **vente à la pièce OU au carton par ligne**, **prix de vente éditable par ligne + tarif client auto-appliqué (blocage vente à perte < prix d'achat)**, remise, moyens de paiement (+ référence), **livraison**, **paiement partiel / avance**, **TVA optionnelle (case « Appliquer la TVA », désactivée par défaut → vente sans TVA)**, reçu (ticket 80mm / A4) |
| **Créances Clients** | receivables | Avances/reste par vente, encaissements, **historique détaillé** des règlements, états payé/partiel/non payé, **établissement d'avoirs** (notes de crédit) |
| **Clients & Fournisseurs** | partners | CRUD clients & fournisseurs (**nom + téléphone obligatoires, email facultatif** ; tableau sans colonne Email — email dans la fiche détaillée), **colonne « Produits fournis » dans le tableau fournisseurs** (à la place de l'ex-colonne Entreprise), coffre-fort documents, fiche en ligne mobile, **catalogue « Produits fournis » par fournisseur (prix d'achat négocié, multi-fournisseurs) — panneau Package**, **« Tarifs » de vente par client (prix négocié par produit, panneau Tag) appliqués en caisse** |
| **Achats** | purchases | Commandes fournisseurs, **colonne « Produits » (nom + quantité)**, **saisie à la pièce ou au carton par ligne (quantités décimales)**, **pré-remplissage auto des produits du fournisseur sélectionné (avec son prix négocié)**, **réception valorisée** (→ stock), **suivi des règlements** (dette fournisseurs), détails |
| **Ventes** | sales | **Journal des ventes** : filtre Jour/Mois/Année + navigation, cartes de synthèse (nb ventes, CA TTC, encaissé, reste dû), recherche, **détail d'une vente + réimpression du reçu** (ticket 80mm / A4), export PDF/Excel |
| **Réapprovisionnement** | reorder | Articles sous seuil mini, quantités suggérées, **création de commande d'achat** groupée par fournisseur, **indicateur « commande en cours »** (anti-doublon) |
| **Dépenses** | expenses | Frais divers (transport, douane, taxes…), liés aux achats, statut payé/non payé |
| **Livraisons** | deliveries | Livraisons client (type moto/voiture/camion…, tarif ajouté à la facture), statuts, chauffeur |
| **Calendrier** | calendar | Vue mensuelle : **commandes fournisseurs** (réception prévue), **livraisons planifiées** et **échéances de créances** ; navigation mois, clic → onglet concerné ; **bouton « + » par date → création rapide d'une commande fournisseur ou d'une livraison à cette date** |
| **Audits & Ajustements** | audits | Inventaires physiques, validation (ajustement stock), historique |
| **Historique des Flux** | movements | Registre inaltérable des mouvements de stock (dont retours d'avoirs) |
| **Comptabilité** | accounting | **État de TVA** (collectée/déductible/nette) + **compte de résultat** (CA HT, COGS, marge, résultat net) par mois/trimestre/année, exports PDF/Excel |
| **Utilisateurs** | users | Gestion des comptes (création, rôles, activation, reset mot de passe) — SA/Admin |
| **Configuration ERP** | settings | Raison sociale, NIF/Stat, logo (initiales), devise/taux, thème, **matrice de permissions**, **pages « À propos » & « Confidentialité » éditables (affichées sur le portail de connexion)**, **« Zone de danger » (Super Admin) : bouton « Remettre les chiffres à zéro » avec confirmation par saisie de `REINITIALISER`** |

Tous les tableaux : **recherche, filtres, pagination (20/page), export PDF & Excel** (avec en-tête raison sociale).

---

## 4. Contrôle d'accès (RBAC)

Système à **deux dimensions**, **configurable** depuis Configuration ERP et **appliqué côté serveur** :

1. **Accès aux onglets** (`rolePermissions`) — quels onglets chaque rôle voit.
2. **Droits d'écriture** (`writePermissions`) — dans quels modules chaque rôle peut créer/éditer/supprimer.

- **Rôles** : Super Admin, Admin, Manager, Commercial, Acheteur, Auditeur, Comptable, Magasinier.
- **Super Admin** : accès complet garanti (non verrouillable).
- Matrices éditables via cases à cocher dans Config ERP (réservé SA/Admin/Manager).
- **Défaut par rôle** dans `src/services/permissions.ts` (repli si non configuré).
- **Sécurité serveur** : middleware `requireWrite(scope)` (`src/server/auth-middleware.ts`) lit la matrice en base et refuse (403) les mutations non autorisées — les routes CRUD sont protégées (products, partners, purchases, expenses, deliveries, audits).
- **Simulateur de rôle** (barre du haut) : prévisualise l'UI par rôle (à retirer en prod).

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
| Marques / Entrepôts | `GET/POST/PUT/DELETE /brands` · `/warehouses` |
| Réglages | `GET /settings`, `PUT /settings`, **`GET /settings/public`** (sans auth : marque + pages À propos/Confidentialité pour le portail) |
| Administration | **`POST /admin/reset-figures`** (Super Admin uniquement : remise à zéro des chiffres ; corps `{confirm:'REINITIALISER'}` revérifié serveur) |
| Temps réel | `GET /events?token=JWT` (SSE) |

---

## 6. Modèle de données (tables Drizzle — `src/db/schema.ts`)

`users`, `categories`, `brands`, `suppliers`, `clients`, `warehouses`, `products`,
**`supplier_products`** (catalogue appro : `supplier_id` + `product_id` + `purchase_price` négocié + `supplier_ref`, unicité `(supplier_id, product_id)` — un produit peut avoir plusieurs fournisseurs),
**`client_prices`** (tarifs de vente par client : `client_id` + `product_id` + `sale_price`, unicité `(client_id, product_id)` — prix de vente différent par client, appliqué en caisse),
`products` (+ **conditionnement gros** : `pack_size`, `pack_label`, `pack_purchase_price`, `pack_sale_price` — 1 carton = `pack_size` pièces ; le stock reste compté en pièces ; **`quantity`, `min_stock`, `max_stock` en `double precision`** → quantités décimales poids/volume),
`stock_movements` (**`quantity` en `double precision`**), `inventory_audits`, `purchases` (+ `paid_amount`, `received_at`, **`expected_date`** = réception prévue ; items enrichis de `unit_label`/`pack_qty` pour l'affichage carton),
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
- Services métier : `categoriesService`, `productsService`, `movementsService`, `partnersService` (clients+fournisseurs), `supplierProductsService` (catalogue appro), `salesService`, `auditsService`, `auditLogsService`, `catalogService` (marques+entrepôts), `settingsService`, `adminService` (remise à zéro des chiffres) (+ services achats/dépenses/livraisons/règlements/utilisateurs)
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
- `login-rate-limit.ts` — limiteur anti-force-brute du login (en mémoire, sans dépendance ; clé IP+e-mail)
- `reset-figures.ts` — cœur de la remise à zéro des chiffres (transaction), partagé par la route admin
- `routes/` : `auth`, `users`, `categories`, `products`, `movements`, `clients`, `suppliers`, `supplierProducts`, `clientPrices`, `sales`, `payments`, `purchases`, `expenses`, `deliveries`, `audits`, `auditLogs`, `brands`, `warehouses`, `settings`, `events`, `admin` (remise à zéro — Super Admin)
- `ensure-schema.ts` — migrations idempotentes appliquées au **démarrage** du serveur (Render ne crée pas les tables ; port 5432 souvent bloqué en local) : crée `supplier_products`, `client_prices`, colonne `settings.brand_name`, **conversion des colonnes de quantité `integer` → `double precision`** (guardée : ne convertit que si encore en `integer`, pas de rewrite à chaque boot).
- `reset-password.ts` — script de récupération de mot de passe (`npm run reset-password -- <email> <mdp>`), hors application (accès serveur requis).

### Base — `src/db/`
- `schema.ts` — tables Drizzle (aligné sur `src/types.ts`, **source de vérité des types métier**)
- `index.ts` — pool `pg` + instance Drizzle
- `drizzle.config.ts`, `check-connection.ts`, `seed.ts`, `reset-figures.ts` (remise à zéro des chiffres), `reset-password.ts` (récupération de mot de passe)

### Version bureau (Electron) & déploiement réseau local — `desktop/`
Alternative **hors ligne, multi-postes** au déploiement Render (données locales, séparées du cloud).
- **Principe** : **1 PC serveur** fait tourner l'app existante (PostgreSQL + Express + front buildé, port 3001) ; les postes clients s'y connectent par le **réseau local**. `API_BASE = '/api'` étant relatif, le front chargé depuis `http://<ip>:3001` appelle automatiquement le bon serveur (même origine, pas de CORS). Le temps réel (SSE) et le partage des données sont natifs.
- `desktop/` — **client Electron** : `main.js` (fenêtre + mémorisation de l'URL du serveur + gestion « serveur injoignable »), `preload.js` (pont sécurisé), `renderer/config.html` (saisie de l'adresse du serveur au 1er lancement). Build via **electron-builder** : `npm run dist` → installeur Windows NSIS (`.exe` ~82 Mo) ; `npm run dist:portable` → version portable `.zip`. Sortie dans `desktop/dist-installer/` (ignoré par git).
  - ⚠️ L'installeur NSIS exige le **Mode développeur Windows** (ou admin) — sinon échec « lien symbolique » à l'extraction des outils de signature ; la version portable n'a pas cette contrainte.
  - ⚠️ Ne pas laisser de dépendance `react-example: file:..` dans `desktop/package.json` (npm peut l'ajouter) : elle empaquette tout le projet parent (installeur qui gonfle à ~500 Mo).
- `serveur-local.cmd` (racine) — lanceur du serveur sur le PC hôte (build au 1er run puis `npm start`).
- **Réseau** : un **simple routeur/box suffit, même SANS Internet** (le routeur ne sert qu'à relier les postes en LAN). **Wi-Fi ou câble** OK tant que tous sont sur le **même réseau** — éviter le Wi-Fi « invité » (isolation client/AP isolation à désactiver). IP du serveur à **fixer** (réservation DHCP / IP statique) car en Wi-Fi elle peut changer au redémarrage. Câble Ethernet sur le PC serveur conseillé (confort/stabilité, non obligatoire).
- **Guides** : `GUIDE_RESEAU_LOCAL.md` (mise en place technique serveur + clients, pare-feu, IP, sauvegardes) et `GUIDE_DEMARRAGE_MAGASIN.md` (fiche pas-à-pas « magasin » : 1 serveur + chef + 3-4 caissiers, rôles, routine, sauvegardes).

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
- [x] **Quantités décimales (poids/volume)** — `products.quantity`/`min_stock`/`max_stock` + `stock_movements.quantity` en `double precision` ; retrait des `Math.floor` sur les quantités (POS + avoirs serveur) et `step="any"` sur les champs quantité (Caisse, Achats, Réappro, Calendrier, fiche article, avoirs). Migration auto au boot (`ensure-schema.ts`).
- [ ] Sécurité prod restante : HTTPS (fourni par Render), changement mot de passe forcé au 1er login
- [x] **Version bureau & fonctionnement hors ligne (réseau local)** — client **Electron** (`desktop/`) + **serveur local** (1 PC hôte : Postgres + Express) : plusieurs postes partagent les mêmes données **sans Internet** sur le réseau local. Installeur Windows (`npm run dist`) ou portable (`npm run dist:portable`). Guides `GUIDE_RESEAU_LOCAL.md` & `GUIDE_DEMARRAGE_MAGASIN.md`. *(Séparé de la version en ligne Render, sans synchro — choix assumé.)*
- [ ] Tests automatisés, sauvegardes automatiques, PWA installable (option navigateur)
- [x] **Versionnage git + déploiement Render — FAIT & EN LIGNE.** Repo GitHub `samueldolly321/gestion-stock` ; **déployé sur Render** via Blueprint `render.yaml` (auto-redeploy à chaque `git push` sur `main`). Single web service : l'API Express sert aussi le front buildé (`dist/`) sur la même origine ; base via `DATABASE_URL`+SSL. Script prod `npm start` (`tsx src/server.ts`). Guides `GUIDE_INSTALLATION.md` (local) & `GUIDE_RENDER.md` (cloud).

---

## 11. Comptes & données de démo (`npm run db:seed`)

3 catégories + 7 sous-catégories · 6 marques · 2 entrepôts · 3 fournisseurs · 4 clients ·
12 produits (dont 2 sous seuil pour le réappro) · 12 mouvements (dont 1 retour d'avoir) ·
**11 ventes** (dont 2 à crédit → créances) + **1 avoir `AV-000001`** (retour sur `FAC-000008`) · 1 avance client · **4 livraisons** ·
**3 achats** (statuts variés) · **4 dépenses** · initiales logo `SM`.
