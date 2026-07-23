import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { auditLogs } from '../../db/schema.ts';
import { requireAuth } from '../auth-middleware.ts';

export const auditLogsRouter = Router();

/** GET /api/audit-logs — journal d'audit (100 dernières entrées, plus récentes d'abord). */
auditLogsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
    res.json(rows);
  } catch (err) {
    console.error('list audit logs error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement du journal d\'audit.' });
  }
});
