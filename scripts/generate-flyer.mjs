/**
 * Génère ARGUMENTAIRE_FLYER.docx — flyer commercial 1 page Vokatra-ko.
 * Lancement :  node scripts/generate-flyer.mjs  (ou : npm run doc:flyer)
 */
import fs from 'node:fs';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
} from 'docx';

const CY = '0047AB';
const GREY = '555555';

const center = (children, opts = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: opts.after ?? 60 }, children });
const p = (children, opts = {}) => new Paragraph({ spacing: { after: opts.after ?? 40 }, children });
const bullet = (children) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children });
const b = (t, o = {}) => new TextRun({ text: t, bold: true, ...o });
const r = (t, o = {}) => new TextRun({ text: t, ...o });
const rule = () => new Paragraph({ spacing: { before: 60, after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: CY } }, children: [new TextRun('')] });

const doc = new Document({
  styles: { default: { document: { run: { font: 'Calibri', size: 20, color: '222222' } } } },
  sections: [{
    properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
    children: [
      center([b('Vokatra-ko', { size: 44, color: CY })], { after: 40 }),
      center([b('Gérez votre commerce simplement. Gardez le contrôle de vos données.', { size: 24, color: GREY, italics: true })], { after: 100 }),
      center([r('Le logiciel de gestion de stock, de caisse et de comptabilité pensé pour les commerces malgaches.', { size: 20 })], { after: 30 }),
      center([r('Stock, ventes, achats et comptes réunis dans une seule application — ', { size: 20 }), b('vos données restent chez vous.', { size: 20, color: CY })], { after: 60 }),
      rule(),

      p([b('Ce que Vokatra-ko fait pour vous', { size: 22, color: CY })]),
      bullet([b('Stock toujours juste'), r(' — temps réel, code-barres EAN-13, alertes de rupture et de péremption, plusieurs entrepôts.')]),
      bullet([b('Caisse rapide'), r(' — encaissement en quelques secondes, ticket imprimé, prix par client, paiement à crédit.')]),
      bullet([b('Vente en gros'), r(' — achat/vente au carton ou à la pièce, conversion automatique du stock.')]),
      bullet([b('Achats & fournisseurs'), r(' — commandes, réception, dette fournisseurs suivie automatiquement.')]),
      bullet([b('Vous savez où vous en êtes'), r(' — tableau de bord recettes/dépenses/solde, TVA, compte de résultat, résumé par IA.')]),
      bullet([b('Plusieurs utilisateurs'), r(' — un rôle par employé (caissier, magasinier, comptable…), chaque action tracée.')]),
      rule(),

      p([b('Pourquoi le choisir', { size: 22, color: CY })]),
      bullet([b('Vos données chez vous'), r(' — sans cloud étranger, fonctionne sans Internet permanent.')]),
      bullet([b('Adapté à Madagascar'), r(' — devise Ariary, interface simple en français.')]),
      bullet([b('Sécurité sérieuse'), r(' — accès par rôle, anti-fraude, mots de passe chiffrés.')]),
      bullet([b('Une installation par magasin'), r(' — vos données 100 % isolées.')]),
      rule(),

      center([b('Pour qui ? ', { color: CY }), r('Boutiques • Supérettes • Grossistes / demi-gros • Distributeurs multi-dépôts')], { after: 100 }),

      center([b('Demandez une démonstration gratuite sur votre activité.', { size: 22 })], { after: 30 }),
      center([r('Contact : ', { size: 20 }), b('Samuel · 034 21 890 51 · hariniainasamuelandrianirina@gmail.com', { size: 20, color: CY })], { after: 80 }),
      center([b('Vokatra-ko — votre commerce sous contrôle, en un coup d\'œil.', { italics: true, color: CY })]),
    ],
  }],
});

const OUT = 'ARGUMENTAIRE_FLYER.docx';
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`✅ ${OUT} généré (${Math.round(buf.length / 1024)} Ko).`);
});
