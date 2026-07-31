import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { warehouses, productStock } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';

export const warehousesRouter = Router();

const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager'];

/** GET /api/warehouses/stock — répartition du stock par entrepôt (toutes les lignes). */
warehousesRouter.get('/stock', requireAuth, async (_req, res) => {
  try {
    res.json(await db.select().from(productStock));
  } catch (err) {
    console.error('list product-stock error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement du stock par entrepôt.' });
  }
});

function pickFields(b: any) {
  return {
    name: b.name,
    location: b.location ?? null,
    code: b.code ?? null,
    status: b.status === 'inactive' ? 'inactive' : 'active',
    capacity: Number(b.capacity) || 0,
    managerId: b.managerId ?? null,
  };
}

warehousesRouter.get('/', requireAuth, async (_req, res) => {
  try {
    res.json(await db.select().from(warehouses).orderBy(desc(warehouses.createdAt)));
  } catch (err) {
    console.error('list warehouses error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des entrepôts.' });
  }
});

warehousesRouter.post('/', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    if (!f.name || !String(f.name).trim()) return res.status(400).json({ error: 'Le nom est requis.' });
    const id = generateId('WH');
    const [created] = await db.insert(warehouses).values({ id, ...f }).returning();
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Création entrepôt : ${created.name}`, module: 'Entrepôts', entityId: id });
    res.status(201).json(created);
  } catch (err) {
    console.error('create warehouse error:', err);
    res.status(500).json({ error: 'Erreur lors de la création de l\'entrepôt.' });
  }
});

warehousesRouter.put('/:id', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    if (!f.name || !String(f.name).trim()) return res.status(400).json({ error: 'Le nom est requis.' });
    const [updated] = await db.update(warehouses).set(f).where(eq(warehouses.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: 'Entrepôt introuvable.' });
    res.json(updated);
  } catch (err) {
    console.error('update warehouse error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

warehousesRouter.delete('/:id', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const [deleted] = await db.delete(warehouses).where(eq(warehouses.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Entrepôt introuvable.' });
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Suppression entrepôt : ${deleted.name}`, module: 'Entrepôts', entityId: deleted.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete warehouse error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});
