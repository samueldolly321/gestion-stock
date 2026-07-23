import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { sales, products, clients, stockMovements, payments } from '../../db/schema.ts';
import { requireAuth, requireRole, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, computeProductStatus, writeAuditLog, nextDocNumber } from '../helpers.ts';

export const salesRouter = Router();

const CASHIER_ROLES = ['Super Admin', 'Admin', 'Manager', 'Commercial', 'Magasinier'];

/** GET /api/sales — historique des ventes (plus récentes d'abord). */
salesRouter.get('/', requireAuth, async (_req, res) => {
  try {
    res.json(await db.select().from(sales).orderBy(desc(sales.createdAt)));
  } catch (err) {
    console.error('list sales error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des ventes.' });
  }
});

/**
 * POST /api/sales — enregistre une vente (POS).
 * Transaction : insère la vente + génère un mouvement de sortie par article
 * (déduit le stock) + crédite les points de fidélité du client.
 */
salesRouter.post('/', requireAuth, requireRole(...CASHIER_ROLES), async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: 'La vente doit contenir au moins un article.' });
  }

  try {
    const saleId = generateId('SALE');
    const loyaltyEarned = Number(b.loyaltyPointsEarned) || 0;

    // Avance / reste : le montant encaissé peut être inférieur au total (vente à crédit).
    const totalAmount = Number(b.totalAmount) || 0;
    const paidAmount = b.paidAmount === undefined
      ? totalAmount
      : Math.max(0, Math.min(totalAmount, Number(b.paidAmount) || 0));
    const remaining = totalAmount - paidAmount;
    const paymentStatus = paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'unpaid';

    const saleType = b.type || 'invoice';

    const sale = await db.transaction(async (tx) => {
      // Numéro de facture légal (séquence continue) — factures uniquement.
      const invoiceNumber = saleType === 'invoice' ? await nextDocNumber(tx, 'invoice') : null;

      // 1. Enregistre la vente
      const [createdSale] = await tx
        .insert(sales)
        .values({
          id: saleId,
          invoiceNumber,
          type: saleType,
          clientId: b.clientId || 'PASSAGE',
          clientName: b.clientName ?? null,
          status: b.status || 'delivered',
          items,
          vatAmount: Number(b.vatAmount) || 0,
          totalAmount,
          paymentStatus,
          paymentMethod: b.paymentMethod ?? null,
          paidAmount,
          loyaltyPointsEarned: loyaltyEarned,
          notes: b.notes ?? null,
          cashierId: req.user!.sub,
          cashierName: req.user?.name ?? null,
          warehouseId: b.warehouseId ?? null,
          warehouseName: b.warehouseName ?? null,
        })
        .returning();

      // 2. Mouvement de sortie + déduction de stock pour chaque article
      for (const item of items) {
        const [product] = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (!product) continue; // article introuvable : on ignore

        let newQty = product.quantity - (Number(item.quantity) || 0);
        if (newQty < 0) newQty = 0;
        const status = computeProductStatus(newQty, product.minStock, product.expirationDate);

        await tx.insert(stockMovements).values({
          id: generateId('MVT'),
          type: 'exit_sale',
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          warehouseId: product.locationId ?? null,
          quantity: Number(item.quantity) || 0,
          reason: `Vente POS Réf: ${saleId}`,
          performedBy: req.user?.name ?? 'POS',
          referenceId: saleId,
          costPrice: product.purchasePrice,
          costTotal: product.purchasePrice * (Number(item.quantity) || 0),
        });

        await tx
          .update(products)
          .set({ quantity: newQty, status, updatedAt: new Date().toISOString() })
          .where(eq(products.id, product.id));
      }

      // 3. Créance : le reste dû augmente le solde (balance) du client.
      if (remaining > 0 && b.clientId && b.clientId !== 'PASSAGE') {
        await tx
          .update(clients)
          .set({ balance: sql`${clients.balance} + ${remaining}` })
          .where(eq(clients.id, b.clientId));
      }

      // 4. Historique : enregistre l'encaissement initial (avance).
      if (paidAmount > 0) {
        await tx.insert(payments).values({
          id: generateId('PAY'),
          kind: 'sale',
          refId: saleId,
          partyId: b.clientId ?? null,
          partyName: b.clientName ?? null,
          amount: paidAmount,
          method: b.paymentMethod ?? null,
          note: 'Encaissement à la vente',
          createdBy: req.user?.name ?? null,
        });
      }

      // 5. Crédite les points fidélité du client (si client identifié)
      if (b.clientId && b.clientId !== 'PASSAGE' && loyaltyEarned > 0) {
        await tx
          .update(clients)
          .set({ loyaltyPoints: sql`${clients.loyaltyPoints} + ${loyaltyEarned}` })
          .where(eq(clients.id, b.clientId));
      }

      return createdSale;
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Vente POS encaissée (${sale.invoiceNumber || saleId}, total ${sale.totalAmount})`,
      module: 'Ventes',
      entityId: saleId,
    });

    res.status(201).json(sale);
  } catch (err) {
    console.error('create sale error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'encaissement de la vente.' });
  }
});

const PAY_ROLES = ['Super Admin', 'Admin', 'Manager', 'Commercial', 'Comptable'];

/** POST /api/sales/:id/pay — enregistre un règlement client (réduit le reste dû). */
salesRouter.post('/:id/pay', requireAuth, requireRole(...PAY_ROLES), async (req: AuthedRequest, res) => {
  try {
    const amount = Number(req.body?.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'Montant de règlement invalide.' });
    const [sale] = await db.select().from(sales).where(eq(sales.id, req.params.id)).limit(1);
    if (!sale) return res.status(404).json({ error: 'Vente introuvable.' });

    const already = sale.paidAmount || 0;
    const applied = Math.min(amount, sale.totalAmount - already);
    if (applied <= 0) return res.status(409).json({ error: 'Cette vente est déjà entièrement réglée.' });
    const paidAmount = already + applied;
    const paymentStatus = paidAmount >= sale.totalAmount ? 'paid' : 'partially_paid';

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(sales)
        .set({ paidAmount, paymentStatus })
        .where(eq(sales.id, sale.id))
        .returning();
      if (sale.clientId && sale.clientId !== 'PASSAGE') {
        await tx
          .update(clients)
          .set({ balance: sql`GREATEST(0, ${clients.balance} - ${applied})` })
          .where(eq(clients.id, sale.clientId));
      }
      await tx.insert(payments).values({
        id: generateId('PAY'),
        kind: 'sale',
        refId: sale.id,
        partyId: sale.clientId ?? null,
        partyName: sale.clientName ?? null,
        amount: applied,
        method: req.body?.method ?? null,
        note: req.body?.note ?? 'Règlement',
        createdBy: req.user?.name ?? null,
      });
      return row;
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Règlement client ${applied} (Réf ${sale.id}) — ${paymentStatus}`,
      module: 'Règlements',
      entityId: sale.id,
    });
    res.json(updated);
  } catch (err) {
    console.error('pay sale error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement du règlement.' });
  }
});

/**
 * POST /api/sales/:id/credit-note — établit un AVOIR (note de crédit) sur une facture.
 * Corps : { lines: [{ productId, quantity }], reason?, restock? }.
 * Transaction :
 *   - valide les quantités retournées (≤ facturées − déjà avoirées),
 *   - crée un avoir (type 'return', montants négatifs, n° AV-xxxxxx, relatedSaleId),
 *   - réintègre le stock (mouvement entry_return) sauf si restock === false,
 *   - impute l'avoir sur le reste dû de la facture puis réduit le solde client
 *     (peut devenir un crédit client si la facture était déjà réglée),
 *   - déduit les points fidélité au prorata, trace un règlement négatif + journal.
 */
salesRouter.post('/:id/credit-note', requireAuth, requireRole(...CASHIER_ROLES), async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  const requested = Array.isArray(b.lines) ? b.lines : [];
  if (requested.length === 0) {
    return res.status(400).json({ error: 'Sélectionnez au moins une ligne à créditer.' });
  }
  const restock = b.restock !== false; // par défaut on remet en stock
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';

  try {
    const [invoice] = await db.select().from(sales).where(eq(sales.id, req.params.id)).limit(1);
    if (!invoice) return res.status(404).json({ error: 'Facture introuvable.' });
    if (invoice.type !== 'invoice') {
      return res.status(400).json({ error: 'Un avoir ne peut être établi que sur une facture.' });
    }

    const invoiceItems = (invoice.items as any[]) || [];
    const invoiceGoodsHT = invoiceItems.reduce((a, it) => a + (Number(it.total) || 0), 0);

    const result = await db.transaction(async (tx) => {
      // Quantités déjà avoirées par produit (avoirs antérieurs liés à cette facture).
      const priorCredits = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.relatedSaleId, invoice.id), eq(sales.type, 'return')));
      const alreadyReturned: Record<string, number> = {};
      for (const cn of priorCredits) {
        for (const it of (cn.items as any[]) || []) {
          alreadyReturned[it.productId] = (alreadyReturned[it.productId] || 0) + Math.abs(Number(it.quantity) || 0);
        }
      }

      // Construit les lignes de l'avoir (prix/nom repris de la facture, jamais du client).
      const creditItems: any[] = [];
      let creditGoodsHT = 0;
      for (const line of requested) {
        const qty = Math.floor(Number(line.quantity) || 0);
        if (qty <= 0) continue;
        const src = invoiceItems.find((it) => it.productId === line.productId);
        if (!src) throw new Error(`Article ${line.productId} absent de la facture.`);
        const returnable = (Number(src.quantity) || 0) - (alreadyReturned[src.productId] || 0);
        if (qty > returnable) {
          throw new Error(`Quantité à créditer (${qty}) supérieure au retournable (${returnable}) pour ${src.productName}.`);
        }
        // Montant HT crédité au prorata de la ligne (gère une éventuelle remise).
        const lineHT = Math.round((Number(src.total) || 0) * (qty / (Number(src.quantity) || 1)));
        creditGoodsHT += lineHT;
        creditItems.push({
          productId: src.productId, productName: src.productName, sku: src.sku,
          quantity: -qty, unitPrice: Number(src.unitPrice) || 0,
          discount: Number(src.discount) || 0, tax: Number(src.tax) || 0, total: -lineHT,
        });
      }
      if (creditItems.length === 0) throw new Error('Aucune quantité valide à créditer.');

      // TVA et TTC crédités au prorata du HT (un retour total redonne exactement la facture).
      const creditVAT = invoiceGoodsHT > 0
        ? Math.round((Number(invoice.vatAmount) || 0) * (creditGoodsHT / invoiceGoodsHT))
        : 0;
      const creditTTC = creditGoodsHT + creditVAT;

      const creditNoteId = generateId('CN');
      const creditNumber = await nextDocNumber(tx, 'credit_note');

      // 1. Enregistre l'avoir (montants négatifs).
      const [createdCn] = await tx.insert(sales).values({
        id: creditNoteId,
        invoiceNumber: creditNumber,
        type: 'return',
        relatedSaleId: invoice.id,
        clientId: invoice.clientId,
        clientName: invoice.clientName ?? null,
        status: 'returned',
        items: creditItems,
        vatAmount: -creditVAT,
        totalAmount: -creditTTC,
        paymentStatus: 'paid', // neutre en créances (reste = 0)
        paymentMethod: invoice.paymentMethod ?? null,
        paidAmount: -creditTTC,
        loyaltyPointsEarned: 0,
        notes: reason ? `Avoir sur ${invoice.invoiceNumber || invoice.id} — ${reason}` : `Avoir sur ${invoice.invoiceNumber || invoice.id}`,
        cashierId: req.user!.sub,
        cashierName: req.user?.name ?? null,
        warehouseId: invoice.warehouseId ?? null,
        warehouseName: invoice.warehouseName ?? null,
      }).returning();

      // 2. Réintégration du stock (sauf marchandise détruite).
      if (restock) {
        for (const it of creditItems) {
          const returnedQty = Math.abs(Number(it.quantity) || 0);
          const [product] = await tx.select().from(products).where(eq(products.id, it.productId)).limit(1);
          if (!product) continue;
          const newQty = product.quantity + returnedQty;
          const status = computeProductStatus(newQty, product.minStock, product.expirationDate);
          await tx.insert(stockMovements).values({
            id: generateId('MVT'),
            type: 'entry_return',
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            warehouseId: product.locationId ?? null,
            quantity: returnedQty,
            reason: `Avoir ${creditNumber} (facture ${invoice.invoiceNumber || invoice.id})`,
            performedBy: req.user?.name ?? 'Avoir',
            referenceId: creditNoteId,
            costPrice: product.purchasePrice,
            costTotal: product.purchasePrice * returnedQty,
          });
          await tx.update(products)
            .set({ quantity: newQty, status, updatedAt: new Date().toISOString() })
            .where(eq(products.id, product.id));
        }
      }

      // 3. Impute l'avoir sur le reste dû de la facture (paidAmount ← settlement),
      //    puis réduit le solde client du montant total (excédent = crédit client).
      const applied = Math.min(creditTTC, invoice.totalAmount - (invoice.paidAmount || 0));
      if (applied > 0) {
        const newPaid = (invoice.paidAmount || 0) + applied;
        const newStatus = newPaid >= invoice.totalAmount ? 'paid' : newPaid > 0 ? 'partially_paid' : 'unpaid';
        await tx.update(sales).set({ paidAmount: newPaid, paymentStatus: newStatus }).where(eq(sales.id, invoice.id));
      }
      if (invoice.clientId && invoice.clientId !== 'PASSAGE') {
        // Solde non borné à 0 : un solde négatif représente un crédit dû au client.
        await tx.update(clients)
          .set({ balance: sql`${clients.balance} - ${creditTTC}` })
          .where(eq(clients.id, invoice.clientId));

        // Points fidélité repris au prorata du montant crédité.
        const pointsBack = invoice.totalAmount > 0
          ? Math.round((invoice.loyaltyPointsEarned || 0) * (creditTTC / invoice.totalAmount))
          : 0;
        if (pointsBack > 0) {
          await tx.update(clients)
            .set({ loyaltyPoints: sql`GREATEST(0, ${clients.loyaltyPoints} - ${pointsBack})` })
            .where(eq(clients.id, invoice.clientId));
        }
      }

      // 4. Trace un règlement négatif rattaché à la facture (visible dans son historique).
      await tx.insert(payments).values({
        id: generateId('PAY'),
        kind: 'credit_note',
        refId: invoice.id,
        partyId: invoice.clientId ?? null,
        partyName: invoice.clientName ?? null,
        amount: -creditTTC,
        method: null,
        note: reason ? `Avoir ${creditNumber} — ${reason}` : `Avoir ${creditNumber}`,
        createdBy: req.user?.name ?? null,
      });

      return createdCn;
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Avoir ${result.invoiceNumber} émis sur facture ${invoice.invoiceNumber || invoice.id} (montant ${Math.abs(result.totalAmount)})`,
      module: 'Avoirs',
      entityId: result.id,
    });

    res.status(201).json(result);
  } catch (err: any) {
    console.error('credit-note error:', err);
    const msg = typeof err?.message === 'string' && /créditer|retournable|facture|Article|Aucune/.test(err.message)
      ? err.message
      : 'Erreur lors de l\'établissement de l\'avoir.';
    res.status(400).json({ error: msg });
  }
});
