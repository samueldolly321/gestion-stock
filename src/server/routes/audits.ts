import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { inventoryAudits, products, stockMovements } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, computeProductStatus, writeAuditLog } from '../helpers.ts';

export const auditsRouter = Router();

const AUDIT_ROLES = ['Super Admin', 'Admin', 'Manager', 'Auditeur'];

/** GET /api/audits — liste des inventaires (plus récents d'abord). */
auditsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    res.json(await db.select().from(inventoryAudits).orderBy(desc(inventoryAudits.createdAt)));
  } catch (err) {
    console.error('list audits error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des inventaires.' });
  }
});

/** POST /api/audits — démarre une session d'inventaire. */
auditsRouter.post('/', requireAuth, requireWrite('audits'), async (req: AuthedRequest, res) => {
  try {
    const b = req.body ?? {};
    if (!b.title) return res.status(400).json({ error: 'Le titre est requis.' });
    const id = generateId('AUD');
    const [created] = await db
      .insert(inventoryAudits)
      .values({
        id,
        title: b.title,
        status: 'in_progress',
        warehouseId: b.warehouseId ?? null,
        warehouseName: b.warehouseName ?? null,
        auditorId: req.user!.sub,
        auditorName: req.user?.name ?? 'Auditeur',
        items: Array.isArray(b.items) ? b.items : [],
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error('create audit error:', err);
    res.status(500).json({ error: 'Erreur lors du démarrage de l\'inventaire.' });
  }
});

/**
 * POST /api/audits/:id/validate — valide l'inventaire.
 * Transaction : pour chaque écart, fixe la quantité du produit à la valeur
 * comptée + enregistre un mouvement d'ajustement, puis clôture l'inventaire.
 */
auditsRouter.post('/:id/validate', requireAuth, requireWrite('audits'), async (req: AuthedRequest, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    const audit = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(inventoryAudits).where(eq(inventoryAudits.id, req.params.id)).limit(1);
      if (!current) throw new Error('AUDIT_NOT_FOUND');

      for (const item of items) {
        const diff = Number(item.diff) || 0;
        if (diff === 0) continue;

        const [product] = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (!product) continue;

        const counted = Number(item.actualQuantity) || 0;
        const status = computeProductStatus(counted, product.minStock, product.expirationDate);

        await tx.insert(stockMovements).values({
          id: generateId('MVT'),
          type: 'adjustment',
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          warehouseId: current.warehouseId ?? product.locationId ?? null,
          quantity: diff, // signé : positif = surplus, négatif = manquant
          reason: `Ajustement inventaire réf: ${current.id}. ${item.notes ? 'Notes: ' + item.notes : ''}`.trim(),
          performedBy: req.user?.name ?? 'Auditeur',
          referenceId: current.id,
          costPrice: 0,
          costTotal: 0,
        });

        await tx
          .update(products)
          .set({ quantity: counted, status, updatedAt: new Date().toISOString() })
          .where(eq(products.id, product.id));
      }

      const [updated] = await tx
        .update(inventoryAudits)
        .set({ status: 'completed', items, completedAt: new Date().toISOString() })
        .where(eq(inventoryAudits.id, req.params.id))
        .returning();
      return updated;
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Validation d'inventaire : ${audit.title}. Écarts ajustés.`,
      module: 'Inventaires',
      entityId: audit.id,
    });

    res.json(audit);
  } catch (err: any) {
    if (err?.message === 'AUDIT_NOT_FOUND') return res.status(404).json({ error: 'Inventaire introuvable.' });
    console.error('validate audit error:', err);
    res.status(500).json({ error: 'Erreur lors de la validation de l\'inventaire.' });
  }
});

/** POST /api/audits/:id/cancel — annule la session. */
auditsRouter.post('/:id/cancel', requireAuth, requireWrite('audits'), async (req: AuthedRequest, res) => {
  try {
    const [updated] = await db
      .update(inventoryAudits)
      .set({ status: 'cancelled', completedAt: new Date().toISOString() })
      .where(eq(inventoryAudits.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Inventaire introuvable.' });
    res.json(updated);
  } catch (err) {
    console.error('cancel audit error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'annulation.' });
  }
});
