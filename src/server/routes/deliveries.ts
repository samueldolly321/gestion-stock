import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { deliveries } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';

export const deliveriesRouter = Router();

const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager', 'Commercial', 'Magasinier'];

const TYPES = ['moto', 'voiture', 'camion', 'velo', 'pied'];
const STATUSES = ['pending', 'in_transit', 'delivered', 'cancelled'];

function pickFields(b: any) {
  return {
    saleId: b.saleId ?? null,
    clientId: b.clientId ?? null,
    clientName: b.clientName ?? null,
    address: b.address ?? null,
    type: TYPES.includes(b.type) ? b.type : 'moto',
    fee: Number(b.fee) || 0,
    status: STATUSES.includes(b.status) ? b.status : 'pending',
    driverName: b.driverName ?? null,
    scheduledDate: b.scheduledDate ?? null,
    notes: b.notes ?? null,
  };
}

deliveriesRouter.get('/', requireAuth, async (_req, res) => {
  try {
    res.json(await db.select().from(deliveries).orderBy(desc(deliveries.createdAt)));
  } catch (err) {
    console.error('list deliveries error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des livraisons.' });
  }
});

deliveriesRouter.post('/', requireAuth, requireWrite('deliveries'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    const id = generateId('DLV');
    const [created] = await db
      .insert(deliveries)
      .values({ id, ...f, createdBy: req.user?.name ?? null })
      .returning();
    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Création livraison (${created.type}) : ${created.clientName || 'client'}`,
      module: 'Livraisons',
      entityId: id,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error('create delivery error:', err);
    res.status(500).json({ error: 'Erreur lors de la création de la livraison.' });
  }
});

deliveriesRouter.put('/:id', requireAuth, requireWrite('deliveries'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    const [updated] = await db
      .update(deliveries)
      .set({ ...f, updatedAt: new Date().toISOString() })
      .where(eq(deliveries.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Livraison introuvable.' });
    res.json(updated);
  } catch (err) {
    console.error('update delivery error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la livraison.' });
  }
});

deliveriesRouter.delete('/:id', requireAuth, requireWrite('deliveries'), async (req: AuthedRequest, res) => {
  try {
    const [deleted] = await db.delete(deliveries).where(eq(deliveries.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Livraison introuvable.' });
    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Suppression livraison : ${deleted.clientName || deleted.id}`,
      module: 'Livraisons',
      entityId: deleted.id,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete delivery error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression de la livraison.' });
  }
});
