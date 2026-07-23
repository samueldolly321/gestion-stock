import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { settings } from '../db/schema.ts';
import { canWrite } from '../services/permissions.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me-super-secret-key';
const JWT_EXPIRES_IN = '7d';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  name: string;
}

// Étend le type Request d'Express pour transporter l'utilisateur authentifié.
export interface AuthedRequest extends Request {
  user?: JwtPayload;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// Middleware : exige un jeton JWT valide dans l'en-tête Authorization.
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Jeton d\'authentification manquant.' });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
  }
}

// Middleware factory : exige que l'utilisateur ait l'un des rôles autorisés.
export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé : rôle insuffisant.' });
    }
    next();
  };
}

// Middleware factory : exige le droit d'écriture sur un module donné,
// selon la matrice configurée dans les réglages (repli sur les défauts).
export function requireWrite(scope: string) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (req.user.role === 'Super Admin') return next();
    try {
      const [row] = await db
        .select({ wp: settings.writePermissions })
        .from(settings)
        .where(eq(settings.id, 'global'))
        .limit(1);
      const matrix = (row?.wp as Record<string, string[]> | null) ?? null;
      if (canWrite(req.user.role, scope, matrix)) return next();
      return res.status(403).json({ error: 'Droits insuffisants pour cette action (écriture non autorisée).' });
    } catch (err) {
      console.error('requireWrite error:', err);
      return res.status(500).json({ error: 'Erreur de vérification des droits.' });
    }
  };
}
