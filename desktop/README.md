# 🖥️ Vokatra-ko — Client bureau (Electron)

Application Windows qui affiche Vokatra-ko dans une fenêtre « logiciel » dédiée.
Elle **ne contient pas** de données : elle se connecte au **serveur local** du réseau
(le PC qui héberge PostgreSQL + le serveur Express — voir `../GUIDE_RESEAU_LOCAL.md`).

## Développement (tester sans installer)

Depuis ce dossier `desktop/` :

```bash
npm install
npm start
```

Au 1er lancement, saisis l'adresse du serveur (ex. `http://192.168.1.10:3001`).
Pour tester en local sur le PC serveur lui-même : `http://localhost:3001`.

## Distribuer aux postes clients — 2 options

### Option A — Version portable (simple, sans droits admin) ✅ recommandé pour démarrer

```bash
npm install
npm run dist:portable
```

Produit `desktop/dist-installer/Vokatra-ko-<version>-win.zip`. Sur chaque poste :
**décompresse** le zip où tu veux, puis lance **`Vokatra-ko.exe`** (tu peux créer
un raccourci sur le bureau). Aucune installation, aucun droit administrateur.

> Le contenu décompressé est aussi disponible directement dans
> `desktop/dist-installer/win-unpacked/` après un build.

### Option B — Vrai installeur Windows (.exe)

```bash
npm install
npm run dist
```

Produit `desktop/dist-installer/Vokatra-ko Setup <version>.exe` (installeur classique).

> ⚠️ **Prérequis Windows** : la génération de l'installeur nécessite d'activer le
> **Mode développeur** (Paramètres → Confidentialité et sécurité → Pour les
> développeurs → *Mode développeur* : Activé), **ou** de lancer le terminal **en
> administrateur**. Sinon la construction échoue avec une erreur de « lien
> symbolique » (privilège insuffisant) — c'est une limitation connue de
> l'outil de packaging, pas de l'application. La **version portable (Option A)**
> n'a pas cette contrainte.

> Icône : place un fichier `build/icon.ico` (256×256) dans `desktop/` avant le
> build pour personnaliser l'icône ; sinon l'icône Electron par défaut est utilisée.

## Comment ça marche

- L'adresse du serveur est mémorisée par utilisateur Windows
  (`%APPDATA%/Vokatra-ko/config.json`).
- Menu **Fichier → Changer de serveur…** pour la modifier.
- Si le serveur est éteint / hors réseau, une fenêtre propose *Changer de serveur*
  ou *Réessayer*.
