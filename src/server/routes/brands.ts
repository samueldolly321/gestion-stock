import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { brands } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';

export const brandsRouter = Router();

const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager'];

brandsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    res.json(await db.select().from(brands).orderBy(desc(brands.createdAt)));
  } catch (err) {
    console.error('list brands error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des marques.' });
  }
});

brandsRouter.post('/', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const { name, description, logo } = req.body ?? {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Le nom est requis.' });
    const id = generateId('BRD');
    const [created] = await db.insert(brands).values({ id, name: String(name).trim(), description: description ?? null, logo: logo ?? null }).returning();
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Création marque : ${created.name}`, module: 'Catalogue', entityId: id });
    res.status(201).json(created);
  } catch (err) {
    console.error('create brand error:', err);
    res.status(500).json({ error: 'Erreur lors de la création de la marque.' });
  }
});

brandsRouter.put('/:id', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const { name, description, logo } = req.body ?? {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Le nom est requis.' });
    const [updated] = await db.update(brands).set({ name: String(name).trim(), description: description ?? null, logo: logo ?? null }).where(eq(brands.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: 'Marque introuvable.' });
    res.json(updated);
  } catch (err) {
    console.error('update brand error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

brandsRouter.delete('/:id', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const [deleted] = await db.delete(brands).where(eq(brands.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Marque introuvable.' });
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Suppression marque : ${deleted.name}`, module: 'Catalogue', entityId: deleted.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete brand error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});
