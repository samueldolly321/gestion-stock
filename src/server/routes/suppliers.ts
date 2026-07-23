import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { suppliers } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';

export const suppliersRouter = Router();

const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager', 'Commercial', 'Acheteur'];

function pickFields(b: any) {
  return {
    name: b.name,
    companyName: b.companyName ?? null,
    email: b.email ?? null,
    phone: b.phone ?? null,
    address: b.address ?? null,
    vatNumber: b.vatNumber ?? null,
    contactPerson: b.contactPerson ?? null,
    notes: b.notes ?? null,
    status: b.status === 'inactive' ? 'inactive' : 'active',
  };
}

suppliersRouter.get('/', requireAuth, async (_req, res) => {
  try {
    res.json(await db.select().from(suppliers).orderBy(desc(suppliers.createdAt)));
  } catch (err) {
    console.error('list suppliers error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des fournisseurs.' });
  }
});

suppliersRouter.post('/', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    if (!f.name) return res.status(400).json({ error: 'Le nom est requis.' });
    const id = generateId('SUP');
    const [created] = await db.insert(suppliers).values({ id, ...f }).returning();
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Création fournisseur : ${created.name}`, module: 'Partenaires', entityId: id });
    res.status(201).json(created);
  } catch (err) {
    console.error('create supplier error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du fournisseur.' });
  }
});

suppliersRouter.put('/:id', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    if (!f.name) return res.status(400).json({ error: 'Le nom est requis.' });
    const [updated] = await db.update(suppliers).set(f).where(eq(suppliers.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: 'Fournisseur introuvable.' });
    res.json(updated);
  } catch (err) {
    console.error('update supplier error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du fournisseur.' });
  }
});

suppliersRouter.delete('/:id', requireAuth, requireWrite('partners'), async (req: AuthedRequest, res) => {
  try {
    const [deleted] = await db.delete(suppliers).where(eq(suppliers.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Fournisseur introuvable.' });
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Suppression fournisseur : ${deleted.name}`, module: 'Partenaires', entityId: deleted.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete supplier error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du fournisseur.' });
  }
});
