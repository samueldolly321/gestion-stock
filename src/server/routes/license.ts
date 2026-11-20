import { Router, type Request, type Response, type NextFunction } from 'express';
import { getLicenseStatus, activateLicense, isUsable, licenseRequired } from '../license.ts';
import { writeAuditLog } from '../helpers.ts';

export const licenseRouter = Router();

/** GET /api/license/status — public (l'écran d'activation s'affiche avant toute connexion). */
licenseRouter.get('/status', async (_req, res) => {
  try {
    res.json(await getLicenseStatus());
  } catch (err) {
    console.error('license status error:', err);
    res.status(500).json({ error: 'Vérification de la licence impossible.' });
  }
});

// Anti-essais en rafale : 10 tentatives d'activation par minute et par adresse.
const attempts = new Map<string, { n: number; at: number }>();

/** POST /api/license/activate { key } — enregistre la clé si elle est valide pour cet ordinateur. */
licenseRouter.post('/activate', async (req, res) => {
  const ip = req.ip || 'local';
  const a = attempts.get(ip);
  const now = Date.now();
  if (a && now - a.at < 60_000 && a.n >= 10) return res.status(429).json({ error: 'Trop d’essais. Patientez une minute.' });
  attempts.set(ip, a && now - a.at < 60_000 ? { n: a.n + 1, at: a.at } : { n: 1, at: now });

  try {
    const r = await activateLicense(String(req.body?.key ?? ''));
    if (r.ok === false) return res.status(400).json({ error: r.error });
    await writeAuditLog({ userName: 'Licence', action: `Licence activée : ${r.status.licensee}`, module: 'Configuration', entityId: r.status.machineCode });
    res.json(r.status);
  } catch (err) {
    console.error('license activate error:', err);
    res.status(500).json({ error: 'Activation impossible.' });
  }
});

/**
 * Garde globale : sans licence valide ni essai en cours, toute l'API est refusée (402),
 * sauf la santé et la licence elle-même. Le front affiche alors l'écran d'activation.
 */
export async function requireLicense(req: Request, res: Response, next: NextFunction) {
  if (!licenseRequired() || !req.path.startsWith('/api/')) return next();
  if (req.path === '/api/health' || req.path.startsWith('/api/license/')) return next();
  try {
    const s = await getLicenseStatus();
    if (isUsable(s)) return next();
    return res.status(402).json({ error: 'LICENSE_REQUIRED', license: s });
  } catch (err) {
    console.error('license guard error:', err);
    return res.status(500).json({ error: 'Vérification de la licence impossible.' });
  }
}
