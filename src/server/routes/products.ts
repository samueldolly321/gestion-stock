import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { products, productStock } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, computeProductStatus, writeAuditLog } from '../helpers.ts';
import { setWarehouseStock, resolveWarehouseId, recomputeProductTotal } from '../stock.ts';

export const productsRouter = Router();

const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager', 'Magasinier'];

// Champs autorisés à l'écriture (évite l'injection de champs fantômes).
function pickProductFields(body: any) {
  return {
    sku: body.sku,
    barcode: body.barcode ?? null,
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
    packSize: Math.max(1, Math.floor(Number(body.packSize) || 1)),
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
