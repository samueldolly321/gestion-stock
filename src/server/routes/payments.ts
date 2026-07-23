import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { payments } from '../../db/schema.ts';
import { requireAuth } from '../auth-middleware.ts';

export const paymentsRouter = Router();

/** GET /api/payments — historique des règlements. Filtres : ?refId= | ?partyId= */
paymentsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const refId = req.query.refId ? String(req.query.refId) : null;
    const partyId = req.query.partyId ? String(req.query.partyId) : null;

    let rows;
    if (refId) {
      rows = await db.select().from(payments).where(eq(payments.refId, refId)).orderBy(desc(payments.createdAt));
    } else if (partyId) {
      rows = await db.select().from(payments).where(eq(payments.partyId, partyId)).orderBy(desc(payments.createdAt));
    } else {
      rows = await db.select().from(payments).orderBy(desc(payments.createdAt));
    }
    res.json(rows);
  } catch (err) {
    console.error('list payments error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des règlements.' });
  }
});
