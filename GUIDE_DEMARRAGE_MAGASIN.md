# 🏪 Vokatra-ko — Fiche de mise en route « Magasin »

Guide pas-à-pas pour installer et démarrer Vokatra-ko dans un magasin de gros,
avec **1 PC serveur**, **1 chef de magasin** et **3-4 caissiers** (chacun son PC),
en **réseau local** (fonctionne **sans Internet**).

> 📌 Pour les détails techniques, voir aussi `GUIDE_RESEAU_LOCAL.md`.
> Cette fiche est le « fil conducteur » à suivre dans l'ordre.

---

## 1. Comprendre l'organisation (2 minutes)

```
        ┌──────────────────────────────┐
        │   PC SERVEUR (reste allumé)  │   ← contient TOUTES les données
        │   serveur-local.cmd          │
        └───────────────┬──────────────┘
                        │  réseau local (câble / Wi-Fi)
      ┌─────────┬───────┼────────┬─────────┐
   ┌──┴──┐  ┌───┴──┐ ┌──┴───┐ ┌──┴───┐ ┌───┴──┐
   │Chef │  │Caisse│ │Caisse│ │Caisse│ │Caisse│
   │ .exe│  │1 .exe│ │2 .exe│ │3 .exe│ │4 .exe│
   └─────┘  └──────┘ └──────┘ └──────┘ └──────┘
```

- **1 seul PC** fait office de **serveur** : il héberge l'application et la base.
  Ce peut être le PC du chef, ou un PC dédié qui reste allumé.
- Les **autres postes** ouvrent simplement l'application **Vokatra-ko** (le `.exe`)
  qui se connecte au serveur. Ils ne stockent aucune donnée.

---

## 2. Matériel & prérequis (liste de courses)

- [ ] **1 PC serveur** correct qui reste allumé aux heures d'ouverture.
- [ ] **3-4 PC caissiers** (Windows).
- [ ] **1 box / routeur / switch** reliant tous les postes (même réseau).
      **Pas besoin d'Internet** : un routeur **sans connexion Internet**, simplement
      allumé, suffit (il ne sert qu'à relier les postes en local).
      **Wi-Fi ou câble** au choix, tant que tout le monde est sur le **même réseau**.
      *⚠️ Éviter le Wi-Fi « Invité/Guest » (il isole les appareils). Idéal : câbles
      Ethernet pour les caisses, plus stable que le Wi-Fi.*
- [ ] **1 onduleur (UPS)** sur le PC serveur — **fortement recommandé** (coupures
      de courant → protège la base de données).
- [ ] **1 clé USB / disque externe** pour les sauvegardes.
- [ ] *(Facultatif)* imprimante tickets 80 mm ou A4 pour les reçus.

---

## 3. Installer le PC SERVEUR (à faire une seule fois)

> ⏱️ ~30 min. À faire par une personne à l'aise avec l'informatique.

### 3.1 Installer les logiciels de base
- [ ] **Node.js LTS** → https://nodejs.org (bouton « LTS »).
- [ ] **PostgreSQL 16** → https://www.postgresql.org/download/windows/
      → **note bien le mot de passe** choisi pendant l'installation.

### 3.2 Créer la base de données
Ouvrir **pgAdmin** (installé avec PostgreSQL) et exécuter :
```sql
CREATE USER "user" WITH PASSWORD 'user';
CREATE DATABASE stock OWNER "user";
```

### 3.3 Copier l'application
- [ ] Copier le dossier du projet sur le PC serveur, ex. `C:\Vokatra-ko`.

### 3.4 Configurer la connexion
- [ ] Créer un fichier **`.env`** à la racine du projet :
```env
SQL_HOST=localhost
SQL_PORT=5432
SQL_USER=user
SQL_PASSWORD=user
SQL_DB_NAME=stock
JWT_SECRET=colle-ici-une-longue-chaine-aleatoire-de-32-caracteres-minimum
```

### 3.5 Première installation
Dans PowerShell, ouvert dans le dossier du projet :
```powershell
npm install
npm run db:push     # crée les tables (une seule fois)
```

### 3.6 Démarrer le serveur
- [ ] Double-cliquer **`serveur-local.cmd`** (racine du projet).
      La 1ʳᵉ fois, il construit l'interface (patiente), puis démarre le serveur.
      **Laisser la fenêtre ouverte** (le serveur tourne dedans).

### 3.7 Noter l'adresse du serveur
- [ ] Dans PowerShell : `ipconfig` → relever l'**Adresse IPv4** (ex. `192.168.1.10`).
- [ ] L'adresse à donner aux caissiers sera : **`http://192.168.1.10:3001`**
- [ ] *(Recommandé)* fixer cette IP (IP fixe Windows **ou** réservation dans la box)
      pour qu'elle ne change pas.

### 3.8 Ouvrir le pare-feu
Dans un PowerShell **administrateur**, une seule fois :
```powershell
netsh advfirewall firewall add rule name="Vokatra-ko 3001" dir=in action=allow protocol=TCP localport=3001
```

### 3.9 Démarrage automatique (recommandé)
- [ ] `Win + R` → `shell:startup` → créer un **raccourci** vers `serveur-local.cmd`.
- [ ] Régler l'alimentation du PC serveur sur **« ne jamais se mettre en veille »**.

---

## 4. Créer les comptes (sur le PC serveur, dans le navigateur)

Ouvrir `http://localhost:3001` sur le PC serveur.

### 4.1 Le compte propriétaire (1er compte = Super Admin)
- [ ] Cliquer **« Créer un compte »** → c'est le **compte du patron / chef de magasin**.
      Le tout 1er compte devient automatiquement **Super Admin** (accès total).

### 4.2 Les comptes caissiers
Dans l'onglet **Utilisateurs** → **Nouvel utilisateur**, créer un compte par caissier
avec le rôle **Caissier** :
- [ ] Caissier 1 — rôle **Caissier** — *lieu de travail* : son entrepôt/dépôt
- [ ] Caissier 2 — rôle **Caissier** — *lieu de travail* : son entrepôt/dépôt
- [ ] Caissier 3 — rôle **Caissier** — *lieu de travail* : son entrepôt/dépôt
- [ ] Caissier 4 — rôle **Caissier** — *lieu de travail* : son entrepôt/dépôt

> Le rôle **Caissier** donne accès à la **Caisse**, aux **ventes**, aux **clients** et
> aux **créances**, sans exposer les achats, les marges ni la configuration. Chaque
> vente est enregistrée au nom du caissier connecté.
>
> 🏬 **Lieu de travail** : à la création (ou plus tard, en cliquant sur la colonne
> « Lieu de travail »), affectez chaque caissier à **son entrepôt**. En caisse,
> l'**entrepôt actif** se cale alors automatiquement dessus (le caissier vend le
> stock de son dépôt). Laisser « **Entrepôt général** » si vous n'avez qu'un lieu.

### 4.3 Régler les accès (facultatif, si besoin d'ajuster)
- [ ] **Configuration ERP → Matrice de permissions** : cocher/décocher les onglets
      visibles par chaque rôle (ex. donner « Clients » aux caissiers si tu veux).

---

## 5. Saisir les données de départ (sur le PC serveur ou le poste du chef)

Dans l'ordre conseillé :
- [ ] **Configuration ERP** : raison sociale, logo (initiales), devise (Ariary), TVA.
- [ ] **Entrepôts** (onglet **Entrepôts & Localisations**) : créez vos dépôts/magasins.
      Vous y voyez aussi la **répartition du stock par entrepôt** et pouvez **transférer**
      des produits d'un dépôt à un autre (A→B).
- [ ] **Catégories** de produits.
- [ ] **Fournisseurs** (nom + téléphone).
- [ ] **Articles** : produits avec prix d'achat/vente, unité (pièce, **kg**, **carton**…),
      stock de départ. *(Le code-barres EAN-13 peut être généré par l'app.)*
- [ ] **Clients** (nom + téléphone ; tarifs négociés si besoin).

> 💡 Astuce : pour repartir « propre » après des essais, **Configuration ERP →
> Zone de danger → Remettre les chiffres à zéro** (garde produits/clients/fournisseurs).

---

## 6. Installer les postes CAISSIERS

### 6.1 Récupérer l'application
- [ ] Sur une clé USB, copier l'installeur **`Vokatra-ko Setup 1.1.0.exe`**
      (dossier `desktop\dist-installer\`).
      *(ou la version portable `win-unpacked\` à copier telle quelle.)*

### 6.2 Sur chaque poste caissier
- [ ] Installer / lancer **Vokatra-ko**. *(Windows peut afficher « Éditeur inconnu »
      → Informations complémentaires → Exécuter quand même.)*
- [ ] Au 1er lancement, saisir l'adresse du serveur : **`http://192.168.1.10:3001`**
      (l'IP notée au §3.7).
- [ ] Se connecter avec le **compte caissier** correspondant.

✅ Le caissier voit la **Caisse** et peut encaisser. Ses ventes mettent à jour le
stock **en temps réel** sur tous les postes.

### 6.3 Scanner les code-barres (facultatif)
- **Douchette USB** (recommandé) : branchez-la sur le PC caissier — elle fonctionne
  comme un clavier, **aucune installation**. En Caisse, le curseur est déjà dans la
  barre de recherche : scannez un article → il **s'ajoute au panier** (bip + message).
- **Caméra / webcam** : bouton **« Scanner »** à côté de la recherche → autorisez la
  caméra une fois → visez le code-barres. *(Nécessite la version `.exe` 1.1.0.)*
- Les étiquettes code-barres s'impriment depuis **Articles & Stocks** (fiche article).

---

## 7. Routine quotidienne

**Le matin :**
- [ ] Vérifier que le **PC serveur est allumé** et que `serveur-local.cmd` tourne
      (fenêtre ouverte). *(Automatique si tu as fait le §3.9.)*
- [ ] Les caissiers ouvrent **Vokatra-ko** et se connectent.

**Le soir (chef de magasin) :**
- [ ] Vérifier les ventes du jour (onglet **Ventes** / **Tableau de bord**).
- [ ] **Sauvegarder la base** (voir §8).

---

## 8. Sauvegardes (à ne pas négliger)

Toutes les données sont sur le **PC serveur uniquement**. Sauvegarder régulièrement :
```powershell
pg_dump -U user -d stock -f sauvegarde_vokatra_%DATE%.sql
```
- [ ] Copier ces fichiers sur une **clé USB / disque externe**.
- [ ] En cas de panne du PC serveur, c'est ce qui permet de tout restaurer.

> Fréquence conseillée : **tous les jours** en fin de journée.

---

## 9. Dépannage rapide

| Problème | Solution |
|---|---|
| Un caissier voit « Serveur injoignable » | PC serveur allumé ? Fenêtre `serveur-local.cmd` ouverte ? Même réseau ? Bonne adresse (§3.7) ? |
| Ça marchait, puis plus rien | L'IP du serveur a peut-être changé → refaire §3.7, mettre à jour l'adresse dans l'appli caissier (**Fichier → Changer de serveur**), ou fixer l'IP. |
| « Connexion refusée » | Règle de pare-feu manquante → refaire §3.8 (en administrateur). |
| Le serveur s'arrête seul | Le PC serveur se met en veille → désactiver la veille (§3.9). |
| Un caissier a oublié son mot de passe | Le chef le réinitialise dans **Utilisateurs**. |

---

## 10. Check-list finale (tout est prêt si tout est coché)

- [ ] PC serveur : logiciels installés, base créée, `.env` configuré.
- [ ] `serveur-local.cmd` démarre le serveur, IP notée, pare-feu ouvert, démarrage auto.
- [ ] Compte chef (Super Admin) + comptes caissiers (rôle **Caissier**, lieu de travail affecté) créés.
- [ ] Données de base saisies (articles, clients, fournisseurs).
- [ ] Application installée sur chaque poste caissier et connectée au serveur.
- [ ] Sauvegarde testée + onduleur en place.

---

## Aide-mémoire « qui fait quoi »

| | PC serveur | Poste chef | Postes caissiers |
|---|---|---|---|
| **Rôle** | héberge tout | supervise | encaissent |
| **Compte** | — | Super Admin / Admin | Caissier |
| **Lance** | `serveur-local.cmd` | `Vokatra-ko` (.exe) | `Vokatra-ko` (.exe) |
| **Accès** | (moteur) | tout | Caisse & ventes |

Bonne mise en route ! 🚀
