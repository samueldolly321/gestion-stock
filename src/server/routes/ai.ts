import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { sales, products, expenses, purchases, stockMovements, deliveries } from '../../db/schema.ts';
import { requireAuth, requireAnyTab, type AuthedRequest } from '../auth-middleware.ts';
import { writeAuditLog } from '../helpers.ts';

export const aiRouter = Router();

// Modèle configurable (défaut : Claude Opus 4.8). Mettre AI_MODEL=claude-haiku-4-5 pour réduire le coût.
const AI_MODEL = process.env.AI_MODEL || 'claude-opus-4-8';

// Bornes [début, fin] + libellé de la période (jour courant ou mois courant).
function rangeFor(period: 'day' | 'month'): { start: number; end: number; label: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (period === 'month') {
    return {
      start: new Date(y, m, 1).getTime(),
      end: new Date(y, m + 1, 0, 23, 59, 59, 999).getTime(),
      label: new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    };
  }
  return {
    start: new Date(y, m, d, 0, 0, 0, 0).getTime(),
    end: new Date(y, m, d, 23, 59, 59, 999).getTime(),
    label: now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/**
 * POST /api/ai/summary — génère un résumé d'activité en langage naturel (Claude).
 * Corps : { period: 'day' | 'month' }. Agrège les chiffres serveur, puis appelle l'IA.
 */
aiRouter.post('/summary', requireAuth, requireAnyTab('dashboard', 'accounting'), async (req: AuthedRequest, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "L'IA n'est pas configurée : ajoutez la variable d'environnement ANTHROPIC_API_KEY." });
  }
  try {
    const period: 'day' | 'month' = req.body?.period === 'month' ? 'month' : 'day';
    const r = rangeFor(period);
    const inR = (ds?: string | null) => { if (!ds) return false; const t = new Date(ds).getTime(); return t >= r.start && t <= r.end; };

    // --- Chargement des données (volume actuel faible → filtrage en mémoire) ---
    const [allSales, allProducts, allExpenses, allPurchases, allMovements, allDeliveries] = await Promise.all([
      db.select().from(sales).orderBy(desc(sales.createdAt)),
      db.select().from(products),
      db.select().from(expenses),
      db.select().from(purchases),
      db.select().from(stockMovements),
      db.select().from(deliveries),
    ]);

    const salesIn = allSales.filter((s) => s.type !== 'return' && inR(s.createdAt));
    const deliveryFor = (saleId: string) => allDeliveries.filter((d) => d.saleId === saleId).reduce((a, d) => a + (Number(d.fee) || 0), 0);

    const caTTC = salesIn.reduce((a, s) => a + (Number(s.totalAmount) || 0), 0);
    const encaisse = salesIn.reduce((a, s) => a + (Number(s.paidAmount) || 0), 0);
    const caHT = salesIn.reduce((a, s) => a + ((Number(s.totalAmount) || 0) - (Number(s.vatAmount) || 0) - deliveryFor(s.id)), 0);

    // COGS au coût historique (mouvements exit_sale − entry_return sur la période).
    const cogs = allMovements.filter((mv) => inR(mv.createdAt)).reduce((a, mv) => {
      if (mv.type === 'exit_sale') return a + (Number(mv.costTotal) || 0);
      if (mv.type === 'entry_return') return a - (Number(mv.costTotal) || 0);
      return a;
    }, 0);
    const margeBrute = caHT - cogs;

    // Top produits vendus sur la période (quantité).
    const qtyByProduct: Record<string, { nom: string; qte: number; ca: number }> = {};
    for (const s of salesIn) {
      for (const it of ((s.items as any[]) || [])) {
        const key = it.productId;
        const q = Number(it.quantity) || 0;
        qtyByProduct[key] ||= { nom: it.productName || key, qte: 0, ca: 0 };
        qtyByProduct[key].qte += q;
        qtyByProduct[key].ca += q * (Number(it.unitPrice) || 0);
      }
    }
    const topProduits = Object.values(qtyByProduct).sort((a, b) => b.qte - a.qte).slice(0, 5);

    const ruptures = allProducts.filter((p) => p.status === 'out_of_stock').map((p) => p.name);
    const nbStockFaible = allProducts.filter((p) => p.status === 'low_stock').length;

    // Créances échues (échéance passée et reste dû > 0).
    const nowT = Date.now();
    const creancesEchues = allSales
      .filter((s) => s.type !== 'return' && s.dueDate && new Date(s.dueDate).getTime() < nowT && ((Number(s.totalAmount) || 0) - (Number(s.paidAmount) || 0)) > 0.5);
    const creancesEchuesTotal = creancesEchues.reduce((a, s) => a + ((Number(s.totalAmount) || 0) - (Number(s.paidAmount) || 0)), 0);

    const depenses = allExpenses.filter((e) => inR(e.date || e.createdAt)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const achatsIn = allPurchases.filter((p) => p.status !== 'cancelled' && inR(p.createdAt));

    const data = {
      periode: r.label,
      devise: 'Ariary (Ar)',
      ventes: { nombre: salesIn.length, caTTC: Math.round(caTTC), caHT: Math.round(caHT), encaisse: Math.round(encaisse), resteDu: Math.round(caTTC - encaisse) },
      margeBrute: Math.round(margeBrute),
      tauxMargePct: caHT > 0 ? Math.round((margeBrute / caHT) * 1000) / 10 : 0,
      depenses: Math.round(depenses),
      achats: { nombre: achatsIn.length, total: Math.round(achatsIn.reduce((a, p) => a + (Number(p.totalAmount) || 0), 0)) },
      topProduits: topProduits.map((p) => ({ nom: p.nom, qte: p.qte, ca: Math.round(p.ca) })),
      ruptures: ruptures.slice(0, 15),
      nbRuptures: ruptures.length,
      nbStockFaible,
      creancesEchues: { nombre: creancesEchues.length, total: Math.round(creancesEchuesTotal) },
    };

    const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system:
        "Tu es l'assistant d'un ERP de gestion de stock/ventes pour une entreprise à Madagascar (devise Ariary, « Ar »). " +
        "À partir des chiffres fournis, rédige un RÉSUMÉ D'ACTIVITÉ clair et concis en français (5 à 8 lignes, ton professionnel). " +
        "Mets en avant les points clés (ventes, chiffre d'affaires, marge, encaissements), puis les ALERTES si présentes " +
        "(ruptures de stock, créances échues, faible marge) et termine par une recommandation courte et actionnable si pertinent. " +
        "Utilise les montants tels quels, en Ariary (ex. « 450 000 Ar »). N'invente aucun chiffre absent des données. " +
        "Réponds UNIQUEMENT avec le résumé, sans préambule ni titre.",
      messages: [{ role: 'user', content: `Chiffres de la période :\n${JSON.stringify(data, null, 2)}` }],
    });

    const summary = message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Résumé d'activité IA généré (${period === 'month' ? 'mois' : 'jour'})`,
      module: 'IA',
    });

    res.json({ summary, period, label: r.label });
  } catch (err: any) {
    console.error('ai summary error:', err);
    const msg = err?.status === 401
      ? 'Clé ANTHROPIC_API_KEY invalide.'
      : err?.status === 429
      ? 'Limite de requêtes IA atteinte, réessayez dans un instant.'
      : "Erreur lors de la génération du résumé IA.";
    res.status(500).json({ error: msg });
  }
});
