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
    phone: b.phone ? String(b.phone).trim().slice(0, 40) || null : null,
    type: TYPES.includes(b.type) ? b.type : 'moto',
    fee: Math.max(0, Math.round(Number(b.fee) || 0)),
    status: STATUSES.includes(b.status) ? b.status : 'pending',
    driverName: b.driverName ?? null,
    scheduledDate: b.scheduledDate ?? null,
    notes: b.notes ?? null,
    items: cleanItems(b.items),
  };
}

/** Articles à livrer : nom obligatoire, quantité > 0, 100 lignes max. */
function cleanItems(v: unknown) {
  if (!Array.isArray(v)) return null;
  const items = v
    .map((x: any) => ({
      productId: x?.productId ? String(x.productId).slice(0, 64) : null,
      productName: String(x?.productName ?? '').trim().slice(0, 160),
      quantity: Number(x?.quantity) || 0,
      unit: x?.unit ? String(x.unit).slice(0, 30) : null,
    }))
    .filter((x) => x.productName && x.quantity > 0)
    .slice(0, 100);
  return items.length ? items : null;
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
    const [existing] = await db.select().from(deliveries).where(eq(deliveries.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Livraison introuvable.' });
    const f = pickFields(req.body ?? {});
    // Livraison facturée en caisse : la facture et son tarif sont figés (le montant est sur la facture).
    if (existing.saleId) { f.saleId = existing.saleId; f.fee = existing.fee; }
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
