import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { signToken, requireAuth, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';
import { loginRateStatus, recordLoginFailure, recordLoginSuccess } from '../login-rate-limit.ts';

export const authRouter = Router();

// Retire le hash du mot de passe avant d'envoyer l'utilisateur au client.
function sanitize(u: typeof users.$inferSelect) {
  const { passwordHash, ...safe } = u;
  return { ...safe, uid: safe.id }; // 'uid' pour compatibilité avec le front existant
}

/**
 * GET /api/auth/registration-open
 * Indique si l'auto-inscription est ouverte (uniquement tant qu'aucun compte n'existe :
 * bootstrap du 1er propriétaire). Ensuite, les comptes se créent via la gestion des utilisateurs.
 */
authRouter.get('/registration-open', async (_req, res) => {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    res.json({ open: count === 0 });
  } catch (err) {
    console.error('registration-open error:', err);
    res.status(500).json({ open: false });
  }
});

/**
 * POST /api/auth/register
 * Crée le PREMIER compte (propriétaire → 'Super Admin'). Fermé ensuite : une fois un
 * compte existant, l'inscription publique est refusée (403) — les comptes suivants se
 * créent via /api/users (réservé aux administrateurs).
 */
authRouter.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nom, e-mail et mot de passe sont requis.' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    // Combien d'utilisateurs déjà en base ? (pour le bootstrap du premier compte)
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const isFirstUser = count === 0;

    // Auto-inscription fermée après le bootstrap (anti-création de comptes non autorisée).
    if (!isFirstUser) {
      return res.status(403).json({ error: 'Inscription fermée. Contactez un administrateur pour obtenir un compte.' });
    }

    const finalRole = 'Super Admin';

    const passwordHash = await bcrypt.hash(password, 10);
    const id = generateId('USR');

    const [created] = await db
      .insert(users)
      .values({
        id,
        name,
        email: String(email).toLowerCase().trim(),
        passwordHash,
        role: finalRole,
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
        active: true,
      })
      .returning();

    await writeAuditLog({
      userId: created.id,
      userName: created.name,
      action: `Création d'un compte (${finalRole})`,
      module: 'Authentification',
      entityId: created.id,
    });

    const token = signToken({ sub: created.id, email: created.email, role: created.role, name: created.name });
    return res.status(201).json({ token, user: sanitize(created) });
  } catch (err: any) {
    // 23505 = violation de contrainte unique (email déjà utilisé).
    // Drizzle enveloppe l'erreur pg : le code se trouve sur err.cause.code.
    if (err?.code === '23505' || err?.cause?.code === '23505') {
      return res.status(409).json({ error: 'Cette adresse e-mail est déjà associée à un compte.' });
    }
    console.error('register error:', err);
    return res.status(500).json({ error: 'Erreur serveur lors de la création du compte.' });
  }
});

/**
 * POST /api/auth/login
 * Vérifie e-mail + mot de passe, renvoie un jeton JWT.
 */
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail et mot de passe requis.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    // Clé anti-force-brute : IP du client (réelle derrière le proxy Render grâce à
    // « trust proxy ») + e-mail visé → protège chaque compte individuellement.
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const rlKey = `${ip}|${normalizedEmail}`;
    const now = Date.now();

    // Trop de tentatives récentes ? Refus immédiat (429) sans même toucher la base.
    const rl = loginRateStatus(rlKey, now);
    if (rl.blocked) {
      res.setHeader('Retry-After', String(rl.retryAfter));
      return res.status(429).json({
        error: `Trop de tentatives de connexion. Réessayez dans ${Math.ceil(rl.retryAfter / 60)} min.`,
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // Message générique pour ne pas révéler si l'e-mail existe.
    if (!user || !user.passwordHash) {
      recordLoginFailure(rlKey, now);
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Ce compte est désactivé.' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      recordLoginFailure(rlKey, now);
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    // Succès : on efface les échecs accumulés pour cette clé.
    recordLoginSuccess(rlKey);

    await writeAuditLog({
      userId: user.id,
      userName: user.name,
      action: 'Connexion réussie',
      module: 'Authentification',
      entityId: user.id,
    });

    const token = signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
    return res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

/**
 * GET /api/auth/me
 * Renvoie l'utilisateur courant à partir du jeton (utile au rechargement de page).
 */
authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.sub)).limit(1);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    return res.json({ user: sanitize(user) });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});
