/**
 * Génère DOCUMENTATION_PROJET.docx — présentation complète du projet Vokatra-ko (A → Z).
 * Lancement :  node scripts/generate-doc.mjs
 */
import fs from 'node:fs';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';

const CY = '0047AB'; // cobalt

// ---- Helpers ----
const title = (t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: t, bold: true, size: 44, color: CY })] });
const subtitle = (t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: t, italics: true, size: 24, color: '555555' })] });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: [new TextRun({ text: t, bold: true, color: CY })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 80 }, children: [new TextRun({ text: t, bold: true })] });
const p = (t) => new Paragraph({ spacing: { after: 100 }, children: typeof t === 'string' ? [new TextRun(t)] : t });
const bullet = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: typeof t === 'string' ? [new TextRun(t)] : t });
const b = (txt) => new TextRun({ text: txt, bold: true });
const r = (txt) => new TextRun(txt);

function table(headers, rows) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((hd) => new TableCell({
      shading: { fill: CY },
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: hd, bold: true, color: 'FFFFFF', size: 18 })] })],
    })),
  });
  const bodyRows = rows.map((cells, i) => new TableRow({
    children: cells.map((c) => new TableCell({
      shading: { fill: i % 2 ? 'F4F7FB' : 'FFFFFF' },
      margins: { top: 30, bottom: 30, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: String(c), size: 18 })] })],
    })),
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows: [headRow, ...bodyRows] });
}
const spacer = () => new Paragraph({ text: '' });

// ---- Contenu ----
const kids = [];
const A = (...items) => kids.push(...items);

// Page de garde
A(
  new Paragraph({ spacing: { before: 1800 } }),
  title('VOKATRA-KO'),
  subtitle('ERP de gestion de stock, ventes, achats et comptabilité'),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Documentation complète du projet — de A à Z', size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Contexte Madagascar · Devise Ariary (Ar)', italics: true, size: 20, color: '777777' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Généré le 2026-07-27', size: 18, color: '999999' })] }),
  new Paragraph({ pageBreakBefore: true }),
);

// 1. Présentation
A(
  h1('1. Présentation générale'),
  p([b('Vokatra-ko'), r(' (« mon produit » en malgache) est un logiciel de gestion d\'entreprise (ERP) complet, pensé pour une petite/moyenne structure à Madagascar. Il centralise le stock, les ventes en caisse, les achats fournisseurs, les livraisons, les clients et la comptabilité de base.')]),
  p('Noms successifs du projet au fil de son évolution : StockFlow → Invenzo → Vokatra-ko (nom actuel). La raison sociale et les initiales du logo sont administrables.'),
  h2('À quoi ça sert (en une phrase)'),
  p('Savoir en temps réel ce qu\'on a en stock, ce qu\'on vend, ce qu\'on achète, ce qu\'on nous doit (créances) et ce qu\'on doit (dettes fournisseurs) — et suivre la rentabilité (marge, TVA, résultat).'),
  h2('Technologies'),
  table(['Élément', 'Technologie'], [
    ['Interface (front)', 'React 19 + Vite + Tailwind CSS v4'],
    ['Serveur (API)', 'Express (Node.js), point d\'entrée src/server.ts, port 3001'],
    ['Base de données', 'PostgreSQL 16 (via l\'ORM Drizzle)'],
    ['Authentification', 'Maison — jetons JWT + mots de passe chiffrés (bcrypt)'],
    ['Temps réel', 'Server-Sent Events (SSE) — notifications instantanées'],
    ['Devise', 'Base Ariary (MGA), affichage Ar ou € converti (taux configurable)'],
    ['Assistant IA', 'API Claude (Anthropic) — résumé d\'activité'],
    ['Hébergement', 'En ligne sur Render (redéploiement auto à chaque mise à jour)'],
  ]),
);

// 2. Architecture
A(
  h1('2. Architecture technique'),
  p('L\'application est composée de deux parties qui tournent ensemble :'),
  bullet([b('Le front (navigateur)'), r(' : ce que voit l\'utilisateur (les écrans, onglets, boutons). Développé en React.')]),
  bullet([b('L\'API (serveur)'), r(' : reçoit les demandes du front, lit/écrit dans la base PostgreSQL, applique les règles de sécurité. Le navigateur ne parle jamais directement à la base.')]),
  p('En production (Render), un seul service web sert à la fois l\'API et le front sur la même adresse. Les nouvelles tables se créent automatiquement au démarrage du serveur (mécanisme « ensureSchema »).'),
  h2('Organisation des fichiers (repères)'),
  table(['Dossier / fichier', 'Rôle'], [
    ['src/components/', 'Les écrans React (un fichier par onglet)'],
    ['src/services/', 'Le lien front → API (appels réseau) + logique partagée'],
    ['src/server/routes/', 'Les routes de l\'API (un fichier par ressource)'],
    ['src/db/schema.ts', 'La définition des tables de la base'],
    ['src/services/permissions.ts', 'La source de vérité des droits (rôles)'],
    ['RECAP.md', 'Récapitulatif technique détaillé et à jour'],
  ]),
);

// 3. Démarrage
A(
  h1('3. Démarrage & comptes'),
  p('En local, l\'app se lance avec deux commandes (voir GUIDE_INSTALLATION.md) : l\'API (npm run server) et le front (npm run dev), puis on ouvre http://localhost:3000.'),
  h2('Première connexion'),
  bullet('Le tout premier compte créé sur une base vide devient automatiquement « Super Admin » (le propriétaire).'),
  bullet('Ensuite, l\'inscription publique est fermée : les comptes suivants se créent depuis l\'onglet Utilisateurs (réservé aux administrateurs).'),
);

// 4. Les onglets
A(
  h1('4. Les modules (onglets)'),
  p('Chaque onglet correspond à un métier. Voici ce que fait chacun :'),
);
const tabs = [
  ['Tableau de bord', 'Vue d\'ensemble : indicateurs clés (KPI), graphiques, alertes cliquables (ruptures, périmés), performance commerciale (7/30/90 jours), recettes/dépenses/solde, et la carte « Résumé d\'activité (IA) ».'],
  ['Articles & Stocks', 'Le catalogue produits : création/modification, catégories & sous-catégories, marques, entrepôts, unité de mesure, code-barres EAN-13 (génération + étiquette imprimable), colonne fournisseur, ajustement rapide de stock.'],
  ['Caisse POS', 'La vente au comptoir : panier, quantités, remise, moyens de paiement, livraison, paiement partiel/à crédit, TVA optionnelle, prix éditable par ligne (tarif client appliqué automatiquement, vente à perte bloquée), impression du reçu (ticket 80 mm ou facture A4).'],
  ['Ventes', 'Le journal de toutes les ventes : filtre Jour/Mois/Année (ou dates personnalisées), synthèse (nb ventes, CA, encaissé, reste dû), détail d\'une vente et réimpression du reçu, export PDF/Excel.'],
  ['Créances Clients', 'Ce que les clients doivent : avances et reste dû par vente, encaissements, historique des règlements, et établissement d\'avoirs (notes de crédit).'],
  ['Clients & Fournisseurs', 'Les tiers commerciaux : fiches clients (fidélité, encours) et fournisseurs (coffre-fort documents). Panneau « Produits fournis » par fournisseur (prix négocié) et panneau « Tarifs » par client (prix de vente négocié).'],
  ['Achats', 'Les commandes fournisseurs : création (produits pré-remplis selon le fournisseur), réception valorisée (met à jour le stock et le prix d\'achat moyen), suivi des règlements (dette fournisseurs). TVA optionnelle, filtre par date.'],
  ['Réapprovisionnement', 'Les articles sous le seuil minimum : quantités suggérées et création groupée de commandes d\'achat par fournisseur (avec anti-doublon).'],
  ['Dépenses', 'Les frais divers (transport, douane, taxes, carburant…), liés ou non à un achat, avec statut payé/non payé.'],
  ['Livraisons', 'Les livraisons chez le client : type de transport (moto, voiture, camion…), tarif ajouté à la facture, statut, chauffeur, date planifiée.'],
  ['Calendrier', 'Vue mensuelle des commandes fournisseurs (réception prévue), livraisons planifiées et échéances de créances. Bouton « + » sur chaque date pour créer directement une commande ou une livraison.'],
  ['Audits & Ajustements', 'Les inventaires physiques : comptage, validation (ajuste le stock), historique.'],
  ['Historique des Flux', 'Le registre inaltérable de tous les mouvements de stock (entrées, sorties, retours…).'],
  ['Comptabilité', 'États de TVA et compte de résultat (voir section dédiée).'],
  ['Utilisateurs', 'La gestion des comptes : création, rôles, activation/désactivation, réinitialisation de mot de passe (Super Admin / Admin).'],
  ['Configuration ERP', 'Les réglages : raison sociale, nom de marque, logo (initiales), NIF/Stat, devise et taux, thème, numérotation des factures/avoirs, et la matrice des permissions par rôle.'],
];
for (const [name, desc] of tabs) {
  A(new Paragraph({ spacing: { before: 100, after: 20 }, children: [new TextRun({ text: name, bold: true, color: CY })] }), p(desc));
}

// 5. RBAC
A(
  h1('5. Contrôle d\'accès (rôles & permissions)'),
  p('Le système gère les droits sur deux dimensions, configurables depuis la Configuration ERP et appliquées côté serveur :'),
  bullet([b('Accès aux onglets'), r(' : quels onglets chaque rôle voit.')]),
  bullet([b('Droits d\'écriture'), r(' : dans quels modules chaque rôle peut créer/modifier/supprimer.')]),
  h2('Les rôles'),
  table(['Rôle', 'Vocation'], [
    ['Super Admin', 'Propriétaire — accès complet garanti (non verrouillable)'],
    ['Admin', 'Administration générale'],
    ['Manager / Gérant', 'Gère tout sauf les comptes utilisateurs'],
    ['Commercial', 'Ventes, caisse, clients, créances, livraisons'],
    ['Acheteur', 'Achats / approvisionnement'],
    ['Comptable', 'Comptabilité, règlements, dépenses'],
    ['Magasinier', 'Stock, réception, réapprovisionnement, inventaires'],
    ['Auditeur', 'Consultation, mouvements, inventaires'],
  ]),
  p('La sécurité est appliquée sur le serveur : même en modifiant l\'affichage, un utilisateur ne peut pas effectuer une action que son rôle n\'autorise pas, ni lire des données sensibles réservées.'),
);

// 6. Comptabilité
A(
  h1('6. La comptabilité en détail'),
  p('L\'onglet Comptabilité fournit deux états, calculés par Mois / Trimestre / Année, avec exports PDF/Excel.'),
  h2('A. État de TVA'),
  bullet([b('TVA collectée'), r(' : la TVA facturée aux clients (sur les ventes).')]),
  bullet([b('TVA déductible'), r(' : la TVA payée aux fournisseurs (sur les achats).')]),
  bullet([b('TVA nette'), r(' = TVA collectée − TVA déductible. C\'est ce qui est dû (ou récupérable) sur la période.')]),
  h2('B. Compte de résultat'),
  p('Il mesure la rentabilité :'),
  bullet([b('CA HT'), r(' (chiffre d\'affaires hors taxe) = total des ventes − TVA − frais de livraison (le transport n\'est pas du chiffre d\'affaires marchandises). Les avoirs se déduisent.')]),
  bullet([b('COGS'), r(' (coût des marchandises vendues) = le coût d\'achat réel des produits vendus, enregistré au moment de la vente (coût historique), déduction faite des retours.')]),
  bullet([b('Marge brute'), r(' = CA HT − COGS. Le taux de marge = marge ÷ CA HT.')]),
  bullet([b('Charges externes'), r(' = les dépenses de la période.')]),
  bullet([b('Résultat net'), r(' = marge brute − charges. C\'est le bénéfice (ou la perte) de la période.')]),
  h2('Comment le coût d\'achat reste juste (PMP)'),
  p('À chaque réception d\'une commande d\'achat, le prix d\'achat de la fiche article est recalculé en « coût moyen pondéré » (CUMP/PMP) : on mélange l\'ancien stock et sa valeur avec la nouvelle quantité reçue et son coût. Cela garde le COGS et le contrôle « vente à perte » fondés sur un coût à jour, même si les prix d\'achat varient.'),
  h2('Numérotation légale'),
  p('Les factures (FAC-000001…) et les avoirs (AV-000001…) reçoivent un numéro séquentiel continu, sans trou, attribué de façon fiable (même en cas d\'erreur, aucun numéro n\'est « brûlé »). Préfixes et longueur configurables.'),
);

// 7. Flux métier
A(
  h1('7. Les flux métier clés'),
  h2('Côté achats (dépenses / entrées de stock)'),
  p('Commande fournisseur → Réception (entrée de stock valorisée, mise à jour du prix d\'achat moyen) → Dépenses annexes éventuelles → Règlements fournisseurs (réduit la dette).'),
  h2('Côté ventes (recettes / sorties de stock)'),
  p('Vente en caisse (avec avance ou à crédit) → Créance client si reste dû → Encaissements successifs → éventuel Avoir (retour/annulation) → historique des règlements. Chaque vente déduit le stock et crédite la fidélité du client.'),
  h2('Les avoirs (notes de crédit)'),
  p('Un avoir corrige une facture : il réintègre le stock, s\'impute sur le reste dû puis crée un crédit client si la facture était déjà réglée (solde négatif = crédit dû au client), et reprend la fidélité au prorata. Justificatif imprimable.'),
);

// 8. Tarification
A(
  h1('8. Tarification (fournisseurs & clients)'),
  bullet([b('Prix d\'achat par fournisseur'), r(' : un même produit peut être fourni par plusieurs fournisseurs, chacun avec son prix négocié (panneau « Produits fournis »). Ces produits se pré-remplissent lors d\'une commande d\'achat.')]),
  bullet([b('Prix de vente par client'), r(' : on peut définir un prix de vente spécifique par client et par produit (panneau « Tarifs »). En caisse, sélectionner le client applique automatiquement ses tarifs.')]),
  bullet([b('Garde-fou vente à perte'), r(' : impossible de vendre sous le prix d\'achat — bloqué à l\'encaissement (côté serveur également).')]),
);

// 9. Transverses
A(
  h1('9. Fonctionnalités transverses'),
  bullet([b('Exports'), r(' : chaque tableau s\'exporte en PDF et Excel (avec en-tête à la raison sociale).')]),
  bullet([b('Recherche, filtres, pagination'), r(' : 20 lignes par page sur les tableaux.')]),
  bullet([b('Thème clair / sombre'), r(', charte graphique « Cobalt Sky ».')]),
  bullet([b('Code-barres EAN-13'), r(' : génération, rendu scannable, étiquette imprimable.')]),
  bullet([b('Devise'), r(' : montants stockés en Ariary, affichage Ar ou € converti (taux configurable).')]),
  bullet([b('Notifications temps réel (SSE)'), r(' : toasts + cloche « Historique » listant toutes les actions (journal d\'audit).')]),
  bullet([b('Identité entreprise'), r(' : raison sociale, nom de marque et initiales du logo administrables, propagés (barre latérale, reçus, exports).')]),
);

// 10. IA
A(
  h1('10. Assistant IA — Résumé d\'activité'),
  p('Sur le Tableau de bord, la carte « Résumé d\'activité (IA) » génère, à la demande, un résumé en français des chiffres du jour ou du mois (ventes, chiffre d\'affaires, marge, ruptures, créances échues…), rédigé par l\'IA Claude.'),
  p('Pour l\'activer, il faut une clé ANTHROPIC_API_KEY (créée sur console.anthropic.com), ajoutée dans le fichier .env en local et dans les variables d\'environnement sur Render. Sans clé, la carte affiche un message d\'invitation à la configurer. Le coût par génération est minime (fraction de centime).'),
);

// 11. Sécurité
A(
  h1('11. Sécurité'),
  bullet('Authentification par jeton JWT + mots de passe chiffrés (bcrypt). En production, le serveur refuse de démarrer si la clé JWT est absente/faible.'),
  bullet('Auto-inscription fermée après le premier compte ; comptes suivants créés par un administrateur.'),
  bullet('Droits vérifiés côté serveur, en lecture comme en écriture (un rôle ne peut pas lire des données réservées via l\'API).'),
  bullet('Les montants d\'une vente (total, TVA, fidélité) sont recalculés par le serveur — impossible de les falsifier depuis le navigateur.'),
  bullet('Journal d\'audit inaltérable de toutes les actions.'),
);

// 12. Modèle de données
A(
  h1('12. Modèle de données (tables principales)'),
  table(['Table', 'Contenu'], [
    ['users', 'Comptes et rôles'],
    ['products', 'Articles (prix, stock, code-barres, fournisseur…)'],
    ['categories / brands / warehouses', 'Catégories, marques, entrepôts'],
    ['clients / suppliers', 'Clients et fournisseurs'],
    ['supplier_products', 'Prix d\'achat par fournisseur (catalogue appro)'],
    ['client_prices', 'Prix de vente par client'],
    ['sales', 'Ventes, factures et avoirs (+ échéances)'],
    ['purchases', 'Commandes d\'achat (+ réception, règlements)'],
    ['stock_movements', 'Tous les mouvements de stock'],
    ['payments', 'Règlements clients et fournisseurs'],
    ['expenses / deliveries', 'Dépenses et livraisons'],
    ['inventory_audits', 'Inventaires physiques'],
    ['document_counters', 'Compteurs de numéros légaux (factures, avoirs)'],
    ['settings', 'Réglages entreprise + matrices de permissions'],
    ['audit_logs', 'Journal d\'actions'],
  ]),
);

// 13. Glossaire
A(
  h1('13. Glossaire'),
  table(['Terme', 'Définition'], [
    ['ERP', 'Progiciel de gestion intégré (stock, ventes, achats, compta…)'],
    ['POS', 'Point Of Sale — la caisse / point de vente'],
    ['SKU', 'Référence interne unique d\'un article'],
    ['TVA', 'Taxe sur la valeur ajoutée'],
    ['CA HT', 'Chiffre d\'affaires hors taxe'],
    ['COGS', 'Coût des marchandises vendues'],
    ['PMP / CUMP', 'Coût moyen pondéré (méthode de valorisation du stock)'],
    ['Créance', 'Somme qu\'un client nous doit'],
    ['Avoir', 'Note de crédit (remboursement/annulation partielle d\'une facture)'],
    ['RBAC', 'Contrôle d\'accès basé sur les rôles'],
    ['SSE', 'Server-Sent Events — notifications temps réel du serveur'],
  ]),
  spacer(),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: 'Fin du document — Vokatra-ko · 2026-07-27', italics: true, color: '999999', size: 18 })] }),
);

const doc = new Document({
  creator: 'Vokatra-ko',
  title: 'Documentation projet Vokatra-ko',
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22 } } },
  },
  sections: [{ properties: {}, children: kids }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync('DOCUMENTATION_PROJET.docx', buffer);
console.log('✅ DOCUMENTATION_PROJET.docx généré (' + Math.round(buffer.length / 1024) + ' Ko).');
