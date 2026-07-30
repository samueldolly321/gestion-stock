# 🏠 Vokatra-ko — Installation en réseau local (hors ligne, plusieurs postes)

Ce guide met Vokatra-ko en place **sans Internet**, avec **plusieurs postes qui
partagent les mêmes données**. Le principe : **un PC fait office de serveur**
(il héberge la base et l'application), les **autres postes s'y connectent par le
réseau local** (Wi-Fi / câble via la box ou un routeur).

```
   PC SERVEUR (reste allumé)                 POSTES CLIENTS
   ┌───────────────────────────┐            ┌───────────────┐
   │ PostgreSQL + serveur       │◄──réseau──►│ Vokatra-ko.exe│
   │ Vokatra-ko (port 3001)     │   local    │ (Electron)    │
   │ → LES DONNÉES VIVENT ICI   │            └───────────────┘
   └───────────────────────────┘            ┌───────────────┐
                                        ◄───►│ Vokatra-ko.exe│
                                             └───────────────┘
```

> ⚠️ **Aucune synchronisation** avec la version en ligne (Render) : ce sont deux
> installations séparées, avec des données distinctes. C'est voulu.

> ✅ **Hors ligne** : tant que tous les postes sont sur le **même réseau local**,
> Internet n'est pas nécessaire.

---

## Prérequis

- **1 PC serveur** qui reste **allumé** pendant les heures de travail (idéalement
  ne se met pas en veille). C'est lui qui garde les données.
- Tous les postes sur le **même réseau** (même box / routeur).
- Idéalement, une **adresse IP fixe** pour le PC serveur (voir §A-6).

---

## A. Préparer le PC SERVEUR

### 1. Installer les outils
- **Node.js LTS** : https://nodejs.org (bouton « LTS »).
- **PostgreSQL 16** : https://www.postgresql.org/download/windows/
  Pendant l'installation, note bien le **mot de passe** du super-utilisateur.

### 2. Créer la base
Ouvre **pgAdmin** (installé avec PostgreSQL) ou l'outil **SQL Shell (psql)**, et
crée un utilisateur + une base (adapte si tu veux) :

```sql
CREATE USER "user" WITH PASSWORD 'user';
CREATE DATABASE stock OWNER "user";
```

### 3. Récupérer l'application
Copie le dossier du projet sur le PC serveur (clé USB, ou `git clone`), par ex.
dans `C:\Vokatra-ko`.

### 4. Configurer la connexion à la base
À la racine du projet, crée un fichier **`.env`** (copie de `.env.example` si présent) :

```env
SQL_HOST=localhost
SQL_PORT=5432
SQL_USER=user
SQL_PASSWORD=user
SQL_DB_NAME=stock
JWT_SECRET=metsUneLongueChaineAleatoireIciDeAuMoins32Caracteres
```

### 5. Première installation
Dans un terminal (PowerShell) ouvert dans le dossier du projet :

```powershell
npm install
npm run db:push      # crée les tables dans la base (à faire 1 seule fois)
```

### 6. Démarrer le serveur
Double-clique **`serveur-local.cmd`** (à la racine). La première fois, il construit
l'interface puis démarre le serveur sur le **port 3001**. **Laisse la fenêtre ouverte.**

- Test sur le PC serveur lui-même : ouvre `http://localhost:3001` → l'écran de
  connexion apparaît. Le **1er compte créé devient Super Admin**.

### 7. Connaître l'adresse IP du PC serveur
Dans PowerShell : `ipconfig` → relève la ligne **Adresse IPv4** (ex.
`192.168.1.10`). C'est l'adresse que les autres postes utiliseront :
**`http://192.168.1.10:3001`**.

> 💡 Pour éviter que l'adresse change, réserve-la : soit une **IP fixe** dans
> Windows, soit une **réservation DHCP** dans l'interface de ta box/routeur.

### 8. Autoriser le port dans le pare-feu Windows
Une fois, dans un PowerShell **en administrateur** :

```powershell
netsh advfirewall firewall add rule name="Vokatra-ko 3001" dir=in action=allow protocol=TCP localport=3001
```

### 9. (Recommandé) Démarrage automatique
Pour que le serveur se lance seul au démarrage de Windows :
- Appuie sur `Win + R`, tape `shell:startup`, Entrée.
- Crée un **raccourci** vers `serveur-local.cmd` dans ce dossier.
- Pense à régler l'alimentation du PC serveur sur **« ne jamais se mettre en veille »**.

---

## B. Installer les POSTES CLIENTS (le .exe)

### 1. Générer l'application (une fois)
Sur un PC avec Node.js, depuis le dossier `desktop/` du projet — **deux options** :

**Option A — Version portable (simple, recommandée)** :
```powershell
npm install
npm run dist:portable
```
→ produit un `.zip` dans `desktop/dist-installer/`. Aucun droit administrateur requis.

**Option B — Vrai installeur `.exe`** :
```powershell
npm install
npm run dist
```
→ produit `Vokatra-ko Setup 1.0.0.exe`.
⚠️ Nécessite d'activer le **Mode développeur** de Windows (*Paramètres → Confidentialité
et sécurité → Pour les développeurs*) **ou** un terminal **administrateur** — sinon la
génération échoue (erreur de « lien symbolique »). La version portable (A) évite ça.

### 2. Installer sur chaque poste
- **Option A (portable)** : copie le `.zip`, décompresse-le sur le poste, lance
  **`Vokatra-ko.exe`** (crée un raccourci bureau si tu veux).
- **Option B (installeur)** : copie le `.exe` et lance l'installation.
- Dans les deux cas, au 1er lancement, saisis l'adresse du serveur
  **`http://192.168.1.10:3001`** (l'IP relevée au §A-7), puis connecte-toi avec un
  compte créé sur le serveur.

Tous les postes voient désormais **les mêmes données**, mises à jour en temps réel.

---

## Sauvegardes (important)

Les données sont sur le **PC serveur uniquement**. Sauvegarde régulièrement la base :

```powershell
pg_dump -U user -d stock -f sauvegarde_vokatra_%DATE%.sql
```

Range ces fichiers sur une clé USB / disque externe. En cas de panne du PC serveur,
c'est ce qui permet de tout restaurer.

---

## Dépannage

| Problème | À vérifier |
|---|---|
| Un poste affiche « Serveur injoignable » | PC serveur allumé ? Fenêtre `serveur-local.cmd` ouverte ? Même réseau ? Bonne IP ? |
| Ça marchait, puis plus rien | L'IP du serveur a peut-être changé → refais §A-7 et mets à jour l'adresse (menu **Fichier → Changer de serveur**), ou fixe l'IP (§A-7). |
| Connexion refusée | Règle de pare-feu manquante → refais §A-8 (en administrateur). |
| Le serveur s'arrête tout seul | Le PC serveur se met en veille → désactive la veille. |

---

## En résumé

| | |
|---|---|
| **Serveur** | 1 PC allumé : `serveur-local.cmd` + PostgreSQL. Données ici. |
| **Clients** | `Vokatra-ko.exe` pointant sur `http://IP-serveur:3001`. |
| **Internet** | Pas nécessaire (réseau local uniquement). |
| **En ligne (Render)** | Reste séparé, données distinctes. |
