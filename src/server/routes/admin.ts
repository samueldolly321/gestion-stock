/**
 * Routes d'administration sensibles — réservées au Super Admin réel.
 */
import { Router } from 'express';
import { requireAuth, requireRole, type AuthedRequest } from '../auth-middleware.ts';
import { resetFigures } from '../reset-figures.ts';
import { writeAuditLog } from '../helpers.ts';

export const adminRouter = Router();

// Mot de confirmation exigé dans le corps de la requête (double sécurité UI + serveur).
const CONFIRM_PHRASE = 'REINITIALISER';

/**
 * POST /api/admin/reset-figures
 * Remet les chiffres à zéro (stock, ventes, achats, soldes clients…) en conservant
 * le catalogue produits, les clients et les fournisseurs. Super Admin uniquement.
 */
adminRouter.post('/reset-figures', requireAuth, requireRole('Super Admin'), async (req: AuthedRequest, res) => {
  const confirm = String(req.body?.confirm ?? '').trim().toUpperCase();
  if (confirm !== CONFIRM_PHRASE) {
    return res.status(400).json({ error: `Confirmation invalide (attendu « ${CONFIRM_PHRASE} »).` });
  }
  try {
    const cleared = await resetFigures();
    // Journalise l'opération (audit_logs vient d'être purgé → cette ligne en devient la 1re).
    await writeAuditLog({
      userId: req.user!.sub,
      userName: req.user!.name,
      action: 'Remise à zéro des chiffres (stock, ventes, achats, règlements, soldes clients…)',
      module: 'Configuration',
      entityId: 'reset-figures',
    });
    res.json({ ok: true, cleared });
  } catch (err) {
    console.error('reset-figures error:', err);
    res.status(500).json({ error: 'Erreur lors de la remise à zéro des chiffres.' });
  }
});
