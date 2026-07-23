import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { clients } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';

export const clientsRouter = Router();

const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager', 'Commercial', 'Acheteur'];

function pickFields(b: any) {
  return {
    name: b.name,
    email: b.email ?? null,
    phone: b.phone ?? null,
    address: b.address ?? null,
    taxNumber: b.taxNumber ?? null,
    balance: Number(b.balance) || 0,
    loyaltyPoints: Number(b.loyaltyPoints) || 0,
    notes: b.notes ?? null,
    status: b.status === 'inactive' ? 'inactive' : 'active',
  };
}

clientsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    res.json(await db.select().from(clients).orderBy(desc(clients.createdAt)));
  } catch (err) {
    console.error('list clients error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des clients.' });
  }
});

clientsRouter.post('/', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    if (!f.name) return res.status(400).json({ error: 'Le nom est requis.' });
    const id = generateId('CLI');
    const [created] = await db.insert(clients).values({ id, ...f }).returning();
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Création client : ${created.name}`, module: 'Partenaires', entityId: id });
    res.status(201).json(created);
  } catch (err) {
    console.error('create client error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du client.' });
  }
});

clientsRouter.put('/:id', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    if (!f.name) return res.status(400).json({ error: 'Le nom est requis.' });
    const [updated] = await db.update(clients).set(f).where(eq(clients.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: 'Client introuvable.' });
    res.json(updated);
  } catch (err) {
    console.error('update client error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du client.' });
  }
});

clientsRouter.delete('/:id', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const [deleted] = await db.delete(clients).where(eq(clients.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Client introuvable.' });
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Suppression client : ${deleted.name}`, module: 'Partenaires', entityId: deleted.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete client error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du client.' });
  }
});
