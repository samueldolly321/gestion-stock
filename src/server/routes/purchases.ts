import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { purchases, products, stockMovements, payments } from '../../db/schema.ts';
import { requireAuth, requireWrite, requireAnyTab, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';
import { adjustWarehouseStock, resolveWarehouseId } from '../stock.ts';

export const purchasesRouter = Router();

function pickItems(raw: any): any[] {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .filter((it) => it && it.productId && Number(it.quantity) > 0)
    .map((it) => {
      const quantity = Number(it.quantity) || 0;
      const unitCost = Number(it.unitCost) || 0;
      return {
        productId: it.productId,
        productName: it.productName ?? null,
        sku: it.sku ?? null,
        quantity,
        unitCost,
        tax: Number(it.tax) || 0,
        total: quantity * unitCost,
        // Affichage « achat en gros » (n'affecte pas le stock : quantity est déjà en pièces).
        unitLabel: it.unitLabel ?? null,
        packQty: it.packQty != null ? Number(it.packQty) : null,
      };
    });
}

/** GET /api/purchases — liste des achats (plus récents d'abord). */
purchasesRouter.get('/', requireAuth, requireAnyTab('purchases', 'reorder', 'calendar', 'accounting', 'dashboard', 'sales'), async (_req, res) => {
  try {
    res.json(await db.select().from(purchases).orderBy(desc(purchases.createdAt)));
  } catch (err) {
    console.error('list purchases error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des achats.' });
  }
});

/** POST /api/purchases — crée une commande d'achat (statut 'ordered'). */
purchasesRouter.post('/', requireAuth, requireWrite('purchases'), async (req: AuthedRequest, res) => {
  try {
    const b = req.body ?? {};
    const items = pickItems(b.items);
    if (!b.supplierId) return res.status(400).json({ error: 'Le fournisseur est requis.' });
    if (items.length === 0) return res.status(400).json({ error: 'Ajoutez au moins un article.' });

    const subtotal = items.reduce((a, it) => a + it.total, 0);
    const vatAmount = items.reduce((a, it) => a + it.total * (it.tax / 100), 0);
    const discountAmount = Number(b.discountAmount) || 0;
    const totalAmount = subtotal + vatAmount - discountAmount;

    const id = generateId('ACH');
    const [created] = await db
      .insert(purchases)
      .values({
        id,
        type: 'order',
        supplierId: b.supplierId,
        supplierName: b.supplierName ?? null,
        status: 'ordered',
        items,
        vatAmount,
        discountAmount,
        totalAmount,
        paymentStatus: 'unpaid',
        paidAmount: 0,
        expectedDate: b.expectedDate || null,
        warehouseId: b.warehouseId ?? null,
        warehouseName: b.warehouseName ?? null,
        notes: b.notes ?? null,
        createdBy: req.user?.name ?? 'Système',
      })
      .returning();

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Commande d'achat créée (Réf ${id}, ${created.supplierName || 'fournisseur'})`,
      module: 'Achats',
      entityId: id,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error('create purchase error:', err);
    res.status(500).json({ error: 'Erreur lors de la création de la commande.' });
  }
});

/**
 * POST /api/purchases/:id/receive — réception en stock.
 * Transaction : un mouvement d'entrée par article + incrément des quantités,
 * puis passage du statut à 'received'.
 */
purchasesRouter.post('/:id/receive', requireAuth, requireWrite('purchases'), async (req: AuthedRequest, res) => {
  try {
    const [purchase] = await db.select().from(purchases).where(eq(purchases.id, req.params.id)).limit(1);
    if (!purchase) return res.status(404).json({ error: 'Achat introuvable.' });
    if (purchase.status === 'received') return res.status(409).json({ error: 'Cet achat est déjà réceptionné.' });
    if (purchase.status === 'cancelled') return res.status(409).json({ error: 'Cet achat est annulé.' });

    const items = (purchase.items as any[]) || [];

    const updated = await db.transaction(async (tx) => {
      for (const item of items) {
        const [product] = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (!product) continue;

        const qty = Number(item.quantity) || 0;
        const unitCost = Number(item.unitCost) || 0;
        const whId = await resolveWarehouseId(tx, purchase.warehouseId, product.id);

        // Coût moyen pondéré (PMP/CUMP) sur le stock TOTAL : le prix d'achat de la fiche est
        // réactualisé au coût réel réceptionné → fiabilise le COGS et le garde-fou vente à perte.
        const newTotal = product.quantity + qty;
        const newPurchasePrice = newTotal > 0
          ? (product.quantity * product.purchasePrice + qty * unitCost) / newTotal
          : (unitCost || product.purchasePrice);

        await tx.insert(stockMovements).values({
          id: generateId('MVT'),
          type: 'entry_reception',
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          warehouseId: whId,
          quantity: qty,
          reason: `Réception achat Réf: ${purchase.id}`,
          performedBy: req.user?.name ?? 'Achats',
          referenceId: purchase.id,
          costPrice: unitCost,
          costTotal: unitCost * qty,
        });

        // Entre en stock dans l'entrepôt de destination (recalcule total + statut),
        // puis met à jour le PMP séparément (adjustWarehouseStock ne touche pas au prix).
        if (whId) {
          await adjustWarehouseStock(tx, product.id, whId, qty);
          await tx.update(products)
            .set({ purchasePrice: newPurchasePrice, updatedAt: new Date().toISOString() })
            .where(eq(products.id, product.id));
        } else {
          await tx.update(products)
            .set({ quantity: newTotal, purchasePrice: newPurchasePrice, updatedAt: new Date().toISOString() })
            .where(eq(products.id, product.id));
        }
      }

      const [row] = await tx
        .update(purchases)
        .set({ status: 'received', type: 'reception', receivedAt: new Date().toISOString() })
        .where(eq(purchases.id, purchase.id))
        .returning();
      return row;
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Réception marchandises (Réf ${purchase.id}) — stock mis à jour`,
      module: 'Achats',
      entityId: purchase.id,
    });
    res.json(updated);
  } catch (err) {
    console.error('receive purchase error:', err);
    res.status(500).json({ error: 'Erreur lors de la réception.' });
  }
});

/** POST /api/purchases/:id/pay — enregistre un règlement fournisseur. */
purchasesRouter.post('/:id/pay', requireAuth, requireWrite('purchases'), async (req: AuthedRequest, res) => {
  try {
    const amount = Number(req.body?.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'Montant de règlement invalide.' });
    const [purchase] = await db.select().from(purchases).where(eq(purchases.id, req.params.id)).limit(1);
    if (!purchase) return res.status(404).json({ error: 'Achat introuvable.' });

    const already = purchase.paidAmount || 0;
    const applied = Math.min(amount, purchase.totalAmount - already);
    if (applied <= 0) return res.status(409).json({ error: 'Cet achat est déjà entièrement réglé.' });
    const paidAmount = already + applied;
    const paymentStatus = paidAmount >= purchase.totalAmount ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'unpaid';

    // Transaction : mise à jour de l'achat + trace du règlement dans l'historique (payments).
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(purchases)
        .set({ paidAmount, paymentStatus })
        .where(eq(purchases.id, purchase.id))
        .returning();
      await tx.insert(payments).values({
        id: generateId('PAY'),
        kind: 'purchase',
        refId: purchase.id,
        partyId: purchase.supplierId ?? null,
        partyName: purchase.supplierName ?? null,
        amount: applied,
        method: req.body?.method ?? null,
        note: req.body?.note ?? 'Règlement fournisseur',
        createdBy: req.user?.name ?? null,
      });
      return row;
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Règlement fournisseur ${applied} (Réf ${purchase.id}) — ${paymentStatus}`,
      module: 'Achats',
      entityId: purchase.id,
    });
    res.json(updated);
  } catch (err) {
    console.error('pay purchase error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement du règlement.' });
  }
});

/** DELETE /api/purchases/:id — supprime une commande NON réceptionnée. */
purchasesRouter.delete('/:id', requireAuth, requireWrite('purchases'), async (req: AuthedRequest, res) => {
  try {
    const [purchase] = await db.select().from(purchases).where(eq(purchases.id, req.params.id)).limit(1);
    if (!purchase) return res.status(404).json({ error: 'Achat introuvable.' });
    if (purchase.status === 'received') {
      return res.status(409).json({ error: 'Impossible de supprimer un achat déjà réceptionné (stock impacté).' });
    }
    await db.delete(purchases).where(eq(purchases.id, purchase.id));
    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Suppression commande d'achat (Réf ${purchase.id})`,
      module: 'Achats',
      entityId: purchase.id,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete purchase error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});
