import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { supplierProducts, products, suppliers } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';

export const supplierProductsRouter = Router();

// Sélection enrichie : la ligne d'association + les infos produit pour l'affichage.
function selectEnriched() {
  return db
    .select({
      id: supplierProducts.id,
      supplierId: supplierProducts.supplierId,
      productId: supplierProducts.productId,
      purchasePrice: supplierProducts.purchasePrice,
      supplierRef: supplierProducts.supplierRef,
      createdAt: supplierProducts.createdAt,
      updatedAt: supplierProducts.updatedAt,
      productName: products.name,
      sku: products.sku,
      salePrice: products.salePrice,
      vatRate: products.vatRate,
      unit: products.unit,
      quantity: products.quantity,
      supplierName: suppliers.name,
    })
    .from(supplierProducts)
    .leftJoin(products, eq(products.id, supplierProducts.productId))
    .leftJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId));
}

/**
 * GET /api/supplier-products?supplierId=... — catalogue d'approvisionnement.
 * Sans filtre : toutes les associations (chargées globalement par le front).
 */
supplierProductsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined;
    const rows = supplierId
      ? await selectEnriched().where(eq(supplierProducts.supplierId, supplierId)).orderBy(desc(supplierProducts.createdAt))
      : await selectEnriched().orderBy(desc(supplierProducts.createdAt));
    res.json(rows);
  } catch (err) {
    console.error('list supplier-products error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement du catalogue fournisseur.' });
  }
});

/**
 * POST /api/supplier-products — associe un produit à un fournisseur (avec son prix).
 * Idempotent : si l'association existe déjà, on met à jour le prix / la référence.
 */
supplierProductsRouter.post('/', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const b = req.body ?? {};
    if (!b.supplierId || !b.productId) {
      return res.status(400).json({ error: 'Fournisseur et produit requis.' });
    }
    const purchasePrice = Number(b.purchasePrice) || 0;
    const supplierRef = b.supplierRef ?? null;

    const [row] = await db
      .insert(supplierProducts)
      .values({ id: generateId('SPR'), supplierId: b.supplierId, productId: b.productId, purchasePrice, supplierRef })
      .onConflictDoUpdate({
        target: [supplierProducts.supplierId, supplierProducts.productId],
        set: { purchasePrice, supplierRef, updatedAt: new Date().toISOString() },
      })
      .returning();

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Produit associé à un fournisseur (catalogue appro)`,
      module: 'Partenaires',
      entityId: row.id,
    });
    // Renvoie la ligne enrichie pour un affichage immédiat côté front.
    const [enriched] = await selectEnriched().where(eq(supplierProducts.id, row.id)).limit(1);
    res.status(201).json(enriched ?? row);
  } catch (err) {
    console.error('create supplier-product error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'ajout au catalogue fournisseur.' });
  }
});

/** PUT /api/supplier-products/:id — met à jour le prix / la référence d'une ligne. */
supplierProductsRouter.put('/:id', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const b = req.body ?? {};
    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (b.purchasePrice !== undefined) set.purchasePrice = Number(b.purchasePrice) || 0;
    if (b.supplierRef !== undefined) set.supplierRef = b.supplierRef ?? null;

    const [updated] = await db.update(supplierProducts).set(set).where(eq(supplierProducts.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: 'Ligne de catalogue introuvable.' });
    const [enriched] = await selectEnriched().where(eq(supplierProducts.id, updated.id)).limit(1);
    res.json(enriched ?? updated);
  } catch (err) {
    console.error('update supplier-product error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du catalogue fournisseur.' });
  }
});

/** DELETE /api/supplier-products/:id — retire un produit du catalogue d'un fournisseur. */
supplierProductsRouter.delete('/:id', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const [deleted] = await db.delete(supplierProducts).where(eq(supplierProducts.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Ligne de catalogue introuvable.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete supplier-product error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});
