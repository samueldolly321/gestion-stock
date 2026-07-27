import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { expenses } from '../../db/schema.ts';
import { requireAuth, requireWrite, requireAnyTab, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';

export const expensesRouter = Router();

const CATEGORIES = ['transport', 'douane', 'taxe', 'commission', 'manutention', 'carburant', 'autre'];

function pickFields(b: any) {
  return {
    label: String(b.label ?? '').trim(),
    category: CATEGORIES.includes(b.category) ? b.category : 'autre',
    amount: Number(b.amount) || 0,
    supplierId: b.supplierId ?? null,
    supplierName: b.supplierName ?? null,
    purchaseId: b.purchaseId ?? null,
    paymentStatus: b.paymentStatus === 'unpaid' ? 'unpaid' : 'paid',
    date: b.date ?? null,
    notes: b.notes ?? null,
  };
}

/** GET /api/expenses — liste des dépenses (plus récentes d'abord). */
expensesRouter.get('/', requireAuth, requireAnyTab('expenses', 'accounting', 'dashboard'), async (_req, res) => {
  try {
    res.json(await db.select().from(expenses).orderBy(desc(expenses.createdAt)));
  } catch (err) {
    console.error('list expenses error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des dépenses.' });
  }
});

/** POST /api/expenses — crée une dépense. */
expensesRouter.post('/', requireAuth, requireWrite('expenses'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    if (!f.label) return res.status(400).json({ error: 'Le libellé est requis.' });
    if (f.amount <= 0) return res.status(400).json({ error: 'Le montant doit être positif.' });
    const id = generateId('DEP');
    const [created] = await db
      .insert(expenses)
      .values({ id, ...f, createdBy: req.user?.name ?? null })
      .returning();
    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Dépense enregistrée : ${created.label} (${created.amount})`,
      module: 'Dépenses',
      entityId: id,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error('create expense error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la dépense.' });
  }
});

/** PUT /api/expenses/:id — met à jour une dépense. */
expensesRouter.put('/:id', requireAuth, requireWrite('expenses'), async (req: AuthedRequest, res) => {
  try {
    const f = pickFields(req.body ?? {});
    if (!f.label) return res.status(400).json({ error: 'Le libellé est requis.' });
    const [updated] = await db
      .update(expenses)
      .set({ ...f, updatedAt: new Date().toISOString() })
      .where(eq(expenses.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Dépense introuvable.' });
    res.json(updated);
  } catch (err) {
    console.error('update expense error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

/** DELETE /api/expenses/:id */
expensesRouter.delete('/:id', requireAuth, requireWrite('expenses'), async (req: AuthedRequest, res) => {
  try {
    const [deleted] = await db.delete(expenses).where(eq(expenses.id, req.params.id)).returning();
    if (!deleted) return res.status(404).json({ error: 'Dépense introuvable.' });
    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Suppression dépense : ${deleted.label}`,
      module: 'Dépenses',
      entityId: deleted.id,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete expense error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});
