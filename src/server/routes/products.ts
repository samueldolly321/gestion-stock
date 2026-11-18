import { Router } from 'express';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { products, productStock, stockMovements } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, computeProductStatus, writeAuditLog } from '../helpers.ts';
import { setWarehouseStock, resolveWarehouseId, recomputeProductTotal, adjustWarehouseStock } from '../stock.ts';
import { generateEan13 } from '../../services/barcode.ts';
import { cleanList, cellKey, skuPart, variantName } from '../../services/variants.ts';

export const productsRouter = Router();

const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager', 'Magasinier'];

// Champs autorisés à l'écriture (évite l'injection de champs fantômes).
function pickProductFields(body: any) {
  return {
    sku: body.sku,
    barcode: typeof body.barcode === 'string' && body.barcode.trim() ? body.barcode.trim() : null,
    qrCode: body.qrCode ?? null,
    name: body.name,
    description: body.description ?? null,
    categoryId: body.categoryId ?? null,
    categoryName: body.categoryName ?? null,
    subCategoryId: body.subCategoryId ?? null,
    subCategoryName: body.subCategoryName ?? null,
    brandId: body.brandId ?? null,
    brandName: body.brandName ?? null,
    purchasePrice: Number(body.purchasePrice) || 0,
    salePrice: Number(body.salePrice) || 0,
    vatRate: Number(body.vatRate) || 0,
    weight: body.weight != null ? Number(body.weight) : null,
    dimensions: body.dimensions ?? null,
    volume: body.volume != null ? Number(body.volume) : null,
    unit: body.unit || 'Unités',
    // Conditionnement (vente en gros). packSize ≥ 1 ; prix carton optionnels.
    packSize: Math.max(1, Math.round((Number(String(body.packSize ?? '').replace(',', '.')) || 1) * 1000) / 1000),
    packLabel: body.packLabel ?? null,
    packPurchasePrice: body.packPurchasePrice != null && body.packPurchasePrice !== '' ? Number(body.packPurchasePrice) : null,
    packSalePrice: body.packSalePrice != null && body.packSalePrice !== '' ? Number(body.packSalePrice) : null,
    minStock: Number(body.minStock) || 0,
    maxStock: Number(body.maxStock) || 0,
    image: body.image ?? null,
    expirationDate: body.expirationDate || null,
    lotNumber: body.lotNumber ?? null,
    serialNumber: body.serialNumber ?? null,
    supplierId: body.supplierId ?? null,
    supplierName: body.supplierName ?? null,
    locationId: body.locationId ?? null,
    quantity: Number(body.quantity) || 0,
  };
}

/** Article qui utilise déjà ce code-barres (hors `exceptId`), sinon null. */
async function barcodeOwner(barcode: string | null, exceptId?: string) {
  if (!barcode) return null;
  const where = exceptId ? and(eq(products.barcode, barcode), ne(products.id, exceptId)) : eq(products.barcode, barcode);
  const [row] = await db.select({ name: products.name, sku: products.sku }).from(products).where(where).limit(1);
  return row ?? null;
}
const barcodeTakenMessage = (code: string, owner: { name: string; sku: string }) =>
  `Le code-barres ${code} est déjà utilisé par « ${owner.name} » (${owner.sku}). Chaque article doit avoir son propre code.`;

// Champs communs à toutes les variantes d'un modèle (modifiables en une fois).
function pickModelFields(body: any) {
  const out: Record<string, unknown> = {};
  const text = ['description', 'categoryId', 'categoryName', 'subCategoryId', 'subCategoryName', 'brandId', 'brandName', 'supplierId', 'supplierName', 'image', 'unit'];
  for (const k of text) if (body[k] !== undefined) out[k] = body[k] === '' && k !== 'description' ? null : body[k];
  for (const k of ['purchasePrice', 'salePrice', 'vatRate', 'minStock', 'maxStock']) {
    if (body[k] !== undefined && body[k] !== '' && body[k] !== null) {
      const n = Number(body[k]);
      if (!Number.isFinite(n) || n < 0) throw new Error(`INVALID:${k}`);
      out[k] = n;
    }
  }
  return out;
}

/**
 * POST /api/products/variants — crée la grille taille × couleur d'un modèle (ou ajoute des
 * cases à un modèle existant via `variantGroup`). Une variante = un article complet :
 * SKU et code-barres propres, stock initial optionnel par case dans l'entrepôt choisi.
 * Body : { modelName, baseSku?, variantGroup?, sizes[], colors[], quantities?: {"M|Noir": 5},
 *          warehouseId?, + champs communs (prix, catégorie, marque, fournisseur, image…) }
 */
productsRouter.post('/variants', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  try {
    const sizes = cleanList(b.sizes);
    const colors = cleanList(b.colors);
    if (sizes.length === 0 && colors.length === 0) {
      return res.status(400).json({ error: 'Choisissez au moins une taille ou une couleur.' });
    }
    let common: Record<string, unknown>;
    try { common = pickModelFields(b); } catch { return res.status(400).json({ error: 'Prix ou seuils invalides.' }); }

    // Modèle existant (ajout de cases) ou nouveau modèle.
    let group: string = typeof b.variantGroup === 'string' && b.variantGroup ? b.variantGroup : '';
    let modelName = String(b.modelName || '').trim().replace(/\s+/g, ' ');
    let existing: (typeof products.$inferSelect)[] = [];
    if (group) {
      existing = await db.select().from(products).where(eq(products.variantGroup, group));
      if (existing.length === 0) return res.status(404).json({ error: 'Modèle introuvable.' });
      const ref = existing[0];
      modelName = ref.modelName || modelName;
      // Les nouvelles cases reprennent les champs communs du modèle.
      common = {
        description: ref.description, categoryId: ref.categoryId, categoryName: ref.categoryName,
        subCategoryId: ref.subCategoryId, subCategoryName: ref.subCategoryName, brandId: ref.brandId,
        brandName: ref.brandName, supplierId: ref.supplierId, supplierName: ref.supplierName, image: ref.image,
        unit: ref.unit, purchasePrice: ref.purchasePrice, salePrice: ref.salePrice, vatRate: ref.vatRate,
        minStock: ref.minStock, maxStock: ref.maxStock,
      };
    } else {
      group = generateId('MDL');
    }
    if (modelName.length < 2) return res.status(400).json({ error: 'Le nom du modèle est requis.' });

    const taken = new Set(existing.map((p) => cellKey(p.variantSize, p.variantColor)));
    const combos: { size: string | null; color: string | null }[] = [];
    for (const size of sizes.length ? sizes : [null]) {
      for (const color of colors.length ? colors : [null]) {
        if (!taken.has(cellKey(size, color))) combos.push({ size, color });
      }
    }
    if (combos.length === 0) return res.status(400).json({ error: 'Toutes ces tailles/couleurs existent déjà pour ce modèle.' });
    if (combos.length > 300) return res.status(400).json({ error: 'Trop de variantes en une fois (300 maximum).' });

    const baseSku = skuPart(String(b.baseSku || '')) || existing[0]?.sku.split('-')[0] || skuPart(modelName).slice(0, 6) || 'MDL';
    const quantities: Record<string, unknown> = b.quantities && typeof b.quantities === 'object' ? b.quantities : {};

    // Codes déjà utilisés (code-barres et SKU) — chaque variante a les siens.
    const all = await db.select({ barcode: products.barcode, sku: products.sku }).from(products);
    const usedBarcodes = new Set(all.map((p) => p.barcode).filter(Boolean) as string[]);
    const usedSkus = new Set(all.map((p) => p.sku.toUpperCase()));

    const created = await db.transaction(async (tx) => {
      const whId = await resolveWarehouseId(tx, b.warehouseId || null, ''); // '' : pas encore d'article → entrepôt choisi, sinon le premier
      const rows: (typeof products.$inferSelect)[] = [];
      for (const { size, color } of combos) {
        const skuBase = [baseSku, size && skuPart(size), color && skuPart(color)].filter(Boolean).join('-');
        let sku = skuBase;
        for (let i = 2; usedSkus.has(sku.toUpperCase()); i++) sku = `${skuBase}-${i}`;
        usedSkus.add(sku.toUpperCase());
        const barcode = generateEan13(usedBarcodes);
        usedBarcodes.add(barcode);
        const id = generateId('PRD');
        const [row] = await tx.insert(products).values({
          ...(common as any),
          id,
          sku,
          barcode,
          name: variantName(modelName, size, color),
          unit: (common.unit as string) || 'Pièces',
          quantity: 0,
          status: 'out_of_stock',
          locationId: whId ?? null,
          variantGroup: group,
          modelName,
          variantSize: size,
          variantColor: color,
        }).returning();

        const qty = Math.max(0, Math.floor(Number(quantities[cellKey(size, color)]) || 0));
        if (qty > 0 && whId) {
          await adjustWarehouseStock(tx, id, whId, qty);
          const cost = Number(common.purchasePrice) || 0;
          await tx.insert(stockMovements).values({
            id: generateId('MVT'),
            type: 'entry_reception',
            productId: id,
            productName: row.name,
            sku,
            warehouseId: whId,
            quantity: qty,
            reason: "Quantité d'entrée initiale",
            performedBy: req.user?.name ?? 'Système',
            referenceId: 'INITIAL',
            costPrice: cost,
            costTotal: cost * qty,
          });
        } else {
          await recomputeProductTotal(tx, id);
        }
        const [fresh] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
        rows.push(fresh);
      }
      return rows;
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `${existing.length ? 'Ajout de variantes' : 'Création modèle'} : ${modelName} (${created.length} variante${created.length > 1 ? 's' : ''})`,
      module: 'Articles',
      entityId: group,
    });
    res.status(201).json({ variantGroup: group, modelName, products: created });
  } catch (err) {
    console.error('create variants error:', err);
    res.status(500).json({ error: 'Erreur lors de la création des variantes.' });
  }
});

/**
 * PUT /api/products/variants/:group — modifie en une fois les champs communs de toutes
 * les variantes d'un modèle (nom du modèle, prix, catégorie, marque, image…).
 * Le stock, les SKU et les codes-barres de chaque variante ne sont pas touchés.
 */
productsRouter.put('/variants/:group', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  try {
    let common: Record<string, unknown>;
    try { common = pickModelFields(b); } catch { return res.status(400).json({ error: 'Prix ou seuils invalides.' }); }
    const variants = await db.select().from(products).where(eq(products.variantGroup, req.params.group));
    if (variants.length === 0) return res.status(404).json({ error: 'Modèle introuvable.' });
    const modelName = b.modelName !== undefined ? String(b.modelName).trim().replace(/\s+/g, ' ') : variants[0].modelName || '';
    if (modelName.length < 2) return res.status(400).json({ error: 'Le nom du modèle est requis.' });

    await db.transaction(async (tx) => {
      for (const v of variants) {
        await tx.update(products).set({
          ...(common as any),
          modelName,
          name: variantName(modelName, v.variantSize, v.variantColor),
          updatedAt: new Date().toISOString(),
        }).where(eq(products.id, v.id));
        await recomputeProductTotal(tx, v.id); // statut (le seuil mini a pu changer)
      }
    });
    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Modification modèle : ${modelName} (${variants.length} variantes)`,
      module: 'Articles',
      entityId: req.params.group,
    });
    res.json({ ok: true, count: variants.length });
  } catch (err) {
    console.error('update model error:', err);
    res.status(500).json({ error: 'Erreur lors de la modification du modèle.' });
  }
});

/** GET /api/products — liste tous les produits (plus récents d'abord). */
productsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const rows = await db.select().from(products).orderBy(desc(products.createdAt));
    res.json(rows);
  } catch (err) {
    console.error('list products error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des produits.' });
  }
});

/** POST /api/products — crée un produit. */
productsRouter.post('/', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const f = pickProductFields(req.body ?? {});
    if (!f.name || !f.sku) {
      return res.status(400).json({ error: 'Le nom et le SKU sont requis.' });
    }
    if (f.purchasePrice < 0 || f.salePrice < 0) {
      return res.status(400).json({ error: 'Les prix ne peuvent pas être négatifs.' });
    }
    const owner = await barcodeOwner(f.barcode);
    if (owner) return res.status(409).json({ error: barcodeTakenMessage(f.barcode!, owner) });

    const id = generateId('PRD');
    const status = computeProductStatus(f.quantity, f.minStock, f.expirationDate);
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(products).values({ id, ...f, status }).returning();
      // Alimente le stock par entrepôt : la quantité initiale entre dans la localisation choisie.
      const whId = await resolveWarehouseId(tx, f.locationId, id);
      if (whId) await setWarehouseStock(tx, id, whId, f.quantity);
      return row;
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Création produit : ${created.name} (${created.sku})`,
      module: 'Articles',
      entityId: id,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('create product error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du produit.' });
  }
});

/** PUT /api/products/:id — met à jour un produit. */
productsRouter.put('/:id', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const f = pickProductFields(req.body ?? {});
    if (!f.name || !f.sku) {
      return res.status(400).json({ error: 'Le nom et le SKU sont requis.' });
    }
    const owner = await barcodeOwner(f.barcode, req.params.id);
    if (owner) return res.status(409).json({ error: barcodeTakenMessage(f.barcode!, owner) });
    // Le stock est dérivé des entrepôts : on ne l'écrase pas directement ici.
    const { quantity: submittedQty, ...rest } = f;
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(products)
        .set({ ...rest, updatedAt: new Date().toISOString() })
        .where(eq(products.id, req.params.id))
        .returning();
      if (!row) return null;

      // Ajustement de stock à l'édition : autorisé seulement si le produit tient dans UN
      // seul entrepôt (sinon la répartition est ambiguë → passer par ajustement/transfert).
      const stockRows = await tx.select().from(productStock).where(eq(productStock.productId, row.id));
      const currentTotal = stockRows.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
      if (Math.abs(submittedQty - currentTotal) > 0.0001 && stockRows.length <= 1) {
        const whId = stockRows[0]?.warehouseId ?? await resolveWarehouseId(tx, rest.locationId, row.id);
        if (whId) await setWarehouseStock(tx, row.id, whId, submittedQty);
        else await recomputeProductTotal(tx, row.id);
      } else {
        // Recale le total + le statut (minStock/péremption ont pu changer).
        await recomputeProductTotal(tx, row.id);
      }
      const [fresh] = await tx.select().from(products).where(eq(products.id, row.id)).limit(1);
      return fresh;
    });
    if (!updated) return res.status(404).json({ error: 'Produit introuvable.' });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Modification produit : ${updated.name} (${updated.sku})`,
      module: 'Articles',
      entityId: updated.id,
    });

    res.json(updated);
  } catch (err) {
    console.error('update product error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du produit.' });
  }
});

/** DELETE /api/products/:id */
productsRouter.delete('/:id', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const [deleted] = await db.delete(products).where(eq(products.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Produit introuvable.' });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Suppression produit : ${deleted.name} (${deleted.sku})`,
      module: 'Articles',
      entityId: deleted.id,
    });

    res.json({ ok: true });
  } catch (err) {
    // 23503 = violation de clé étrangère (produit référencé par des mouvements)
    if ((err as any)?.cause?.code === '23503') {
      return res.status(409).json({ error: 'Ce produit a des mouvements de stock et ne peut pas être supprimé.' });
    }
    console.error('delete product error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du produit.' });
  }
});
