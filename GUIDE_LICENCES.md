# 🔑 Vokatra-ko — Licences de la version .exe (guide vendeur)

La version de bureau (`Vokatra-ko Setup X.Y.Z.exe`) est protégée par une **clé de licence
liée à l'ordinateur**. Tout fonctionne **hors ligne** : ni le client ni vous n'avez besoin
d'Internet pour activer.

| | |
|---|---|
| **Essai** | 7 jours sans clé, avec un bandeau « jours restants » |
| **Après l'essai** | écran d'activation ; les données du client sont **conservées** |
| **Licence** | **à vie**, pour **un ordinateur** (le PC principal) |
| **Réseau local** | les caisses en navigateur passent par le PC principal → **une seule licence** par magasin |

---

## Avant de commencer

### Quel .exe utiliser ?

Après `npm run desktop:build`, le dossier `release\` contient :

| Fichier | À quoi il sert |
|---|---|
| `release\Vokatra-ko Setup X.Y.Z.exe` | **L'installateur** : c'est lui qu'on donne aux clients (raccourcis, désinstallation propre). |
| `release\win-unpacked\Vokatra-ko.exe` | L'application **déjà décompressée** : se lance directement, sans installation. Pratique pour tester. Si on le déplace, copier **tout** le dossier `win-unpacked` (le `.exe` seul ne marche pas). |

Les autres fichiers (`.blockmap`, `latest.yml`, `builder-debug.yml`) ne sont pas à distribuer.

### Ce qu'il faut sur votre PC pour générer des clés

- **Node.js** installé (déjà le cas si vous compilez le projet).
- Le **dossier du projet** (pour `generer-licence.cmd` et `scripts\licence.mjs`).
- Votre **clé privée** dans `C:\Users\<vous>\.vokatra-ko-licences\cle-privee.pem`.
  Pour générer des clés depuis un **autre PC**, copiez-y ce fichier au même endroit
  (avec `registre-licences.csv` si vous voulez garder un seul registre).

### Tester l'activation sur votre propre PC

1. Lancez `release\win-unpacked\Vokatra-ko.exe` (ou installez le Setup).
2. Cliquez sur **« Activer une licence »** et copiez le code machine affiché.
3. Double-cliquez sur `generer-licence.cmd`, collez ce code, mettez un nom (ex. « Test »).
4. Collez la clé obtenue dans l'application → **« Licence activée »**.

La ligne « Test » apparaîtra dans `registre-licences.csv` : vous pouvez la supprimer dans Excel.

---

## 1. Ce qu'il faut garder précieusement

Votre **clé privée** sert à fabriquer les licences :

```
C:\Users\<vous>\.vokatra-ko-licences\cle-privee.pem
```

- **Sauvegardez-la** (clé USB, coffre-fort de mots de passe…). Si vous la perdez, vous ne
  pourrez plus créer de licences pour cette version de l'application.
- **Ne la donnez à personne**, ne la mettez **jamais** sur GitHub : avec elle, n'importe qui
  pourrait fabriquer des licences.
- Ne relancez **pas** `node scripts/licence.mjs init` : une nouvelle paire de clés rendrait
  invalides toutes les licences déjà vendues (le script refuse si la clé existe déjà).

Dans le même dossier, `registre-licences.csv` garde la trace de chaque licence créée
(date, client, code machine, clé) — ouvrable dans Excel.

---

## 2. Vendre une licence, pas à pas

1. Le client installe le `.exe` sur son **PC principal** et l'utilise (essai de 7 jours).
2. Il clique sur **« Activer une licence »** (bandeau orange) — ou attend la fin de l'essai —
   et vous envoie le **code machine** affiché, par ex. `1A2B-3C4D-5E6F-7A8B`
   (bouton « Copier » ; par SMS, WhatsApp, e-mail…).
3. Après paiement, sur **votre** PC, double-cliquez sur **`generer-licence.cmd`** (à la
   racine du projet), saisissez le code machine et le nom du client.
   *(En ligne de commande : `node scripts/licence.mjs generer 1A2B-3C4D-5E6F-7A8B "Épicerie Rasoa"`)*
4. Envoyez au client la clé affichée (elle commence par `VK1.` — environ 180 caractères,
   à copier **en entier**).
5. Le client la colle dans l'écran d'activation → **« Licence activée »**. C'est fini.

Vérifier une clé (réclamation d'un client) :
`node scripts/licence.mjs verifier <CLE> [CODE-MACHINE]`

---

## 3. Questions fréquentes

**Le client change d'ordinateur ou réinstalle Windows.** Le code machine change : la clé
ne fonctionne plus sur le nouvel ordinateur. Générez-lui une nouvelle clé pour le nouveau
code (à vous de décider si c'est gratuit). Ses données se récupèrent en copiant le dossier
`%APPDATA%\Vokatra-ko` (voir `GUIDE_RESEAU_LOCAL.md`, sauvegardes).

**Le client réinstalle simplement l'application.** Même ordinateur, même Windows : la
licence reste valable (elle est rangée dans `%APPDATA%\Vokatra-ko\licence.json`, avec les
données). S'il a supprimé ce dossier, il lui suffit de recoller sa clé.

**Le client essaie de prolonger l'essai.** La date de début d'essai est gardée à trois
endroits (fichier, base de données, registre Windows) : supprimer l'un d'eux ne relance pas
l'essai. Reculer la date de l'ordinateur bloque l'application jusqu'à correction.

**Plusieurs caisses dans le magasin.** Une seule licence, sur le PC principal : les autres
postes ouvrent l'application dans un navigateur et profitent de cette licence.

**Deux magasins séparés (deux PC principaux).** Deux licences.

---

## 4. Limites (à connaître)

C'est une protection **sérieuse pour un usage normal**, pas une protection absolue :
l'application est écrite en JavaScript et ses fichiers sont lisibles dans le dossier
d'installation. Une personne compétente et décidée pourrait modifier ces fichiers pour
retirer le contrôle. Ce que la protection garantit :

- impossible de **fabriquer** une clé sans votre clé privée (signature Ed25519) ;
- une clé **ne fonctionne que sur l'ordinateur** pour lequel elle a été faite ;
- copier l'installation ou le dossier de données sur un autre PC **ne copie pas la licence**.

---

## 5. Côté technique

- Vérification : `src/server/license.ts` (code machine, signature, essai) ;
  routes `GET /api/license/status` et `POST /api/license/activate`
  (`src/server/routes/license.ts`) ; garde qui renvoie **402** au reste de l'API.
- Interface : `src/components/LicenseGate.tsx` (bandeau d'essai, écran d'activation).
- Activée **uniquement** dans le `.exe` (`LICENSE_REQUIRED=1` posé par `electron/main.cjs`) :
  la version web (Render) et `npm run dev` ne sont pas concernées.
- Outil vendeur : `scripts/licence.mjs` + `generer-licence.cmd` — **exclus de l'installateur**.
- Clé publique : `src/server/license-public-key.ts` (peut être publiée sans risque).
