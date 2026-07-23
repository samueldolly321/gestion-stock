import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { products, stockMovements } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, computeProductStatus, writeAuditLog } from '../helpers.ts';

export const movementsRouter = Router();

const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager', 'Magasinier', 'Commercial'];

// Impact d'un type de mouvement sur la quantité : +1 (entrée), -1 (sortie), 0 (transfert).
function direction(type: string): 1 | -1 | 0 {
  if (type === 'entry_reception' || type === 'adjustment') return 1;
  if (type === 'exit_sale' || type === 'waste_loss') return -1;
  return 0; // transfer
}

/** GET /api/movements — historique des mouvements (plus récents d'abord). */
movementsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const rows = await db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt));
    res.json(rows);
  } catch (err) {
    console.error('list movements error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des mouvements.' });
  }
});

/**
 * POST /api/movements — enregistre un mouvement de stock et met à jour le produit.
 * Opération atomique (transaction) : mouvement + quantité produit + statut.
 */
movementsRouter.post('/', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  const type = String(b.type || '');
  const quantity = Number(b.quantity) || 0;

  if (!b.productId || !type) {
    return res.status(400).json({ error: 'productId et type sont requis.' });
  }
  if (quantity <= 0) {
    return res.status(400).json({ error: 'La quantité doit être positive.' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, b.productId)).limit(1);
      if (!product) throw new Error('PRODUCT_NOT_FOUND');

      // Nouvelle quantité selon le sens du mouvement, bornée à 0.
      let newQty = product.quantity + direction(type) * quantity;
      if (newQty < 0) newQty = 0;
      const status = computeProductStatus(newQty, product.minStock, product.expirationDate);

      const id = generateId('MVT');
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          id,
          type,
          productId: b.productId,
          productName: b.productName ?? product.name,
          sku: b.sku ?? product.sku,
          warehouseId: b.warehouseId ?? product.locationId ?? null,
          warehouseName: b.warehouseName ?? null,
          fromWarehouseId: b.fromWarehouseId ?? null,
          fromWarehouseName: b.fromWarehouseName ?? null,
          quantity,
          reason: b.reason ?? null,
          performedBy: req.user?.name ?? 'Système',
          referenceId: b.referenceId ?? null,
          costPrice: Number(b.costPrice) || 0,
          costTotal: Number(b.costTotal) || 0,
          notes: b.notes ?? null,
        })
        .returning();

      const [updatedProduct] = await tx
        .update(products)
        .set({ quantity: newQty, status, updatedAt: new Date().toISOString() })
        .where(eq(products.id, b.productId))
        .returning();

      return { movement, product: updatedProduct };
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Mouvement de stock (${type}) : ${quantity} × ${result.product.name} → stock ${result.product.quantity}`,
      module: 'Stocks',
      entityId: result.product.id,
    });

    res.status(201).json(result);
  } catch (err: any) {
    if (err?.message === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }
    console.error('create movement error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement du mouvement.' });
  }
});
