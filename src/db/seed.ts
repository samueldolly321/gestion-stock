/**
 * Données de démonstration pour Vokatra-ko.
 * Lancement :  npm run db:seed
 *
 * Vide les tables métier (SANS toucher aux comptes utilisateurs) puis insère
 * un jeu de données cohérent en Ariary (contexte Madagascar). Rejouable.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool } from './index.ts';
import * as schema from './schema.ts';
import { ean13Checksum } from '../services/barcode.ts';

const pool = createPool();
const db = drizzle(pool, { schema });

function status(quantity: number, minStock: number, expirationDate?: string | null) {
  if (expirationDate && new Date(expirationDate) < new Date()) return 'expired';
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= minStock) return 'low_stock';
  return 'in_stock';
}

async function main() {
  console.log('→ Nettoyage des données métier (comptes conservés)...');
  await pool.query(
    `TRUNCATE stock_movements, sales, payments, deliveries, purchases, expenses, inventory_audits, audit_logs,
              products, supplier_products, categories, brands, warehouses, suppliers, clients, settings, document_counters
     RESTART IDENTITY CASCADE`,
  );

  // --- Réglages ---
  await db.insert(schema.settings).values({
    id: 'global',
    companyName: 'Vokatra-ko Distribution',
    logoInitials: 'VK',
    currency: 'MGA',
    currencySymbol: 'Ar',
    taxId: 'MG-2026-00123',
    address: 'Lot II M 42, Antananarivo 101',
    phone: '+261 34 12 345 67',
    email: 'contact@vokatra.mg',
    defaultVatRate: 20,
    defaultLanguage: 'fr',
    alertLowStock: true,
    alertExpirationDays: 30,
  });

  // --- Catégories (niveau 1) ---
  await db.insert(schema.categories).values([
    { id: 'CAT-ELEC', name: 'Électronique', description: 'Appareils et gadgets électroniques', path: 'Électronique' },
    { id: 'CAT-ALIM', name: 'Alimentation', description: 'Produits alimentaires et boissons', path: 'Alimentation' },
    { id: 'CAT-MAISON', name: 'Maison', description: 'Mobilier et électroménager', path: 'Maison' },
  ]);

  // --- Sous-catégories ---
  await db.insert(schema.categories).values([
    { id: 'SUB-TEL', name: 'Téléphones', parentId: 'CAT-ELEC', path: 'Électronique > Téléphones' },
    { id: 'SUB-ORD', name: 'Ordinateurs', parentId: 'CAT-ELEC', path: 'Électronique > Ordinateurs' },
    { id: 'SUB-TV', name: 'TV & Audio', parentId: 'CAT-ELEC', path: 'Électronique > TV & Audio' },
    { id: 'SUB-BOIS', name: 'Boissons', parentId: 'CAT-ALIM', path: 'Alimentation > Boissons' },
    { id: 'SUB-EPI', name: 'Épicerie', parentId: 'CAT-ALIM', path: 'Alimentation > Épicerie' },
    { id: 'SUB-MEUB', name: 'Meubles', parentId: 'CAT-MAISON', path: 'Maison > Meubles' },
    { id: 'SUB-ELM', name: 'Électroménager', parentId: 'CAT-MAISON', path: 'Maison > Électroménager' },
  ]);

  // --- Marques ---
  await db.insert(schema.brands).values([
    { id: 'BRD-SAMSUNG', name: 'Samsung' },
    { id: 'BRD-APPLE', name: 'Apple' },
    { id: 'BRD-LG', name: 'LG' },
    { id: 'BRD-SONY', name: 'Sony' },
    { id: 'BRD-HP', name: 'HP' },
    { id: 'BRD-NESTLE', name: 'Nestlé' },
  ]);

  // --- Entrepôts ---
  await db.insert(schema.warehouses).values([
    { id: 'WH-TNR', name: 'Entrepôt Central Tana', code: 'WH-TNR-01', location: 'Antananarivo', capacity: 10000, status: 'active' },
    { id: 'WH-TOA', name: 'Dépôt Toamasina', code: 'WH-TOA-01', location: 'Toamasina', capacity: 5000, status: 'active' },
  ]);

  // --- Fournisseurs ---
  await db.insert(schema.suppliers).values([
    { id: 'SUP-1', name: 'Tana Import', companyName: 'Tana Import SARL', email: 'ventes@tanaimport.mg', phone: '+261 20 22 333 44', address: 'Ankorondrano, Antananarivo', vatNumber: 'MG-IMP-001', contactPerson: 'Rija R.', status: 'active' },
    { id: 'SUP-2', name: 'Océan Indien Distribution', companyName: 'OID', email: 'contact@oid.mg', phone: '+261 20 53 111 22', address: 'Toamasina', vatNumber: 'MG-OID-002', contactPerson: 'Naina B.', status: 'active' },
    { id: 'SUP-3', name: 'AgroMada', companyName: 'AgroMada SA', email: 'pro@agromada.mg', phone: '+261 34 05 678 90', address: 'Antsirabe', vatNumber: 'MG-AGR-003', contactPerson: 'Fara H.', status: 'active' },
  ]);

  // --- Clients ---
  await db.insert(schema.clients).values([
    { id: 'CLI-1', name: 'Boutique Rakoto', email: 'rakoto@boutique.mg', phone: '+261 34 11 111 11', address: 'Analakely, Antananarivo', taxNumber: 'MG-CLI-1', balance: 2952000, loyaltyPoints: 120, status: 'active' },
    { id: 'CLI-2', name: 'Hôtel Colbert', email: 'achats@colbert.mg', phone: '+261 20 22 202 02', address: 'Antaninarenina, Antananarivo', taxNumber: 'MG-CLI-2', balance: 0, loyaltyPoints: 340, status: 'active' },
    { id: 'CLI-3', name: 'Épicerie Fianar', email: 'epicerie@fianar.mg', phone: '+261 34 33 333 33', address: 'Fianarantsoa', taxNumber: 'MG-CLI-3', balance: 0, loyaltyPoints: 45, status: 'active' },
    { id: 'CLI-4', name: 'Client de Passage', email: 'passage@vokatra.mg', phone: '', address: '', balance: 0, loyaltyPoints: 0, status: 'active' },
  ]);

  // --- Produits (prix en Ariary) ---
  const nextYear = '2027-06-30';
  const P = (o: any) => ({
    ...o,
    status: status(o.quantity, o.minStock, o.expirationDate),
  });
  const products = [
    P({ id: 'PRD-1', sku: 'TEL-SAM-A54', barcode: '8806094901234', name: 'Samsung Galaxy A54 5G', categoryId: 'CAT-ELEC', categoryName: 'Électronique', subCategoryId: 'SUB-TEL', subCategoryName: 'Téléphones', brandId: 'BRD-SAMSUNG', brandName: 'Samsung', purchasePrice: 900000, salePrice: 1250000, vatRate: 20, unit: 'Unités', minStock: 5, maxStock: 60, quantity: 25, supplierId: 'SUP-1', supplierName: 'Tana Import', locationId: 'WH-TNR' }),
    P({ id: 'PRD-2', sku: 'TEL-APP-I15', barcode: '1949012345678', name: 'iPhone 15 128 Go', categoryId: 'CAT-ELEC', categoryName: 'Électronique', subCategoryId: 'SUB-TEL', subCategoryName: 'Téléphones', brandId: 'BRD-APPLE', brandName: 'Apple', purchasePrice: 3200000, salePrice: 4200000, vatRate: 20, unit: 'Unités', minStock: 3, maxStock: 30, quantity: 8, supplierId: 'SUP-1', supplierName: 'Tana Import', locationId: 'WH-TNR' }),
    P({ id: 'PRD-3', sku: 'ORD-HP-15', barcode: '1954901234500', name: 'HP Laptop 15s (i5/8Go)', categoryId: 'CAT-ELEC', categoryName: 'Électronique', subCategoryId: 'SUB-ORD', subCategoryName: 'Ordinateurs', brandId: 'BRD-HP', brandName: 'HP', purchasePrice: 1800000, salePrice: 2400000, vatRate: 20, unit: 'Unités', minStock: 4, maxStock: 40, quantity: 12, supplierId: 'SUP-1', supplierName: 'Tana Import', locationId: 'WH-TNR' }),
    P({ id: 'PRD-4', sku: 'ORD-APP-MBA', barcode: '1944901234599', name: 'MacBook Air M2', categoryId: 'CAT-ELEC', categoryName: 'Électronique', subCategoryId: 'SUB-ORD', subCategoryName: 'Ordinateurs', brandId: 'BRD-APPLE', brandName: 'Apple', purchasePrice: 5000000, salePrice: 6500000, vatRate: 20, unit: 'Unités', minStock: 2, maxStock: 15, quantity: 4, supplierId: 'SUP-1', supplierName: 'Tana Import', locationId: 'WH-TNR' }),
    P({ id: 'PRD-5', sku: 'TV-LG-43', barcode: '8806091112223', name: 'LG TV LED 43"', categoryId: 'CAT-ELEC', categoryName: 'Électronique', subCategoryId: 'SUB-TV', subCategoryName: 'TV & Audio', brandId: 'BRD-LG', brandName: 'LG', purchasePrice: 700000, salePrice: 950000, vatRate: 20, unit: 'Unités', minStock: 5, maxStock: 40, quantity: 15, supplierId: 'SUP-2', supplierName: 'Océan Indien Distribution', locationId: 'WH-TOA' }),
    P({ id: 'PRD-6', sku: 'AUD-SNY-WH1', barcode: '4548736112223', name: 'Sony Casque WH-1000XM4', categoryId: 'CAT-ELEC', categoryName: 'Électronique', subCategoryId: 'SUB-TV', subCategoryName: 'TV & Audio', brandId: 'BRD-SONY', brandName: 'Sony', purchasePrice: 600000, salePrice: 850000, vatRate: 20, unit: 'Unités', minStock: 5, maxStock: 30, quantity: 3, supplierId: 'SUP-2', supplierName: 'Océan Indien Distribution', locationId: 'WH-TOA' }),
    P({ id: 'PRD-7', sku: 'BOIS-EAU-15', barcode: '6001234567001', name: 'Eau minérale 1,5L (pack de 6)', categoryId: 'CAT-ALIM', categoryName: 'Alimentation', subCategoryId: 'SUB-BOIS', subCategoryName: 'Boissons', purchasePrice: 9000, salePrice: 15000, vatRate: 20, unit: 'Packs', minStock: 30, maxStock: 400, quantity: 200, supplierId: 'SUP-3', supplierName: 'AgroMada', locationId: 'WH-TNR' }),
    P({ id: 'PRD-8', sku: 'BOIS-COLA-1', barcode: '5449000000996', name: 'Coca-Cola 1L (pack de 6)', categoryId: 'CAT-ALIM', categoryName: 'Alimentation', subCategoryId: 'SUB-BOIS', subCategoryName: 'Boissons', purchasePrice: 12000, salePrice: 20000, vatRate: 20, unit: 'Packs', minStock: 30, maxStock: 300, quantity: 150, supplierId: 'SUP-3', supplierName: 'AgroMada', locationId: 'WH-TNR' }),
    P({ id: 'PRD-9', sku: 'EPI-NES-200', barcode: '7613035010001', name: 'Café Nescafé Classic 200g', categoryId: 'CAT-ALIM', categoryName: 'Alimentation', subCategoryId: 'SUB-EPI', subCategoryName: 'Épicerie', brandId: 'BRD-NESTLE', brandName: 'Nestlé', purchasePrice: 18000, salePrice: 30000, vatRate: 20, unit: 'Pots', minStock: 20, maxStock: 200, quantity: 80, expirationDate: nextYear, lotNumber: 'LOT-NES-2026A', supplierId: 'SUP-3', supplierName: 'AgroMada', locationId: 'WH-TNR' }),
    P({ id: 'PRD-10', sku: 'EPI-RIZ-25', barcode: '6001234567010', name: 'Riz Makalioka 25 kg', categoryId: 'CAT-ALIM', categoryName: 'Alimentation', subCategoryId: 'SUB-EPI', subCategoryName: 'Épicerie', purchasePrice: 90000, salePrice: 120000, vatRate: 20, unit: 'Sacs', minStock: 15, maxStock: 150, quantity: 60, supplierId: 'SUP-3', supplierName: 'AgroMada', locationId: 'WH-TOA' }),
    P({ id: 'PRD-11', sku: 'ELM-LG-FRIGO', barcode: '8806091998877', name: 'Réfrigérateur LG 200L', categoryId: 'CAT-MAISON', categoryName: 'Maison', subCategoryId: 'SUB-ELM', subCategoryName: 'Électroménager', brandId: 'BRD-LG', brandName: 'LG', purchasePrice: 1500000, salePrice: 2100000, vatRate: 20, unit: 'Unités', minStock: 3, maxStock: 20, quantity: 0, supplierId: 'SUP-2', supplierName: 'Océan Indien Distribution', locationId: 'WH-TNR' }),
    P({ id: 'PRD-12', sku: 'MEUB-CANAPE-3', barcode: '6001234567020', name: 'Canapé 3 places tissu', categoryId: 'CAT-MAISON', categoryName: 'Maison', subCategoryId: 'SUB-MEUB', subCategoryName: 'Meubles', purchasePrice: 800000, salePrice: 1200000, vatRate: 20, unit: 'Unités', minStock: 2, maxStock: 15, quantity: 6, supplierId: 'SUP-2', supplierName: 'Océan Indien Distribution', locationId: 'WH-TNR' }),
  ];
  // Rend les codes-barres de démo valides (clé de contrôle EAN-13 recalculée → scannables).
  products.forEach((p: any) => {
    if (typeof p.barcode === 'string' && /^\d{13}$/.test(p.barcode)) {
      p.barcode = p.barcode.slice(0, 12) + ean13Checksum(p.barcode.slice(0, 12));
    }
  });
  await db.insert(schema.products).values(products);

  // --- Catalogue d'approvisionnement (fournisseur ↔ produit, prix négocié) ---
  // Chaque produit est fourni par son fournisseur principal (prix = prix d'achat de la fiche).
  const supplierProductRows: any[] = products
    .filter((p: any) => p.supplierId)
    .map((p: any) => ({
      id: `SPR-${p.id}`,
      supplierId: p.supplierId,
      productId: p.id,
      purchasePrice: p.purchasePrice,
    }));
  // Quelques produits sont aussi disponibles chez un second fournisseur (prix différent)
  // pour illustrer l'appro multi-fournisseurs.
  supplierProductRows.push(
    { id: 'SPR-ALT-1', supplierId: 'SUP-2', productId: 'PRD-1', purchasePrice: 920000 }, // Galaxy A54 aussi via Océan Indien
    { id: 'SPR-ALT-2', supplierId: 'SUP-1', productId: 'PRD-5', purchasePrice: 715000 }, // TV LG aussi via Tana Import
  );
  await db.insert(schema.supplierProducts).values(supplierProductRows);

  // Date ISO à n jours dans le passé (utilisée pour dater mouvements, ventes, etc.).
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  // --- Mouvements d'entrée initiale (pour les produits en stock) ---
  const movements = products
    .filter((p) => p.quantity > 0)
    .map((p, i) => ({
      id: `MVT-INIT-${p.id}`,
      type: 'entry_reception',
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      warehouseId: p.locationId,
      warehouseName: p.locationId === 'WH-TNR' ? 'Entrepôt Central Tana' : 'Dépôt Toamasina',
      quantity: p.quantity,
      reason: 'Stock initial (données de démonstration)',
      performedBy: 'Système',
      referenceId: 'SEED',
      costPrice: p.purchasePrice,
      costTotal: p.purchasePrice * p.quantity,
      // Réceptions échelonnées ~40–51 j en arrière (hors fenêtre 7 j du graphique,
      // pour ne pas écraser l'activité récente des ventes).
      createdAt: daysAgo(40 + i),
    }));
  await db.insert(schema.stockMovements).values(movements);

  // --- Ventes de démonstration (historique POS) ---
  const sale1Items = [
    { productId: 'PRD-1', productName: 'Samsung Galaxy A54 5G', sku: 'TEL-SAM-A54', quantity: 1, unitPrice: 1250000, discount: 0, tax: 20, total: 1250000 },
    { productId: 'PRD-7', productName: 'Eau minérale 1,5L (pack de 6)', sku: 'BOIS-EAU-15', quantity: 5, unitPrice: 15000, discount: 0, tax: 20, total: 75000 },
  ];
  const sale2Items = [
    { productId: 'PRD-5', productName: 'LG TV LED 43"', sku: 'TV-LG-43', quantity: 2, unitPrice: 950000, discount: 0, tax: 20, total: 1900000 },
  ];
  await db.insert(schema.sales).values([
    { id: 'SALE-DEMO-1', invoiceNumber: 'FAC-000010', type: 'invoice', clientId: 'CLI-1', clientName: 'Boutique Rakoto', status: 'delivered', items: sale1Items, vatAmount: 265000, totalAmount: 1590000, paymentStatus: 'paid', paidAmount: 1590000, paymentMethod: 'cash', loyaltyPointsEarned: 159, cashierId: 'SEED', cashierName: 'Système', warehouseId: 'WH-TNR', warehouseName: 'Entrepôt Central Tana' },
    { id: 'SALE-DEMO-2', invoiceNumber: 'FAC-000011', type: 'invoice', clientId: 'CLI-2', clientName: 'Hôtel Colbert', status: 'delivered', items: sale2Items, vatAmount: 380000, totalAmount: 2280000, paymentStatus: 'paid', paidAmount: 2280000, paymentMethod: 'bank_transfer', loyaltyPointsEarned: 228, cashierId: 'SEED', cashierName: 'Système', warehouseId: 'WH-TOA', warehouseName: 'Dépôt Toamasina' },
  ]);

  // --- Ventes datées (pour tester les périodes 7 / 30 / 90 jours du tableau de bord) ---
  const findP = (id: string) => products.find((p) => p.id === id)!;
  const li = (id: string, qty: number) => {
    const p = findP(id);
    return { productId: p.id, productName: p.name, sku: p.sku, quantity: qty, unitPrice: p.salePrice, discount: 0, tax: 20, total: qty * p.salePrice };
  };
  const mkSale = (id: string, invoiceNumber: string, createdAt: string, clientId: string, clientName: string, items: any[], paymentMethod: string = 'cash', paidRatio = 1) => {
    const goods = items.reduce((a, it) => a + it.total, 0);
    const vat = Math.round(goods * 0.2);
    const total = goods + vat;
    const paidAmount = Math.round(total * paidRatio);
    const paymentStatus = paidAmount >= total ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'unpaid';
    return {
      id, invoiceNumber, type: 'invoice', clientId, clientName, status: 'delivered', items,
      vatAmount: vat, totalAmount: total, paymentStatus, paidAmount, paymentMethod,
      loyaltyPointsEarned: Math.floor(total / 10),
      cashierId: 'SEED', cashierName: 'Système', warehouseId: 'WH-TNR', warehouseName: 'Entrepôt Central Tana',
      createdAt,
    };
  };
  // Numéros de facture attribués dans l'ordre chronologique (la plus ancienne = FAC-000001).
  const datedSales = [
    // ≤ 7 jours
    mkSale('SALE-D01', 'FAC-000009', daysAgo(2), 'CLI-1', 'Boutique Rakoto', [li('PRD-2', 1)], 'card', 0.5), // avance 50 %
    mkSale('SALE-D02', 'FAC-000008', daysAgo(4), 'CLI-3', 'Épicerie Fianar', [li('PRD-7', 10), li('PRD-8', 5)]),
    mkSale('SALE-D03', 'FAC-000007', daysAgo(6), 'CLI-2', 'Hôtel Colbert', [li('PRD-6', 2)], 'mobile_money'),
    // 8 – 30 jours
    mkSale('SALE-D04', 'FAC-000006', daysAgo(12), 'CLI-1', 'Boutique Rakoto', [li('PRD-10', 3)], 'cash', 0), // à crédit (non payé)
    mkSale('SALE-D05', 'FAC-000005', daysAgo(20), 'CLI-4', 'Client de Passage', [li('PRD-5', 1)]),
    mkSale('SALE-D06', 'FAC-000004', daysAgo(28), 'CLI-2', 'Hôtel Colbert', [li('PRD-4', 1)], 'bank_transfer'),
    // 31 – 90 jours
    mkSale('SALE-D07', 'FAC-000003', daysAgo(50), 'CLI-3', 'Épicerie Fianar', [li('PRD-12', 2)]),
    mkSale('SALE-D08', 'FAC-000002', daysAgo(80), 'CLI-1', 'Boutique Rakoto', [li('PRD-3', 1)]),
    // > 90 jours (doit être EXCLU des classements)
    mkSale('SALE-D09', 'FAC-000001', daysAgo(120), 'CLI-2', 'Hôtel Colbert', [li('PRD-2', 2)]),
  ];
  // Échéances de paiement sur les ventes à crédit (reste dû) → apparaissent au calendrier.
  datedSales.forEach((s: any) => {
    const reste = s.totalAmount - s.paidAmount;
    if (reste <= 0.5) return;
    if (s.id === 'SALE-D01') s.dueDate = daysAgo(-5); // échéance proche (ce mois)
    else if (s.id === 'SALE-D04') s.dueDate = daysAgo(-20); // échéance plus lointaine
    else s.dueDate = daysAgo(-15);
  });
  await db.insert(schema.sales).values(datedSales);
  // Compteur de facturation aligné sur le dernier numéro utilisé (FAC-000010/11 = ventes du jour ; prochaine = FAC-000012).
  await db.insert(schema.documentCounters).values({ key: 'invoice', value: 11 });

  // --- Mouvements de sortie (ventes) : un exit_sale par ligne de vente, daté à la vente ---
  // Alimente l'Historique des Flux et le graphique « Activité de stock » (entrées vs sorties).
  const exitMovements: any[] = [];
  const pushExits = (saleId: string, items: any[], createdAt: string) => {
    items.forEach((it, idx) => {
      const p = findP(it.productId);
      exitMovements.push({
        id: `MVT-EXIT-${saleId}-${idx}`,
        type: 'exit_sale',
        productId: it.productId,
        productName: it.productName || p.name,
        sku: it.sku || p.sku,
        warehouseId: p.locationId,
        warehouseName: p.locationId === 'WH-TNR' ? 'Entrepôt Central Tana' : 'Dépôt Toamasina',
        quantity: it.quantity,
        reason: `Vente ${saleId}`,
        performedBy: 'Système',
        referenceId: saleId,
        costPrice: p.purchasePrice,
        costTotal: p.purchasePrice * it.quantity,
        createdAt,
      });
    });
  };
  pushExits('SALE-DEMO-1', sale1Items, daysAgo(0));
  pushExits('SALE-DEMO-2', sale2Items, daysAgo(0));
  datedSales.forEach((s) => pushExits(s.id, s.items, s.createdAt));
  await db.insert(schema.stockMovements).values(exitMovements);

  // --- Avoir de démonstration : retour partiel de 2 articles sur FAC-000008 ---
  const cnP = findP('PRD-7');
  const cnQty = 2;
  const cnGoods = cnQty * cnP.salePrice;
  const cnVat = Math.round(cnGoods * 0.2);
  const cnTotal = cnGoods + cnVat;
  await db.insert(schema.sales).values({
    id: 'CN-DEMO-1', invoiceNumber: 'AV-000001', type: 'return', relatedSaleId: 'SALE-D02',
    clientId: 'CLI-3', clientName: 'Épicerie Fianar', status: 'returned',
    items: [{ productId: cnP.id, productName: cnP.name, sku: cnP.sku, quantity: -cnQty, unitPrice: cnP.salePrice, discount: 0, tax: 20, total: -cnGoods }],
    vatAmount: -cnVat, totalAmount: -cnTotal, paymentStatus: 'paid', paymentMethod: 'cash',
    paidAmount: -cnTotal, loyaltyPointsEarned: 0,
    notes: 'Avoir sur FAC-000008 — Retour marchandise (2 articles défectueux)',
    cashierId: 'SEED', cashierName: 'Système', warehouseId: 'WH-TNR', warehouseName: 'Entrepôt Central Tana',
    createdAt: daysAgo(3),
  });
  await db.insert(schema.documentCounters).values({ key: 'credit_note', value: 1 });
  await db.insert(schema.stockMovements).values({
    id: 'MVT-CN-1', type: 'entry_return', productId: cnP.id, productName: cnP.name, sku: cnP.sku,
    warehouseId: cnP.locationId ?? null, quantity: cnQty,
    reason: 'Avoir AV-000001 (facture FAC-000008)', performedBy: 'Système', referenceId: 'CN-DEMO-1',
    costPrice: cnP.purchasePrice, costTotal: cnP.purchasePrice * cnQty, createdAt: daysAgo(3),
  });
  await db.insert(schema.payments).values({
    id: 'PAY-CN-1', kind: 'credit_note', refId: 'SALE-D02', partyId: 'CLI-3', partyName: 'Épicerie Fianar',
    amount: -cnTotal, method: null, note: 'Avoir AV-000001 — Retour marchandise', createdBy: 'Système', createdAt: daysAgo(3),
  });

  // --- Livraisons de démonstration (types + tarifs variés, statuts variés) ---
  await db.insert(schema.deliveries).values([
    { id: 'DLV-DEMO-1', saleId: 'SALE-DEMO-1', clientId: 'CLI-1', clientName: 'Boutique Rakoto', address: 'Analakely, Antananarivo', type: 'moto', fee: 5000, status: 'delivered', driverName: 'Hery R.', scheduledDate: '2026-07-18', notes: 'Facture SALE-DEMO-1', createdBy: 'Système' },
    { id: 'DLV-DEMO-2', saleId: 'SALE-DEMO-2', clientId: 'CLI-2', clientName: 'Hôtel Colbert', address: 'Antaninarenina, Antananarivo', type: 'camion', fee: 50000, status: 'in_transit', driverName: 'Tojo A.', scheduledDate: '2026-07-21', notes: 'Facture SALE-DEMO-2 — 2 téléviseurs', createdBy: 'Système' },
    { id: 'DLV-DEMO-3', clientId: 'CLI-3', clientName: 'Épicerie Fianar', address: 'Fianarantsoa', type: 'voiture', fee: 15000, status: 'pending', scheduledDate: '2026-07-23', notes: 'Commande à préparer', createdBy: 'Système' },
    { id: 'DLV-DEMO-4', clientId: 'CLI-1', clientName: 'Boutique Rakoto', address: 'Analakely, Antananarivo', type: 'velo', fee: 3000, status: 'cancelled', driverName: 'Naina B.', notes: 'Annulée — client absent', createdBy: 'Système' },
  ]);

  // --- Historique de règlements clients (avances) ---
  await db.insert(schema.payments).values([
    { id: 'PAY-DEMO-1', kind: 'sale', refId: 'SALE-D01', partyId: 'CLI-1', partyName: 'Boutique Rakoto', amount: 2520000, method: 'card', note: 'Avance 50 % à la commande', createdBy: 'Système', createdAt: daysAgo(2) },
  ]);

  // --- Achats fournisseurs de démonstration (statuts + paiements variés) ---
  await db.insert(schema.purchases).values([
    {
      id: 'ACH-DEMO-1', type: 'reception', supplierId: 'SUP-1', supplierName: 'Tana Import', status: 'received',
      items: [{ productId: 'PRD-3', productName: 'HP Laptop 15s (i5/8Go)', sku: 'ORD-HP-15', quantity: 10, unitCost: 1800000, tax: 20, total: 18000000 }],
      vatAmount: 3600000, discountAmount: 0, totalAmount: 21600000, paymentStatus: 'paid', paidAmount: 21600000,
      receivedAt: daysAgo(15), notes: 'Facture FRN-2026-045', createdBy: 'Système',
    },
    {
      id: 'ACH-DEMO-2', type: 'order', supplierId: 'SUP-3', supplierName: 'AgroMada', status: 'ordered',
      items: [
        { productId: 'PRD-7', productName: 'Eau minérale 1,5L (pack de 6)', sku: 'BOIS-EAU-15', quantity: 50, unitCost: 9000, tax: 20, total: 450000 },
        { productId: 'PRD-8', productName: 'Coca-Cola 1L (pack de 6)', sku: 'BOIS-COLA-1', quantity: 30, unitCost: 12000, tax: 20, total: 360000 },
      ],
      vatAmount: 162000, discountAmount: 0, totalAmount: 972000, paymentStatus: 'unpaid', paidAmount: 0,
      expectedDate: daysAgo(-5), notes: 'En attente de livraison', createdBy: 'Système',
    },
    {
      id: 'ACH-DEMO-3', type: 'order', supplierId: 'SUP-2', supplierName: 'Océan Indien Distribution', status: 'ordered',
      items: [
        { productId: 'PRD-5', productName: 'LG TV LED 43"', sku: 'TV-LG-43', quantity: 8, unitCost: 700000, tax: 20, total: 5600000 },
        // Frigo déjà commandé → apparaîtra « EN COURS » dans le Réapprovisionnement.
        { productId: 'PRD-11', productName: 'Réfrigérateur LG 200L', sku: 'ELM-LG-FRIGO', quantity: 10, unitCost: 1500000, tax: 20, total: 15000000 },
      ],
      vatAmount: 4120000, discountAmount: 0, totalAmount: 24720000, paymentStatus: 'partially_paid', paidAmount: 3000000,
      expectedDate: daysAgo(-12), notes: 'Acompte versé', createdBy: 'Système',
    },
  ]);

  // --- Dépenses diverses de démonstration ---
  await db.insert(schema.expenses).values([
    { id: 'DEP-DEMO-1', label: 'Transport conteneur port Toamasina', category: 'transport', amount: 850000, supplierId: 'SUP-1', supplierName: 'Tana Import', purchaseId: 'ACH-DEMO-1', paymentStatus: 'paid', date: daysAgo(15), createdBy: 'Système' },
    { id: 'DEP-DEMO-2', label: 'Droits de douane import électronique', category: 'douane', amount: 1200000, supplierId: 'SUP-1', supplierName: 'Tana Import', purchaseId: 'ACH-DEMO-1', paymentStatus: 'paid', date: daysAgo(16), createdBy: 'Système' },
    { id: 'DEP-DEMO-3', label: 'Carburant tournée Antsirabe', category: 'carburant', amount: 120000, paymentStatus: 'unpaid', date: daysAgo(3), createdBy: 'Système' },
    { id: 'DEP-DEMO-4', label: 'Manutention entrepôt central', category: 'manutention', amount: 200000, paymentStatus: 'paid', date: daysAgo(8), createdBy: 'Système' },
  ]);

  // --- Journal d'audit de démonstration (alimente l'« Historique des actions ») ---
  await db.insert(schema.auditLogs).values([
    { id: 'LOG-SEED-1', userName: 'Système', action: 'Initialisation des données de démonstration', module: 'Système', createdAt: daysAgo(6) },
    { id: 'LOG-SEED-2', userName: 'Salathis Admin', action: 'Réception valorisée de la commande ACH-DEMO-1 (Tana Import)', module: 'Achats', entityId: 'ACH-DEMO-1', createdAt: daysAgo(15) },
    { id: 'LOG-SEED-3', userName: 'Salathis Admin', action: 'Vente POS encaissée (FAC-000008, total 4 320 000)', module: 'Ventes', entityId: 'SALE-D02', createdAt: daysAgo(4) },
    { id: 'LOG-SEED-4', userName: 'Salathis Admin', action: 'Avoir AV-000001 émis sur facture FAC-000008 (montant 36 000)', module: 'Avoirs', entityId: 'CN-DEMO-1', createdAt: daysAgo(3) },
    { id: 'LOG-SEED-5', userName: 'Salathis Admin', action: 'Commande d\'achat créée pour Océan Indien Distribution', module: 'Achats', entityId: 'ACH-DEMO-3', createdAt: daysAgo(2) },
    { id: 'LOG-SEED-6', userName: 'Salathis Admin', action: 'Règlement client enregistré (FAC-000009) — partiel', module: 'Règlements', entityId: 'SALE-D01', createdAt: daysAgo(2) },
    { id: 'LOG-SEED-7', userName: 'Salathis Admin', action: 'Mise à jour des réglages de l\'entreprise', module: 'Paramètres', entityId: 'global', createdAt: daysAgo(1) },
  ]);

  console.log('✅ Données de démonstration insérées :');
  console.log('   3 catégories + 7 sous-catégories, 6 marques, 2 entrepôts');
  console.log('   3 fournisseurs, 4 clients, 12 produits, ' + (movements.length + 1 + exitMovements.length) + ' mouvements (' + movements.length + ' entrées, ' + exitMovements.length + ' sorties ventes, 1 retour d\'avoir)');
  console.log('   11 ventes (2 du jour + 9 datées sur 2→120 jours) + 1 avoir AV-000001 (retour sur FAC-000008), 4 livraisons, 3 achats, 4 dépenses');
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Échec du seed :', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
