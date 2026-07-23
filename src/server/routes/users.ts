import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { requireAuth, requireRole, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';
import { ROLES } from '../../services/permissions.ts';

export const usersRouter = Router();

// Seuls Super Admin & Admin gèrent les comptes.
const MANAGE_ROLES = ['Super Admin', 'Admin'];
// Attribuer/modifier ces rôles exige d'être Super Admin (anti-escalade).
const HIGH_ROLES = ['Super Admin', 'Admin'];

function sanitize(u: typeof users.$inferSelect) {
  const { passwordHash, ...safe } = u;
  return { ...safe, uid: safe.id };
}

/** GET /api/users — liste des comptes (sans mot de passe). */
usersRouter.get('/', requireAuth, requireRole(...MANAGE_ROLES), async (_req, res) => {
  try {
    const rows = await db.select().from(users).orderBy(desc(users.createdAt));
    res.json(rows.map(sanitize));
  } catch (err) {
    console.error('list users error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des utilisateurs.' });
  }
});

/** POST /api/users — crée un compte. */
usersRouter.post('/', requireAuth, requireRole(...MANAGE_ROLES), async (req: AuthedRequest, res) => {
  try {
    const { name, email, password, role, active } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nom, e-mail et mot de passe sont requis.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }
    const finalRole = ROLES.includes(role) ? role : 'Magasinier';
    if (HIGH_ROLES.includes(finalRole) && req.user?.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Seul un Super Admin peut créer un compte Admin ou Super Admin.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const id = generateId('USR');
    const [created] = await db
      .insert(users)
      .values({
        id,
        name: String(name).trim(),
        email: String(email).toLowerCase().trim(),
        passwordHash,
        role: finalRole,
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
        active: active !== false,
      })
      .returning();

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Création utilisateur : ${created.name} (${finalRole})`,
      module: 'Utilisateurs',
      entityId: id,
    });
    res.status(201).json(sanitize(created));
  } catch (err: any) {
    if (err?.code === '23505' || err?.cause?.code === '23505') {
      return res.status(409).json({ error: 'Cet e-mail est déjà utilisé.' });
    }
    console.error('create user error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du compte.' });
  }
});

/** PUT /api/users/:id — met à jour nom / rôle / statut actif. */
usersRouter.put('/:id', requireAuth, requireRole(...MANAGE_ROLES), async (req: AuthedRequest, res) => {
  try {
    const { name, role, active } = req.body ?? {};
    const targetId = req.params.id;
    const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const isSelf = targetId === req.user?.sub;
    const finalRole = role && ROLES.includes(role) ? role : target.role;

    if (target.role === 'Super Admin' && req.user?.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Seul un Super Admin peut modifier un Super Admin.' });
    }
    if (HIGH_ROLES.includes(finalRole) && req.user?.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Seul un Super Admin peut attribuer le rôle Admin/Super Admin.' });
    }
    if (isSelf && (finalRole !== target.role || active === false)) {
      return res.status(403).json({ error: 'Vous ne pouvez pas changer votre propre rôle ni vous désactiver.' });
    }

    const nextActive = active === undefined ? target.active : active !== false;
    const [updated] = await db
      .update(users)
      .set({
        name: name?.trim() || target.name,
        role: finalRole,
        active: nextActive,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, targetId))
      .returning();

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Modification utilisateur : ${updated.name} (${updated.role}${updated.active ? '' : ', désactivé'})`,
      module: 'Utilisateurs',
      entityId: targetId,
    });
    res.json(sanitize(updated));
  } catch (err) {
    console.error('update user error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du compte.' });
  }
});

/** POST /api/users/:id/password — réinitialise le mot de passe d'un compte. */
usersRouter.post('/:id/password', requireAuth, requireRole(...MANAGE_ROLES), async (req: AuthedRequest, res) => {
  try {
    const { password } = req.body ?? {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }
    const [target] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (target.role === 'Super Admin' && req.user?.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Seul un Super Admin peut réinitialiser le mot de passe d\'un Super Admin.' });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    await db.update(users).set({ passwordHash, updatedAt: new Date().toISOString() }).where(eq(users.id, target.id));
    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Réinitialisation du mot de passe : ${target.name}`,
      module: 'Utilisateurs',
      entityId: target.id,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('reset password error:', err);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation.' });
  }
});

/** DELETE /api/users/:id — supprime un compte (avec garde-fous). */
usersRouter.delete('/:id', requireAuth, requireRole(...MANAGE_ROLES), async (req: AuthedRequest, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user?.sub) {
      return res.status(403).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }
    const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    if (target.role === 'Super Admin') {
      if (req.user?.role !== 'Super Admin') {
        return res.status(403).json({ error: 'Seul un Super Admin peut supprimer un Super Admin.' });
      }
      const [{ c }] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.role, 'Super Admin'));
      if (c <= 1) return res.status(409).json({ error: 'Impossible de supprimer le dernier Super Admin.' });
    }

    await db.delete(users).where(eq(users.id, targetId));
    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Suppression utilisateur : ${target.name}`,
      module: 'Utilisateurs',
      entityId: targetId,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete user error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du compte.' });
  }
});
