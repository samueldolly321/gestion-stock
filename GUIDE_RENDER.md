# ☁️ Déployer Vokatra-ko sur Render

Ce guide met le projet **en ligne** (accessible depuis n'importe quel navigateur) sur
[Render](https://render.com), avec sa base PostgreSQL — comme le projet *nexus*.

**Architecture** : **1 seul service web** (l'API Express sert aussi le front React buildé,
donc une seule URL, pas de CORS) + **1 base PostgreSQL Render**. Tout est décrit dans le
fichier `render.yaml` à la racine → déploiement quasi automatique (« Blueprint »).

---

## Prérequis

1. Le projet est **poussé sur GitHub** : `https://github.com/samueldolly321/gestion-stock` ✅
2. Un **compte Render** (gratuit) : https://render.com → *Get Started* (connecte-toi avec GitHub, c'est le plus simple).

---

## Étape 1 — Déployer via le Blueprint (recommandé)

1. Sur le dashboard Render : **New +** → **Blueprint**.
2. **Connecte le dépôt** `gestion-stock` (autorise Render à accéder à ton GitHub si demandé).
3. Render détecte le fichier `render.yaml` et propose de créer :
   - une base **`vokatra-ko-db`** (PostgreSQL, plan *free*) ;
   - un service web **`vokatra-ko`** (Node, plan *free*).
4. Clique **Apply** (ou *Create Services*).

Render fait alors automatiquement :
- création de la base et **injection de `DATABASE_URL`** dans le service ;
- génération d'un **`JWT_SECRET`** fort ;
- **build** : `npm install --include=dev && npm run build && npm run db:push`
  (installe, compile le front, **crée les tables** dans la base) ;
- **démarrage** : `npm start` (le serveur sert l'API **et** le front).

⏳ Le 1er déploiement prend quelques minutes. Suis les logs dans l'onglet **Logs** du service.
Quand tu vois `🚀 API Vokatra-ko démarrée sur le port ...`, c'est prêt.

> La santé est surveillée sur `/api/health` (défini dans `render.yaml`).

---

## Étape 2 — Ouvrir l'application

- L'URL publique s'affiche en haut du service, du type
  **`https://vokatra-ko.onrender.com`**.
- Ouvre-la : tu arrives sur l'écran de connexion.

### Première connexion
- La base est **vide** (pas de données de démo en prod) : clique **« Créer un compte »**.
- Le **1er compte créé devient automatiquement Super Admin**.
- Connecte-toi ensuite avec cet identifiant.

---

## Étape 3 (facultatif) — Charger des données de démonstration

Si tu veux les données d'exemple (produits, ventes, etc.) :
1. Onglet **Shell** du service `vokatra-ko` sur Render.
2. Lance : `npm run db:seed`
   > ⚠️ Le seed **vide** les tables métier. À ne faire que sur une base de test/démo, pas
   > une fois que tu as saisi de vraies données.

---

## Remettre les chiffres à zéro (mise en service)

Pour repartir « propre » **en conservant** le catalogue produits, les clients et
les fournisseurs, mais en remettant à zéro le stock et toutes les transactions.

**Conservé** : produits (stock remis à 0), catégories/marques/entrepôts, clients
& fournisseurs (fiches), tarifs négociés, utilisateurs, réglages.
**Remis à zéro** : stock des produits, soldes & fidélité clients, ventes, achats,
règlements, dépenses, livraisons, inventaires, mouvements, journal d'audit,
compteurs de factures/avoirs.

1. Onglet **Shell** du service `vokatra-ko` sur Render.
2. D'abord une **simulation** (n'écrit rien, montre ce qui sera effacé) :

   ```bash
   npm run db:reset-figures
   ```

3. Si le récapitulatif te convient, **exécute réellement** :

   ```bash
   npm run db:reset-figures -- --confirm
   ```

> ⚠️ Opération **irréversible**. Fais une sauvegarde (`pg_dump`) avant si tu peux.
> Sans `--confirm`, la commande ne fait qu'afficher l'aperçu — aucun risque.

---

## Réinitialiser un mot de passe (récupération de secours)

Réservé au **responsable technique** (nécessite un accès au service). À utiliser
quand un **Super Admin** a oublié son mot de passe et que personne ne peut le
débloquer depuis l'onglet *Utilisateurs*.

1. Onglet **Shell** du service `vokatra-ko` sur Render.
2. Lance :

   ```bash
   npm run reset-password -- <email> <nouveau_mot_de_passe>
   ```

   Exemple : `npm run reset-password -- proprietaire@exemple.com MonNouveauMdp123`

Le script hache le mot de passe (bcrypt), réactive le compte si besoin, et refuse
si l'e-mail est introuvable ou si le mot de passe fait moins de 6 caractères.

> ⚠️ Cette commande n'est **pas** exposée dans l'application : elle exige un accès
> serveur, qui constitue la vraie barrière de sécurité. Ne la communique pas aux
> utilisateurs finaux.

> Pour les **employés** (comptes non Super Admin), pas besoin de cette commande :
> un Admin/Super Admin réinitialise leur mot de passe depuis l'onglet *Utilisateurs*.

---

## Redéploiements automatiques

À chaque `git push` sur la branche **main**, Render **redéploie automatiquement**
(rebuild + redémarrage). Tu n'as rien à faire d'autre que pousser ton code.

```powershell
git add .
git commit -m "Mes changements"
git push
```

---

## Variables d'environnement (déjà gérées par le Blueprint)

| Variable | Origine | Rôle |
|---|---|---|
| `DATABASE_URL` | auto (base Render) | Connexion PostgreSQL (SSL activé automatiquement) |
| `JWT_SECRET` | auto (généré) | Signature des jetons de connexion |
| `PORT` | auto (Render) | Port d'écoute du service |
| `APP_URL` | *(facultatif)* | Inutile ici (front servi par la même origine) ; renseigne l'URL publique si besoin |

---

## Bon à savoir (plan gratuit)

- **Mise en veille** : un service *free* s'endort après ~15 min d'inactivité ; la 1re
  requête suivante le réveille (quelques secondes de latence). Normal.
- **Base gratuite** : la base PostgreSQL *free* de Render a une durée de vie limitée
  (Render prévient par e-mail avant expiration). Pour un usage durable, passe la base en
  plan payant, ou sauvegarde régulièrement (`pg_dump`).
- **Migrations** : le build lance `db:push`. Pour une **création initiale** (base vide) c'est
  transparent. Si plus tard tu changes le schéma avec des données existantes, une migration
  destructive peut nécessiter une intervention manuelle (Shell Render).

---

## Déploiement manuel (alternative, sans Blueprint)

Si tu préfères créer les ressources à la main :
1. **New → PostgreSQL** : nom `vokatra-ko-db`, base `stock`, plan free → note l'**Internal Database URL**.
2. **New → Web Service** : connecte le dépôt `gestion-stock`.
   - **Build Command** : `npm install --include=dev && npm run build && npm run db:push`
   - **Start Command** : `npm start`
   - **Health Check Path** : `/api/health`
   - **Environment** → ajoute :
     - `DATABASE_URL` = l'*Internal Database URL* de l'étape 1
     - `JWT_SECRET` = une longue chaîne aléatoire
3. **Create Web Service** → attends le build → ouvre l'URL.

---

Voilà, Vokatra-ko est en ligne ! 🚀
