import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { clientPrices, products, clients } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';

export const clientPricesRouter = Router();

// Sélection enrichie : la ligne de tarif + les infos produit pour l'affichage / garde-fou marge.
function selectEnriched() {
  return db
    .select({
      id: clientPrices.id,
      clientId: clientPrices.clientId,
      productId: clientPrices.productId,
      salePrice: clientPrices.salePrice,
      createdAt: clientPrices.createdAt,
      updatedAt: clientPrices.updatedAt,
      productName: products.name,
      sku: products.sku,
      defaultSalePrice: products.salePrice,
      purchasePrice: products.purchasePrice,
      vatRate: products.vatRate,
      unit: products.unit,
      clientName: clients.name,
    })
    .from(clientPrices)
    .leftJoin(products, eq(products.id, clientPrices.productId))
    .leftJoin(clients, eq(clients.id, clientPrices.clientId));
}

/** GET /api/client-prices?clientId=... — tarifs négociés (tous, ou filtrés par client). */
clientPricesRouter.get('/', requireAuth, async (req, res) => {
  try {
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
    const rows = clientId
      ? await selectEnriched().where(eq(clientPrices.clientId, clientId)).orderBy(desc(clientPrices.createdAt))
      : await selectEnriched().orderBy(desc(clientPrices.createdAt));
    res.json(rows);
  } catch (err) {
    console.error('list client-prices error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des tarifs client.' });
  }
});

/**
 * POST /api/client-prices — définit le prix de vente d'un produit pour un client.
 * Idempotent : si le tarif existe déjà, on met à jour le prix.
 * Garde-fou : le prix ne peut pas être inférieur au prix d'achat du produit.
 */
clientPricesRouter.post('/', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const b = req.body ?? {};
    if (!b.clientId || !b.productId) {
      return res.status(400).json({ error: 'Client et produit requis.' });
    }
    const salePrice = Number(b.salePrice) || 0;

    // Garde-fou marge : refus si le prix de vente est sous le prix d'achat de l'article.
    const [prod] = await db.select().from(products).where(eq(products.id, b.productId)).limit(1);
    if (prod && salePrice < prod.purchasePrice) {
      return res.status(400).json({ error: `Prix de vente (${salePrice}) inférieur au prix d'achat (${prod.purchasePrice}).` });
    }

    const [row] = await db
      .insert(clientPrices)
      .values({ id: generateId('CPR'), clientId: b.clientId, productId: b.productId, salePrice })
      .onConflictDoUpdate({
        target: [clientPrices.clientId, clientPrices.productId],
        set: { salePrice, updatedAt: new Date().toISOString() },
      })
      .returning();

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: 'Tarif client défini (prix de vente négocié)',
      module: 'Partenaires',
      entityId: row.id,
    });
    const [enriched] = await selectEnriched().where(eq(clientPrices.id, row.id)).limit(1);
    res.status(201).json(enriched ?? row);
  } catch (err) {
    console.error('create client-price error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement du tarif client.' });
  }
});

/** PUT /api/client-prices/:id — met à jour le prix (avec garde-fou marge). */
clientPricesRouter.put('/:id', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const b = req.body ?? {};
    if (b.salePrice === undefined) return res.status(400).json({ error: 'Prix requis.' });
    const salePrice = Number(b.salePrice) || 0;

    const [existing] = await db.select().from(clientPrices).where(eq(clientPrices.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Tarif introuvable.' });
    const [prod] = await db.select().from(products).where(eq(products.id, existing.productId)).limit(1);
    if (prod && salePrice < prod.purchasePrice) {
      return res.status(400).json({ error: `Prix de vente (${salePrice}) inférieur au prix d'achat (${prod.purchasePrice}).` });
    }

    const [updated] = await db
      .update(clientPrices)
      .set({ salePrice, updatedAt: new Date().toISOString() })
      .where(eq(clientPrices.id, req.params.id))
      .returning();
    const [enriched] = await selectEnriched().where(eq(clientPrices.id, updated.id)).limit(1);
    res.json(enriched ?? updated);
  } catch (err) {
    console.error('update client-price error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du tarif client.' });
  }
});

/** DELETE /api/client-prices/:id — supprime un tarif négocié (retour au prix par défaut). */
clientPricesRouter.delete('/:id', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const [deleted] = await db.delete(clientPrices).where(eq(clientPrices.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Tarif introuvable.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete client-price error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});
