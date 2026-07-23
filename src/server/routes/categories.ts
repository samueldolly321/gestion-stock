import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { categories } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';

export const categoriesRouter = Router();

// Rôles autorisés à gérer les catégories.
const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager'];

/** GET /api/categories — liste toutes les catégories et sous-catégories (à plat). */
categoriesRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const rows = await db.select().from(categories);
    res.json(rows);
  } catch (err) {
    console.error('list categories error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des catégories.' });
  }
});

/**
 * POST /api/categories — crée une catégorie (niveau 1) ou une sous-catégorie.
 * body: { name, description?, parentId? }. Avec parentId => sous-catégorie.
 * Limité à 2 niveaux (catégorie > sous-catégorie).
 */
categoriesRouter.post('/', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const { name, description, parentId } = req.body ?? {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Le nom de la catégorie est requis.' });
    }

    let path = String(name).trim();
    if (parentId) {
      const [parent] = await db.select().from(categories).where(eq(categories.id, parentId)).limit(1);
      if (!parent) {
        return res.status(400).json({ error: 'Catégorie parente introuvable.' });
      }
      if (parent.parentId) {
        return res.status(400).json({ error: 'Une sous-catégorie ne peut pas avoir de sous-catégorie (2 niveaux max).' });
      }
      path = `${parent.name} > ${String(name).trim()}`;
    }

    const id = generateId('CAT');
    const [created] = await db
      .insert(categories)
      .values({
        id,
        name: String(name).trim(),
        description: description ?? null,
        parentId: parentId ?? null,
        path,
      })
      .returning();

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Création ${parentId ? 'sous-catégorie' : 'catégorie'} : ${path}`,
      module: 'Catalogue',
      entityId: id,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('create category error:', err);
    res.status(500).json({ error: 'Erreur lors de la création de la catégorie.' });
  }
});

/** PUT /api/categories/:id — renomme une catégorie. */
categoriesRouter.put('/:id', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const { name, description } = req.body ?? {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Le nom est requis.' });
    }
    const [updated] = await db
      .update(categories)
      .set({ name: String(name).trim(), description: description ?? null })
      .where(eq(categories.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Catégorie introuvable.' });
    res.json(updated);
  } catch (err) {
    console.error('update category error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

/** DELETE /api/categories/:id — bloque si des sous-catégories existent. */
categoriesRouter.delete('/:id', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const children = await db.select().from(categories).where(eq(categories.parentId, req.params.id));
    if (children.length > 0) {
      return res.status(409).json({ error: 'Supprimez d\'abord ses sous-catégories.' });
    }
    const [deleted] = await db.delete(categories).where(eq(categories.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Catégorie introuvable.' });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Suppression catégorie : ${deleted.path || deleted.name}`,
      module: 'Catalogue',
      entityId: deleted.id,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('delete category error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});
