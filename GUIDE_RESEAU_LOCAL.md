# 🏠 Vokatra-ko — Plusieurs postes en réseau local (hors ligne)

Ce guide explique comment faire fonctionner **Vokatra-ko sur plusieurs postes qui
partagent les mêmes données**, **sans Internet**, à partir de la **version autonome**
(le `.exe` avec PostgreSQL intégré).

Le principe : **un seul PC (le « PC principal ») lance l'application `.exe`.** Comme
l'app embarque déjà la base **et** un petit serveur, elle est aussi **accessible sur
le réseau local**. Les **autres postes** ouvrent simplement un **navigateur** vers le
PC principal — ils n'installent rien.

```
   PC PRINCIPAL (reste allumé)               AUTRES POSTES
   ┌───────────────────────────┐            ┌───────────────────┐
   │ Vokatra-ko.exe            │◄──réseau──►│ Navigateur         │
   │ = application + base       │   local    │ http://IP:34519    │
   │ (port 34519)               │            └───────────────────┘
   │ → LES DONNÉES VIVENT ICI   │            ┌───────────────────┐
   └───────────────────────────┘       ◄───►│ Navigateur         │
                                             └───────────────────┘
```

> ⚠️ **N'installez PAS le `.exe` sur les autres postes.** Chaque `.exe` a sa **propre**
> base embarquée : deux `.exe` = deux bases séparées, données NON partagées. Pour
> partager, les autres postes doivent passer par un **navigateur** (voir §B).

> ⚠️ **Aucune synchronisation** avec la version en ligne (Render) : ce sont deux
> installations séparées, avec des données distinctes. C'est voulu.

> ✅ **Hors ligne** : tant que tous les postes sont sur le **même réseau local**,
> Internet n'est pas nécessaire.

---

## Prérequis

- **1 PC principal** qui reste **allumé** pendant les heures de travail (idéalement
  ne se met pas en veille). C'est lui qui garde les données et sert l'application.
- **1 routeur / box / switch** reliant tous les postes. **Pas besoin d'Internet** : il
  sert uniquement à créer le réseau local. Un routeur **sans connexion Internet**,
  simplement allumé, suffit.
- Tous les postes sur le **même réseau** (**Wi-Fi ou câble**). ⚠️ Éviter le Wi-Fi
  **« Invité / Guest »** : il isole souvent les appareils (option *isolation client /
  AP isolation* à laisser **désactivée**). Utiliser le réseau principal.
- Idéalement, une **adresse IP fixe** pour le PC principal (voir §A-3) — surtout en
  Wi-Fi, où l'adresse peut changer au redémarrage.
- *(Confort)* un **câble Ethernet** sur le PC principal rend les échanges plus stables.

> ✅ **Rien à installer côté serveur** : ni Node.js, ni PostgreSQL, ni pgAdmin. Tout
> est dans le `.exe`. (C'est la grande différence avec l'ancien modèle « serveur ».)

---

## A. Préparer le PC PRINCIPAL

### 1. Installer et lancer l'application
- Installer **`Vokatra-ko Setup 0.0.0.exe`** (double-clic ; si Windows affiche
  « Éditeur inconnu » → *Informations complémentaires* → *Exécuter quand même*).
- Lancer **Vokatra-ko**. Le 1er lancement prépare la base intégrée (patienter jusqu'à
  l'écran de connexion). Le **1er compte créé devient Super Admin**.
- **Laisser l'application ouverte** : c'est elle qui sert les autres postes.

### 2. Autoriser le port dans le pare-feu Windows
L'application écoute sur le port **34519**. Une fois, dans un PowerShell
**en administrateur** :

```powershell
netsh advfirewall firewall add rule name="Vokatra-ko 34519" dir=in action=allow protocol=TCP localport=34519
```

### 3. Connaître (et fixer) l'adresse IP du PC principal
Dans PowerShell : `ipconfig` → relève la ligne **Adresse IPv4** (ex. `192.168.1.10`).
C'est l'adresse que les autres postes utiliseront : **`http://192.168.1.10:34519`**.

> 💡 Pour éviter que l'adresse change au redémarrage, réserve-la : soit une **IP fixe**
> dans Windows, soit une **réservation DHCP** dans l'interface de ta box/routeur.

### 4. (Recommandé) Éviter la veille
Règle l'alimentation du PC principal sur **« ne jamais se mettre en veille »**, et
pense à **relancer Vokatra-ko** au démarrage (ou crée un raccourci dans le dossier
`shell:startup`).

---

## B. Connecter les AUTRES POSTES (navigateur)

Sur chaque poste (aucune installation) :

1. Ouvrir un navigateur (**Chrome** ou **Edge** de préférence).
2. Aller à l'adresse du PC principal : **`http://192.168.1.10:34519`** (l'IP du §A-3).
3. Créer un **favori / raccourci** vers cette adresse (pratique au quotidien).
4. Se connecter avec un **compte** créé sur le PC principal.

Tous les postes voient désormais **les mêmes données**, mises à jour en temps réel.

> 🖨️ **Impression** depuis un poste navigateur : le bouton **Imprimer** ouvre la
> fenêtre d'impression du navigateur (ticket 80 mm / A4). Sélectionne l'imprimante.
>
> 📷 **Scan par caméra** dans le navigateur : accepte la demande d'autorisation
> caméra la première fois. La **douchette USB** fonctionne partout sans réglage.

---

## C. Mettre à jour l'application

Une nouvelle version = un nouveau `.exe`, à installer **uniquement sur le PC principal** :

1. Récupérer le nouveau **`Vokatra-ko Setup X.Y.Z.exe`**.
2. L'installer **par-dessus** l'ancienne version. **✅ Les données sont conservées**
   (elles vivent dans `%APPDATA%\Vokatra-ko`, pas dans le dossier d'installation).
3. Relancer Vokatra-ko. Les postes navigateur voient la nouvelle version au
   rafraîchissement (`Ctrl+F5`).

---

## D. Sauvegardes (important)

Les données sont sur le **PC principal**, dans `%APPDATA%\Vokatra-ko\pgdata`.

**Méthode simple — copie du dossier (application fermée) :**
1. **Fermer complètement Vokatra-ko** (l'app arrête sa base proprement).
2. Explorateur → barre d'adresse : `%APPDATA%\Vokatra-ko`
3. Copier le dossier **`pgdata`** sur une **clé USB / disque externe** (avec la date).

> 🔁 **Restauration** : fermer l'app → remplacer `pgdata` par la copie → relancer.
> ⚠️ Toujours sauvegarder/restaurer **application fermée**.

---

## E. Dépannage

| Problème | À vérifier |
|---|---|
| Un poste affiche « Impossible d'accéder au site » | PC principal allumé ? **Vokatra-ko ouvert** dessus ? Même réseau ? Bonne adresse `http://IP:34519` ? |
| « Connexion refusée » / délai dépassé | Règle de pare-feu manquante → refaire §A-2 (en administrateur). |
| Ça marchait, puis plus rien | L'IP du PC principal a peut-être changé → refaire §A-3 et mettre à jour le favori, ou fixer l'IP. |
| « Démarrage impossible » sur le PC principal | Une ancienne instance / un `postgres.exe` bloqué (port occupé) → fermer partout puis **redémarrer le PC**. |
| Le PC principal s'arrête tout seul | Il se met en veille → désactiver la veille (§A-4). |

---

## En résumé

| | |
|---|---|
| **PC principal** | Lance `Vokatra-ko.exe` (app + base intégrées). Données ici. Port **34519**. |
| **Autres postes** | Un **navigateur** vers `http://IP-principal:34519`. Rien à installer. |
| **À installer côté serveur** | Rien d'autre que le `.exe` (ni Node, ni PostgreSQL). |
| **Internet** | Pas nécessaire (réseau local uniquement). |
| **En ligne (Render)** | Reste séparé, données distinctes. |
