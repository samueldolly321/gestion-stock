# 🏪 Vokatra-ko — Fiche de mise en route « Magasin »

Guide pas-à-pas pour installer et démarrer **Vokatra-ko** dans un magasin, avec la
**version autonome** : **un seul fichier `.exe`**, **PostgreSQL est déjà intégré**
(rien à installer), **100 % hors ligne**. On **double-clique et ça marche.**

> 📌 Pour partager les données entre **plusieurs postes** (chef + caissiers), voir
> aussi `GUIDE_RESEAU_LOCAL.md`. Cette fiche est le « fil conducteur » à suivre dans l'ordre.

---

## 1. Comprendre l'organisation (1 minute)

**Cas simple — 1 poste (recommandé pour démarrer) :**
```
   ┌─────────────────────────────────────────┐
   │   PC CAISSE                              │
   │   Vokatra-ko.exe                         │
   │   (application + base de données         │
   │    embarquée : TOUT est ici)             │
   └─────────────────────────────────────────┘
```
Le `.exe` embarque **l'application ET la base**. Aucune installation de PostgreSQL,
aucun serveur à configurer, aucun réseau. Les données restent sur ce PC.

**Cas magasin — plusieurs caissiers qui partagent les mêmes données :**
```
        ┌──────────────────────────────┐
        │  PC PRINCIPAL (reste allumé) │  ← lance Vokatra-ko.exe
        │  Vokatra-ko.exe (app + base) │  ← LES DONNÉES VIVENT ICI
        └───────────────┬──────────────┘
                        │  réseau local (câble / Wi-Fi)
        ┌───────────────┼───────────────┐
   ┌────┴─────┐   ┌─────┴────┐   ┌──────┴───┐
   │ Caisse 2 │   │ Caisse 3 │   │ Caisse 4 │  ← un simple NAVIGATEUR
   │(navigat.)│   │(navigat.)│   │(navigat.)│    vers l'adresse du PC principal
   └──────────┘   └──────────┘   └──────────┘
```
> ⚠️ Sur les autres postes on **n'installe PAS** le `.exe` (sinon chacun aurait sa
> propre base). On ouvre juste un **navigateur** vers le PC principal. Détails au §6
> et dans `GUIDE_RESEAU_LOCAL.md`.

---

## 2. Matériel & prérequis (liste de courses)

- [ ] **1 PC** (Windows 10/11) pour la caisse principale.
- [ ] *(Magasin multi-postes)* **1-3 PC supplémentaires** + **1 box / routeur / switch**
      reliant tous les postes au **même réseau** (Wi-Fi ou câble ; **pas besoin d'Internet**).
      *⚠️ Éviter le Wi-Fi « Invité/Guest » (il isole les appareils).*
- [ ] **1 onduleur (UPS)** sur le PC principal — **fortement recommandé** (une coupure
      de courant brutale peut abîmer la base).
- [ ] **1 clé USB / disque externe** pour les sauvegardes.
- [ ] *(Facultatif)* imprimante tickets 80 mm ou A4 pour les reçus.
- [ ] *(Facultatif)* douchette code-barres USB.

> ✅ **Rien d'autre à installer** : ni Node.js, ni PostgreSQL, ni pgAdmin. Tout est
> dans le `.exe`.

---

## 3. Installer le PC de CAISSE (à faire une seule fois)

> ⏱️ ~3 min.

### 3.1 Copier l'installeur
- [ ] Récupérer le fichier **`Vokatra-ko Setup 0.0.0.exe`** (clé USB) et le copier sur le PC.

### 3.2 Installer
- [ ] Double-cliquer **`Vokatra-ko Setup 0.0.0.exe`**.
      *(Windows peut afficher « Windows a protégé votre ordinateur / Éditeur inconnu »
      → **Informations complémentaires** → **Exécuter quand même**.)*
- [ ] Choisir le dossier d'installation (ou laisser par défaut), laisser cocher
      **« créer un raccourci sur le Bureau »**, terminer.

### 3.3 Premier lancement
- [ ] Double-cliquer le raccourci **Vokatra-ko**.
      **⏳ Le tout premier lancement prend un peu plus de temps** (il prépare la base
      de données intégrée) — c'est normal, patiente jusqu'à l'écran de connexion.
- [ ] Les lancements suivants sont rapides.

> 💾 Les données sont stockées sur ce PC dans `%APPDATA%\Vokatra-ko\pgdata`
> (dossier personnel Windows). Elles **persistent** entre les redémarrages et
> **survivent à une réinstallation** de la nouvelle version.

---

## 4. Créer les comptes

Au premier écran de l'application :

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

## 5. Saisir les données de départ

Dans l'ordre conseillé :
- [ ] **Configuration ERP** : raison sociale, logo, **NIF** et **STAT** (imprimés sur les
      factures — tant qu'ils manquent, la facture affiche un rappel à l'écran), devise (Ariary), TVA.
- [ ] **Entrepôts** (onglet **Entrepôts & Localisations**) : un **« Entrepôt Central »** est créé
      automatiquement au 1er lancement (renommez-le si vous voulez). Ajoutez vos autres
      dépôts/magasins s'il y en a. Vous y voyez aussi la **répartition du stock par entrepôt**
      et pouvez **transférer** des produits d'un dépôt à un autre (A→B).
- [ ] **Catégories** de produits.
- [ ] **Fournisseurs** (nom + téléphone).
- [ ] **Articles** : produits avec prix d'achat/vente, unité (pièce, **kg**, **carton**…),
      stock de départ. *(Le code-barres EAN-13 peut être généré par l'app.)*
- [ ] **Clients** (nom + téléphone ; tarifs négociés si besoin ; pour une entreprise,
      son **NIF** et son **STAT**, imprimés sur ses factures).

> 💡 Astuce : pour repartir « propre » après des essais, **Configuration ERP →
> Zone de danger → Remettre les chiffres à zéro** (garde produits/clients/fournisseurs).

---

## 5 bis. Restaurant, gargote, snack (plats avec recette)

Au 1er lancement, à la question **« Quel est votre commerce ? »**, choisissez
**« Restauration, gargote, snack »**. Les catégories sont créées pour vous (Entrées, Plats,
Desserts, Boissons, **Ingrédients**, Emballages).

**Le principe en une phrase :** on stocke les **ingrédients** ; un **plat** n'a pas de stock à
lui, il a une **recette**. Chaque fois qu'on vend un plat, ses ingrédients sortent du stock.

```
   Achats / réceptions ──► INGRÉDIENTS (riz, poulet, huile…) ──► stock
                                    ▲
   Vente d'un PLAT (caisse) ────────┘  retire les ingrédients de la recette
```

### 5 bis.1 Créer les ingrédients (articles normaux)
Dans **Articles & Stocks → onglet « Ingrédients & articles » → Nouveau Produit** :
- [ ] Un article par ingrédient : **unité** adaptée (**Kg**, **g**, **Litre**, **Pièces**…),
      **prix d'achat** (il sert au calcul du coût des plats), **stock de départ**.
- [ ] Les boissons et produits revendus tels quels (Coca, eau, barquettes) se créent de la
      même façon : ils se vendent directement en caisse.

### 5 bis.2 Créer les plats
**Articles & Stocks → onglet « Plats » → Nouveau plat (recette)** :
- [ ] Nom, catégorie, **prix de vente d'une portion**, photo.
- [ ] **Recette pour 1 portion** : cherchez chaque ingrédient et saisissez la quantité
      **dans son unité** (ex. riz `0,15` kg, huile `0,02` L, œuf `1` pièce).
- [ ] Vérifiez le résumé, calculé en direct : **coût de revient**, **marge**, **coût matière %**
      (on vise souvent **25 à 35 %** ; orange au-delà de 40 %) et **portions possibles**.

- [ ] *(Facultatif)* **Suppléments** (« + œuf », « + crevettes ») : dans la fiche du plat,
      section **Suppléments** → nom affiché, **ingrédient retiré**, quantité et **prix**. À la
      caisse, ajouter ce plat ouvre une fenêtre pour les cocher ; ils s'impriment sous le plat
      sur le ticket et leur ingrédient sort du stock.

> Les **portions possibles** = combien de plats on peut faire avec le stock actuel :
> c'est l'ingrédient **le plus limitant** qui décide (ex. plus que 0,5 kg de brèdes à
> 0,05 kg/portion → 10 portions, même s'il reste beaucoup de riz).

### 5 bis.3 Au quotidien
- [ ] **Caisse** : on vend les plats comme n'importe quel article ; la carte affiche les
      **portions possibles**. Si un ingrédient manque, **la vente passe quand même** (le
      service n'est jamais bloqué) et une alerte liste ce qui manquait → vérifiez le stock.
- [ ] **Tailles de portion** (facultatif) : dans la fiche du plat, section **Tailles**, bouton
      **« Petite / Normale / Grande »** (préremplit ×0,7 / ×1 / ×1,5 avec des prix proposés,
      modifiables). La recette saisie est la portion **normale** ; une Grande ×1,5 retire 1,5 fois
      chaque ingrédient. À la caisse, le choix de la taille s'affiche (Normale présélectionnée) ;
      la taille apparaît sur le ticket, le bon de cuisine, les rapports (une ligne par taille) et
      la déclaration de perte.
- [ ] **Bon de cuisine** : après l'encaissement, bouton orange **« Imprimer le bon de cuisine »**
      (ticket 80 mm, gros caractères, sans prix) : numéro de commande, heure, plats et
      suppléments, et la **note** de la commande (ex. « table 4, sans piment »). Les boissons n'y
      figurent pas. Réimpression possible depuis **Ventes → Réimprimer le reçu**.
- [ ] **Plat raté, invendu jeté, renversé** : onglet **Plats** → icône ⚠ **« Déclarer une
      perte »** → nombre de portions + motif. Les ingrédients sortent du stock en « Perte ».
- [ ] **Réceptions** : les achats et entrées se font sur les **ingrédients** (pas sur les
      plats) ; les portions possibles remontent toutes seules.
- [ ] **Inventaire** régulier des ingrédients (**Audits & Ajustements**) : c'est lui qui
      révèle les pertes non déclarées.

### 5 bis.4 Rapports cuisine
**Articles & Stocks → onglet « Rapports cuisine »** (période 7 j / 30 j / mois / dates) :
- **Marge par plat** : portions vendues, chiffre d'affaires, coût matière, marge, pertes.
- **Consommation d'ingrédients** : ce qui est parti (plats, vente directe, pertes) et
  **jours de stock restant** au rythme actuel → la liste de courses.
- **Écarts** : ce que l'inventaire a trouvé en moins, et les ingrédients qui manquaient au
  moment de vendre (réception ou inventaire oublié).
Chaque tableau s'exporte en **Excel**.

> ❓ **Pourquoi pas « Ajuster le stock » sur un plat ?** Parce qu'un plat n'a pas de stock
> propre : on ajuste ses **ingrédients**, et ses portions possibles se recalculent.

---

## 6. Ajouter d'autres postes caissiers (magasin multi-postes)

> Si tu n'as **qu'un seul PC**, saute cette étape : tout se passe sur le PC de caisse.

Sur les autres postes, **on n'installe pas le `.exe`** — on ouvre l'application
**depuis le PC principal**, via un simple **navigateur**.

### 6.1 Sur le PC principal (une fois)
- [ ] Le laisser **allumé** aux heures d'ouverture (et ne pas le mettre en veille).
- [ ] **Autoriser le port dans le pare-feu.** Dans un PowerShell **administrateur** :
      ```powershell
      netsh advfirewall firewall add rule name="Vokatra-ko 34519" dir=in action=allow protocol=TCP localport=34519
      ```
- [ ] **Noter son adresse IP** : PowerShell → `ipconfig` → ligne **Adresse IPv4**
      (ex. `192.168.1.10`). *(Recommandé : fixer cette IP — réservation DHCP dans la box.)*

### 6.2 Sur chaque poste caissier
- [ ] Ouvrir un navigateur (Chrome / Edge) sur : **`http://192.168.1.10:34519`**
      (l'IP notée ci-dessus). Créer un **raccourci / favori** vers cette adresse.
- [ ] Se connecter avec le **compte caissier** correspondant.

✅ Le caissier voit la **Caisse** et peut encaisser. Ses ventes mettent à jour le
stock **en temps réel** sur tous les postes (tout est enregistré sur le PC principal).

> 📖 Détails complets (pare-feu, IP fixe, dépannage réseau) : `GUIDE_RESEAU_LOCAL.md`.

### 6.3 Scanner les code-barres (facultatif)
- **Douchette USB** (recommandé) : branchez-la sur le poste — elle fonctionne comme
  un clavier, **aucune installation**. En Caisse, le curseur est déjà dans la barre de
  recherche : scannez un article → il **s'ajoute au panier** (bip + message).
- **Caméra / webcam** : bouton **« Scanner »** à côté de la recherche → visez le
  code-barres. *(Dans l'app `.exe`, la caméra est déjà autorisée. Dans un navigateur,
  acceptez la demande d'autorisation caméra.)*
- Les étiquettes code-barres s'impriment depuis **Articles & Stocks** (fiche article).

### 6.4 Imprimer un reçu / une facture
- En caisse, après encaissement, cliquez **Imprimer** : la fenêtre d'impression de
  Windows s'ouvre (format **ticket 80 mm** ou **A4**). Choisissez l'imprimante et
  validez. *(L'impression fonctionne directement dans l'app autonome.)*

---

## 7. Mettre à jour l'application plus tard

Quand une nouvelle version sort, on installe simplement le **nouveau `.exe`**
**sur le PC principal** (et sur tout PC qui utilise le `.exe`) :

- [ ] Récupérer le nouveau **`Vokatra-ko Setup X.Y.Z.exe`**.
- [ ] Le lancer et installer **par-dessus** l'ancienne version.
      **✅ Les données sont conservées** (elles vivent dans `%APPDATA%\Vokatra-ko`,
      pas dans le dossier d'installation).
- [ ] Les postes caissiers **en navigateur** n'ont **rien** à faire : ils voient la
      nouvelle version automatiquement (au besoin, actualiser la page avec `Ctrl+F5`).

---

## 8. Routine quotidienne

**Le matin :**
- [ ] Allumer / vérifier le **PC principal** et **lancer Vokatra-ko** (le laisser ouvert).
- [ ] Les caissiers ouvrent leur **favori navigateur** (multi-postes) ou l'app.

**Le soir (chef de magasin) :**
- [ ] Vérifier les ventes du jour (onglet **Ventes** / **Tableau de bord**).
- [ ] **Sauvegarder les données** (voir §9).

---

## 9. Sauvegardes (à ne pas négliger)

Toutes les données sont sur le **PC principal**, dans `%APPDATA%\Vokatra-ko\pgdata`.

**Méthode simple (recommandée) — copie du dossier de données :**
1. [ ] **Fermer complètement Vokatra-ko** (clic sur la croix ; l'app arrête sa base proprement).
2. [ ] Ouvrir l'Explorateur, coller dans la barre d'adresse : `%APPDATA%\Vokatra-ko`
3. [ ] Copier le dossier **`pgdata`** entier sur une **clé USB / disque externe**
       (renommez avec la date, ex. `pgdata-2026-08-10`).

> 🔁 **Restauration** : fermer l'app → remplacer le dossier `pgdata` par la copie
> sauvegardée → relancer l'app.
>
> ⚠️ La copie doit se faire **application fermée** (sinon la base est en cours
> d'utilisation et la copie serait incohérente).

Fréquence conseillée : **tous les jours** en fin de journée.

---

## 10. Dépannage rapide

| Problème | Solution |
|---|---|
| Le 1er lancement est long | Normal : la base intégrée s'initialise une seule fois. Patienter. |
| Au démarrage : « démarrage impossible » | Une ancienne instance tourne encore, ou un `postgres.exe` est resté bloqué → **fermer l'app partout, puis redémarrer le PC** et relancer. |
| L'impression n'ouvre pas la bonne imprimante | Dans la fenêtre d'impression Windows, sélectionner la bonne imprimante (80 mm ou A4). |
| Un poste **navigateur** voit « impossible d'accéder au site » | PC principal allumé et Vokatra-ko ouvert ? Même réseau ? Bonne adresse `http://IP:34519` ? Pare-feu ouvert (§6.1) ? |
| Ça marchait, puis plus rien (multi-postes) | L'IP du PC principal a changé → refaire §6.1 (relever l'IP) et mettre à jour le favori, ou fixer l'IP. |
| Un caissier a oublié son mot de passe | Le chef le réinitialise dans **Utilisateurs**. |
| *(Restaurant)* Un plat affiche « 0 portion » | Un ingrédient de la recette est épuisé : faites une réception ou un ajustement de cet **ingrédient** (survolez « N ingrédients » sous le plat pour voir sa recette). |
| *(Restaurant)* Alerte « ingrédients insuffisants » après une vente | La vente est enregistrée ; le stock de l'ingrédient était trop bas (réception oubliée ?). Corrigez par une entrée ou un inventaire. |

---

## 11. Check-list finale (tout est prêt si tout est coché)

- [ ] PC de caisse : `Vokatra-ko Setup 0.0.0.exe` installé, 1er lancement OK.
- [ ] Compte chef (Super Admin) + comptes caissiers (rôle **Caissier**, lieu de travail affecté) créés.
- [ ] Données de base saisies (articles, clients, fournisseurs).
- [ ] *(Restaurant)* ingrédients créés avec prix d'achat et stock, plats créés avec leur
      recette, une vente test faite et le stock des ingrédients vérifié.
- [ ] *(Multi-postes)* pare-feu ouvert (34519), IP notée/fixée, postes caissiers connectés en navigateur.
- [ ] Impression testée (reçu).
- [ ] Sauvegarde testée + onduleur en place.

---

## Aide-mémoire « qui fait quoi »

| | PC principal | Postes caissiers (multi-postes) |
|---|---|---|
| **Lance** | `Vokatra-ko` (.exe) | un **navigateur** → `http://IP-principal:34519` |
| **Contient** | l'app **+ la base** (toutes les données) | rien (affichage seulement) |
| **Compte** | Super Admin / Admin | Caissier |
| **Accès** | tout | Caisse & ventes |

Bonne mise en route ! 🚀
