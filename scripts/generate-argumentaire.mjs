/**
 * Génère ARGUMENTAIRE_COMMERCIAL.docx — plaquette commerciale Vokatra-ko.
 * Lancement :  node scripts/generate-argumentaire.mjs  (ou : npm run doc:sales)
 */
import fs from 'node:fs';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';

const CY = '0047AB';   // cobalt
const GREY = '555555';

// ---- Helpers ----
const title = (t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: t, bold: true, size: 46, color: CY })] });
const subtitle = (t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new TextRun({ text: t, italics: true, size: 24, color: GREY })] });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 }, children: [new TextRun({ text: t, bold: true, color: CY })] });
const p = (t) => new Paragraph({ spacing: { after: 100 }, children: typeof t === 'string' ? [new TextRun(t)] : t });
const quote = (t) => new Paragraph({ spacing: { before: 80, after: 160 }, indent: { left: 200 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: CY, space: 120 } }, children: [new TextRun({ text: t, italics: true, color: GREY })] });
const bullet = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: typeof t === 'string' ? [new TextRun(t)] : t });
const b = (txt) => new TextRun({ text: txt, bold: true });
const r = (txt) => new TextRun(txt);
const spacer = () => new Paragraph({ spacing: { after: 80 }, children: [new TextRun('')] });

function table(headers, rows) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((hd) => new TableCell({
      shading: { fill: CY },
      margins: { top: 50, bottom: 50, left: 90, right: 90 },
      children: [new Paragraph({ children: [new TextRun({ text: hd, bold: true, color: 'FFFFFF', size: 19 })] })],
    })),
  });
  const bodyRows = rows.map((cells, i) => new TableRow({
    children: cells.map((c) => new TableCell({
      shading: { fill: i % 2 ? 'F4F7FB' : 'FFFFFF' },
      margins: { top: 40, bottom: 40, left: 90, right: 90 },
      children: [new Paragraph({ children: typeof c === 'string' ? [new TextRun({ text: c, size: 19 })] : c })],
    })),
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows: [headRow, ...bodyRows] });
}

const doc = new Document({
  styles: { default: { document: { run: { font: 'Calibri', size: 21, color: '222222' } } } },
  sections: [{
    properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
    children: [
      title('Vokatra-ko'),
      subtitle('Le logiciel de gestion de stock, de caisse et de comptabilité pensé pour les commerces malgaches.'),
      quote('Vos articles, vos ventes, vos achats et vos comptes — réunis dans une seule application, avec vos données qui restent chez vous.'),

      h1('1. Le pitch en une phrase'),
      p([b('Vokatra-ko transforme la gestion quotidienne d\'un magasin — stock, caisse, achats, clients, comptabilité — en une seule application simple, rapide et fiable, sans dépendre d\'Internet ni d\'un cloud étranger.')]),

      h1('2. Pour qui ?'),
      table(['Cible', 'Ce que Vokatra-ko apporte'], [
        ['Boutiques & magasins de détail', 'Caisse rapide avec code-barres, stock en temps réel, alertes de rupture'],
        ['Supérettes / mini-markets', 'Multi-rayons, dates de péremption, inventaires'],
        ['Grossistes / demi-gros', 'Achat et vente au carton ou à la pièce, tarifs par client, dette fournisseurs'],
        ['Distributeurs multi-dépôts', 'Plusieurs entrepôts, mouvements de stock tracés'],
      ]),

      h1('3. Vos problèmes… et nos réponses'),
      table(['Votre problème', 'La réponse Vokatra-ko'], [
        ['« Je ne sais jamais ce qu\'il me reste en stock. »', 'Stock en temps réel, mis à jour à chaque vente et réception.'],
        ['« Je découvre trop tard une rupture. »', 'Alertes automatiques de seuil bas et de produits périmés.'],
        ['« Mes ventes sont sur un cahier, je perds du temps. »', 'Caisse (POS) avec code-barres, calcul automatique, ticket imprimé.'],
        ['« Je ne sais pas si je gagne de l\'argent ce mois-ci. »', 'Tableau de bord recettes / dépenses / solde + compte de résultat.'],
        ['« Qui me doit de l\'argent ? Combien je dois ? »', 'Créances clients et dettes fournisseurs suivies automatiquement.'],
        ['« J\'achète en carton mais je vends à la pièce. »', 'Conversion carton ↔ pièce automatique : le stock reste juste.'],
        ['« J\'ai peur pour mes données. »', 'Vos données restent sur votre propre base, en local ou sur votre serveur.'],
      ]),

      h1('4. Les fonctionnalités clés (par bénéfice)'),
      p([b('Stock toujours juste')]),
      bullet('Catalogue complet : articles, catégories, marques, plusieurs entrepôts.'),
      bullet('Code-barres EAN-13 : génération + étiquettes imprimables à coller sur les produits.'),
      bullet('Dates de péremption et n° de lot pour les produits sensibles.'),
      bullet('Historique de chaque article : toutes ses entrées et sorties, datées.'),
      bullet('Vente en gros : « 1 carton = 12 pièces », achat au carton, vente à la pièce — conversion automatique.'),
      spacer(),
      p([b('Caisse rapide et fiable')]),
      bullet('Encaissement en quelques secondes, recherche par nom ou code-barres.'),
      bullet('Impression du ticket (rouleau 80 mm) ou d\'une facture A4.'),
      bullet('Prix négocié par client appliqué automatiquement.'),
      bullet('Paiement partiel / à crédit (le reste devient une créance).'),
      bullet('Vente à perte bloquée : impossible de vendre sous le prix d\'achat par erreur.'),
      bullet('TVA optionnelle selon votre régime.'),
      spacer(),
      p([b('Achats & fournisseurs maîtrisés')]),
      bullet('Commandes fournisseurs avec produits pré-remplis et prix négocié par fournisseur.'),
      bullet('Réception qui met à jour le stock ET le coût d\'achat moyen.'),
      bullet('Dette fournisseurs et règlements suivis automatiquement.'),
      spacer(),
      p([b('Pilotage & comptabilité')]),
      bullet('Tableau de bord : meilleures ventes, meilleurs clients, recettes / dépenses / solde.'),
      bullet('États de TVA (collectée, déductible, nette) et compte de résultat (CA, marge, résultat).'),
      bullet('Résumé d\'activité rédigé par une intelligence artificielle, en français clair.'),
      bullet('Exports PDF et Excel de tous les tableaux.'),
      spacer(),
      p([b('Plusieurs utilisateurs, chacun son rôle')]),
      bullet('Comptes Caissier, Magasinier, Comptable, Commercial, Administrateur…'),
      bullet('Chaque rôle ne voit que ce qui le concerne (contrôle d\'accès configurable).'),
      bullet('Journal d\'audit : chaque action est tracée.'),

      h1('5. Ce qui nous distingue'),
      table(['Atout', 'Pourquoi ça compte pour vous'], [
        ['Vos données chez vous', 'Base sur votre propre machine — pas de cloud étranger, fonctionne sans Internet permanent.'],
        ['Adapté à Madagascar', 'Devise Ariary native (affichage € possible), contexte local.'],
        ['Simple à utiliser', 'Interface claire, en français, pensée pour le terrain.'],
        ['Sécurité sérieuse', 'Mots de passe chiffrés, droits vérifiés côté serveur, montants recalculés (anti-fraude).'],
        ['Une installation par client', 'Vos données sont 100 % isolées des autres commerces.'],
        ['Évolutif', 'Le logiciel s\'enrichit régulièrement de nouvelles fonctions.'],
      ]),

      h1('6. Comment ça se déploie ?'),
      bullet('1. Installation sur votre ordinateur (ou un petit serveur) — Windows.'),
      bullet('2. Création de votre compte propriétaire (Super Admin) en 1 minute.'),
      bullet('3. Création des comptes de vos employés avec leurs rôles.'),
      bullet('4. Saisie ou import de votre catalogue (articles, fournisseurs, clients).'),
      bullet('5. Vous êtes opérationnel : vous vendez, vous suivez, vous décidez.'),
      quote('Chaque commerce a sa propre installation et sa propre base de données. Vos données ne sont jamais mélangées avec celles d\'un autre client.'),

      h1('7. Ce que Vokatra-ko remplace'),
      bullet('Le cahier de caisse et les calculs à la main.'),
      bullet('Les fichiers Excel éparpillés et fragiles.'),
      bullet('Les logiciels compliqués et chers, souvent pensés pour l\'étranger.'),
      bullet('Les abonnements cloud qui coûtent chaque mois et exigent une bonne connexion.'),

      h1('8. Offre & accompagnement'),
      quote('À personnaliser selon votre politique commerciale.'),
      bullet([b('Licence : '), r('[ex. paiement unique par installation / par magasin].')]),
      bullet([b('Mise en service : '), r('installation, formation de base, import du catalogue.')]),
      bullet([b('Support : '), r('[ex. assistance par téléphone / à distance].')]),
      bullet([b('Mises à jour : '), r('[incluses / selon formule].')]),

      h1('9. Réponses aux objections fréquentes'),
      p([b('« C\'est compliqué à installer ? » '), r('Non : installation guidée, et nous nous en occupons à la mise en service.')]),
      p([b('« Et si mon ordinateur tombe en panne ? » '), r('Vos données sont sauvegardables et réinstallables sur un autre poste (guide fourni).')]),
      p([b('« Ça marche sans Internet ? » '), r('Oui, en local. Internet n\'est utile que pour certaines options (ex. résumé IA) et l\'assistance à distance.')]),
      p([b('« Je vends en gros ET au détail. » '), r('C\'est prévu : achat/vente au carton ou à la pièce, conversion automatique du stock.')]),

      h1('10. Passons à l\'étape suivante'),
      p([b('Contact : '), r('Samuel · 034 21 890 51 · hariniainasamuelandrianirina@gmail.com')]),
      bullet('Démonstration gratuite sur votre activité réelle.'),
      bullet('Installation d\'essai avec vos propres produits.'),
      bullet('Devis adapté à la taille de votre commerce.'),
      quote('Vokatra-ko — gérez votre commerce simplement, gardez le contrôle de vos données.'),
    ],
  }],
});

const OUT = 'ARGUMENTAIRE_COMMERCIAL.docx';
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`✅ ${OUT} généré (${Math.round(buf.length / 1024)} Ko).`);
});
