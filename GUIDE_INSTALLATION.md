# 🏠 Guide d'installation — Vokatra-ko (copie sur un autre PC)

Ce guide te permet d'obtenir le **même projet fonctionnel chez toi**, à partir d'une copie USB
(ou d'un clone Git), avec sa base de données PostgreSQL. Suis les étapes **dans l'ordre**.

> Contexte : Windows 10/11. Toutes les commandes se tapent dans **PowerShell**
> (menu Démarrer → taper « PowerShell »), depuis le dossier du projet sauf indication contraire.

---

## 1. Logiciels à installer une seule fois

| Logiciel | Version | Lien | Remarque |
|---|---|---|---|
| **Node.js** | 20 LTS ou + | https://nodejs.org (bouton « LTS ») | Coche « Add to PATH » pendant l'install |
| **PostgreSQL** | 16 | https://www.postgresql.org/download/windows/ | **Note bien le mot de passe** du compte `postgres` |
| **Git** | récent | https://git-scm.com/download/win | Pour pousser/récupérer via GitHub |

Vérifie l'installation (redémarre PowerShell après) :

```powershell
node -v      # doit afficher v20.x ou plus
npm -v
git --version
psql --version   # PostgreSQL
```

---

## 2. Copier le projet chez toi

**Option A — clé USB :**
1. Sur ce PC, copie le dossier `gestion-stock` sur ta clé.
   - 💡 Tu peux **exclure le dossier `node_modules`** (très lourd) : on le réinstallera à l'étape 4.
   - ⚠️ Le fichier `.env` (mots de passe) **n'est pas** copié par Git, mais **l'est** par un copier-coller USB. C'est ok pour un usage perso.
2. Chez toi, colle le dossier où tu veux, par ex. `C:\Users\TonNom\projets\gestion-stock`.

**Option B — depuis Git** (voir §7 pour pousser d'abord) :
```powershell
git clone https://github.com/TON-COMPTE/gestion-stock.git
cd gestion-stock
```

---

## 3. Créer la base de données PostgreSQL

Le projet attend une base **`stock`** avec un utilisateur **`user`** / mot de passe **`user`**
(valeurs par défaut, modifiables à l'étape 4).

Ouvre **« SQL Shell (psql) »** (installé avec PostgreSQL) et connecte-toi avec le compte
`postgres` (mot de passe choisi à l'installation). Appuie sur Entrée pour accepter les valeurs
par défaut (Server: localhost, Database: postgres, Port: 5432, Username: postgres), puis saisis
le mot de passe `postgres`. Colle ensuite ces lignes :

```sql
CREATE USER "user" WITH PASSWORD 'user';
CREATE DATABASE stock OWNER "user";
GRANT ALL PRIVILEGES ON DATABASE stock TO "user";
```

> Les guillemets autour de `"user"` sont importants (c'est un mot réservé).
> Tape `\q` puis Entrée pour quitter psql.

*(Alternative graphique : tu peux faire la même chose avec **pgAdmin**, installé avec PostgreSQL :
clic droit sur « Login/Group Roles » → Create → Login/Group Role `user` (mot de passe `user`,
onglet Privileges → Can login = Yes) ; puis clic droit sur « Databases » → Create → Database `stock`,
Owner = `user`.)*

---

## 4. Configurer et installer le projet

Dans PowerShell, place-toi dans le dossier du projet, puis :

**a) Créer le fichier `.env`** (à partir de l'exemple) :

```powershell
Copy-Item .env.example .env
```

Ouvre `.env` (bloc-notes) et **vérifie/adapte** — si tu as gardé les valeurs de l'étape 3,
rien à changer. Sinon, mets tes vraies valeurs :

```
SQL_HOST=localhost
SQL_PORT=5432
SQL_DB_NAME=stock
SQL_USER=user
SQL_PASSWORD=user
SQL_ADMIN_USER=user
SQL_ADMIN_PASSWORD=user
PORT=3001
JWT_SECRET=mets-ici-une-longue-chaine-aleatoire
APP_URL=http://localhost:3000

# (Optionnel) Assistant IA — carte « Résumé d'activité » du Tableau de bord.
# Laisse vide si tu ne l'utilises pas. Clé à créer sur console.anthropic.com.
ANTHROPIC_API_KEY=
# (Optionnel) Modèle IA — défaut claude-opus-4-8 ; claude-haiku-4-5 = moins cher.
# AI_MODEL=claude-haiku-4-5
```

> 🔐 **Sécurité** : mets une vraie chaîne aléatoire dans `JWT_SECRET` (≥ 32 caractères).
> Ne partage jamais ton `ANTHROPIC_API_KEY` : si elle a fuité, régénère-la sur la console Anthropic.

**b) Installer les dépendances** (recrée `node_modules`) :

```powershell
npm install
```

**c) Vérifier la connexion à la base** :

```powershell
npm run db:check
```
→ doit afficher « ✅ Connexion réussie ». Si erreur, revois l'étape 3 et le `.env`.

**d) Créer les tables** :

```powershell
npm run db:push
```

> ℹ️ Le serveur crée aussi automatiquement les **tables récentes** à son démarrage
> (mécanisme `ensureSchema`) : si `db:push` pose souci, lancer `npm run server` (étape 5)
> suffit à créer/compléter le schéma.

**e) (Optionnel) Remplir des données de démonstration** :

```powershell
npm run db:seed
```
→ produits, ventes, achats, avoirs, etc. (contexte Madagascar, en Ariary).

> ⚠️ `db:seed` est **rejouable** mais **vide d'abord les tables métier** (il garde les comptes
> utilisateurs). Ne le lance pas si tu as déjà saisi de vraies données à conserver.

📘 **Pour comprendre le fonctionnement complet** (tous les onglets, la comptabilité, les rôles…) :
voir le document **`DOCUMENTATION_PROJET.docx`** fourni à la racine.

---

## 5. Lancer l'application (2 terminaux)

Ouvre **deux** fenêtres PowerShell dans le dossier du projet :

**Terminal 1 — API (port 3001) :**
```powershell
npm run server
```

**Terminal 2 — Front (port 3000) :**
```powershell
npm run dev
```

Puis ouvre ton navigateur sur **http://localhost:3000**.

### Première connexion
- Si tu **as lancé le seed** (étape 4e), la base n'a pas encore de compte : **crée un compte**
  (bouton « Créer un compte »). Le **1er compte créé sur une base vide devient automatiquement Super Admin**.
- Ensuite connecte-toi avec cet identifiant.

> ⚠️ Après un `npm install`, si les serveurs tournaient, ils s'arrêtent : **relance-les**.
> Ne lance jamais deux `npm install` en même temps.

---

## 6. Arrêter / relancer

- Pour **arrêter** un serveur : `Ctrl + C` dans son terminal.
- Pour **relancer** : `npm run server` et `npm run dev` (étape 5).
- Libérer le port 3001 s'il reste bloqué :
  ```powershell
  Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  ```

---

## 7. Pousser le projet sur Git (repo `gestion-stock` déjà créé)

> Le `.gitignore` exclut déjà `node_modules/`, `dist/` et **`.env`** (tes secrets ne partent pas sur Git — c'est voulu).
> Chez toi (ou sur un autre PC), après un `git clone`, il faudra donc **refaire `.env` (étape 4a)** et **`npm install`**.

> ℹ️ Le dépôt local est **déjà initialisé** (branche `main`, 1er commit fait, remote `origin`
> pointant sur `https://github.com/samueldolly321/gestion-stock.git`). Il ne reste qu'à **publier** :

```powershell
git push -u origin main
```

> Si Git demande une authentification, utilise ton identifiant GitHub et, comme **mot de passe**,
> un **jeton d'accès personnel** (GitHub → Settings → Developer settings → Personal access tokens →
> « Generate new token », coche la case `repo`). Colle ce jeton quand le mot de passe est demandé.

**Repartir de zéro sur un autre PC** (si tu n'as pas copié le dossier `.git`) :
```powershell
git init
git branch -M main
git add .
git commit -m "Import initial du projet Vokatra-ko"
git remote add origin https://github.com/samueldolly321/gestion-stock.git
git push -u origin main
```

Les fois **suivantes** (après des modifications) :

```powershell
git add .
git commit -m "Description de mes changements"
git push
```

Pour **récupérer** les changements sur un autre PC :
```powershell
git pull
npm install      # si des dépendances ont changé
npm run db:push  # si le schéma de base a changé
```

---

## 8. Dépannage rapide

| Problème | Cause probable | Solution |
|---|---|---|
| `db:check` échoue (authentification) | mauvais user/mot de passe | Vérifie `.env` et l'utilisateur créé à l'étape 3 |
| `db:check` échoue (connexion refusée) | PostgreSQL non démarré | Ouvre « Services » Windows → démarre `postgresql-x64-16` |
| Page blanche / erreurs à l'écran | front pas rechargé | `Ctrl + Shift + R` (rafraîchissement forcé) |
| « port 3001 déjà utilisé » | ancien serveur encore actif | Commande de libération du port (§6) |
| Ancien nom / anciennes données affichés | cache navigateur | `Ctrl + Shift + R` |
| Les tables n'existent pas | `db:push` non exécuté | Refais l'étape 4d |

---

## 9. Récapitulatif express (si tu connais déjà)

```powershell
# base : dans psql (compte postgres)
#   CREATE USER "user" WITH PASSWORD 'user';
#   CREATE DATABASE stock OWNER "user";
#   GRANT ALL PRIVILEGES ON DATABASE stock TO "user";

Copy-Item .env.example .env      # puis adapter si besoin
npm install
npm run db:check
npm run db:push
npm run db:seed                  # optionnel (données démo)
npm run server                   # terminal 1
npm run dev                      # terminal 2  → http://localhost:3000
```

Bon déploiement ! 🚀
