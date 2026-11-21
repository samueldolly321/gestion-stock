import { Router } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { sales, products, clients, stockMovements, payments } from '../../db/schema.ts';
import { requireAuth, requireRole, requireAnyTab, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, computeProductStatus, writeAuditLog, nextDocNumber } from '../helpers.ts';
import { adjustWarehouseStock, resolveWarehouseId, lockProducts, StockError, getWarehouseStock } from '../stock.ts';
import { recipeCost, optionCost } from '../../services/recipes.ts';
import type { RecipeItem, DishOption } from '../../types.ts';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Ingrédients (articles stockés) d'une liste de recettes, indexés par id. */
async function loadIngredients(recipes: (RecipeItem[] | null | undefined)[]) {
  const ids = [...new Set(recipes.flatMap((r) => (r || []).map((l) => l.ingredientId)))];
  if (ids.length === 0) return new Map<string, typeof products.$inferSelect>();
  const rows = await db.select().from(products).where(inArray(products.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}
import { SerialError, cleanSerials, sellSerials, returnSerials } from './serials.ts';

export const salesRouter = Router();

const CASHIER_ROLES = ['Super Admin', 'Admin', 'Manager', 'Commercial', 'Caissier', 'Magasinier'];

/** GET /api/sales — historique des ventes (plus récentes d'abord). */
salesRouter.get('/', requireAuth, requireAnyTab('dashboard', 'pos', 'receivables', 'accounting', 'calendar', 'sales'), async (_req, res) => {
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
    const saleType = b.type || 'invoice';

    // --- Recalcul serveur des montants (anti-falsification) + garde-fou vente à perte ---
    // On ne fait JAMAIS confiance à totalAmount/vatAmount/loyaltyPointsEarned envoyés par
    // le client : ils sont recalculés depuis les articles et les prix lus en base.
    const applyVat = b.applyVat !== undefined
      ? !!b.applyVat
      : items.some((it: any) => (Number(it.tax) || 0) > 0); // repli : TVA si des taux sont présents
    const discountPercent = Math.min(100, Math.max(0, Number(b.discountPercent) || 0));
    const deliveryFee = Math.max(0, Number(b.deliveryFee) || 0);

    let subtotal = 0, vat = 0;
    const normalizedItems: any[] = [];
    for (const it of items) {
      const [product] = await db.select().from(products).where(eq(products.id, it.productId)).limit(1);
      // Quantité décimale autorisée (poids/volume) ; arrondie à 3 décimales pour éviter le bruit flottant.
      const quantity = Math.max(0, Math.round((Number(it.quantity) || 0) * 1000) / 1000);
      const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
      // Garde-fou marge : refus si prix de vente sous le prix d'achat (sauf avoir/retour).
      if (product?.trackSerial && !Number.isInteger(quantity)) {
        return res.status(400).json({ error: `« ${product.name} » se vend à l'unité (quantité entière).` });
      }
      // Plat (restauration) : le coût de revient vient de la recette (Σ ingrédients) + suppléments choisis.
      let dish: {
        cost: number;
        recipe: { ingredientId: string; name: string; unit: string; perPortion: number }[];
        options: { id: string; label: string; price: number; ingredientId: string; name: string; unit: string; quantity: number; cost: number }[];
      } | null = null;
      if (product?.kind === 'dish') {
        const recipe = (product.recipe || []) as RecipeItem[];
        const available = (product.options || []) as DishOption[];
        // Suppléments demandés : seuls ceux définis sur la fiche du plat (prix et ingrédient relus en base).
        const askedIds = [...new Set((Array.isArray(it.options) ? it.options : []).map((o: any) => (typeof o === 'string' ? o : o?.id)).filter(Boolean))] as string[];
        const unknown = askedIds.filter((id) => !available.some((o) => o.id === id));
        if (unknown.length) {
          return res.status(400).json({ error: `Supplément inconnu pour « ${product.name} » (la carte a peut-être changé) : rechargez la caisse.` });
        }
        const chosen = available.filter((o) => askedIds.includes(o.id));
        const ingredients = await loadIngredients([recipe, chosen.map((o) => ({ ingredientId: o.ingredientId, quantity: o.quantity }))]);
        const options = chosen.filter((o) => ingredients.has(o.ingredientId)).map((o) => {
          const ing = ingredients.get(o.ingredientId)!;
          return { id: o.id, label: o.label, price: o.price, ingredientId: o.ingredientId, name: ing.name, unit: ing.unit, quantity: o.quantity, cost: optionCost(o, ingredients) };
        });
        dish = {
          cost: Math.round((recipeCost(recipe, ingredients) + options.reduce((s, o) => s + o.cost, 0)) * 100) / 100,
          recipe: recipe.filter((l) => ingredients.has(l.ingredientId)).map((l) => {
            const ing = ingredients.get(l.ingredientId)!;
            return { ingredientId: l.ingredientId, name: ing.name, unit: ing.unit, perPortion: l.quantity };
          }),
          options,
        };
      }
      const costFloor = dish ? dish.cost : product?.purchasePrice ?? 0;
      if (product && saleType !== 'return' && unitPrice < costFloor) {
        return res.status(400).json({
          error: dish
            ? `Vente à perte refusée pour « ${product.name} » : prix de vente (${unitPrice}) inférieur au coût de revient de la recette (${Math.round(costFloor)}).`
            : `Vente à perte refusée pour « ${product.name} » : prix de vente (${unitPrice}) inférieur au prix d'achat (${product.purchasePrice}).`,
        });
      }
      const lineHT = quantity * unitPrice;
      subtotal += lineHT;
      const tax = applyVat ? (Number(it.tax) || 0) : 0;
      if (applyVat) vat += lineHT * (tax / 100);
      normalizedItems.push({
        productId: it.productId,
        productName: product?.name ?? it.productName ?? null,
        sku: product?.sku ?? it.sku ?? null,
        quantity,
        unitPrice,
        discount: Number(it.discount) || 0,
        tax,
        total: lineHT,
        // Affichage « vente en gros » (n'affecte ni stock ni montants : quantity est en pièces).
        unitLabel: it.unitLabel ?? null,
        packQty: it.packQty != null ? Math.round(Number(it.packQty)) : null,
        // Articles suivis à l'unité : numéros vendus (vérifiés dans la transaction).
        serials: product?.trackSerial ? cleanSerials(it.serials) : undefined,
        warrantyUntil: null as string | null,
        // Plat : recette figée au moment de la vente + coût de revient + manques éventuels.
        kind: dish ? 'dish' : undefined,
        cost: dish ? dish.cost : undefined,
        recipe: dish ? dish.recipe : undefined,
        options: dish && dish.options.length ? dish.options : undefined,
        shortages: undefined as { ingredientId: string; name: string; unit: string; missing: number }[] | undefined,
      });
    }
    const discountAmount = subtotal * (discountPercent / 100);
    const goodsTotal = subtotal + vat - discountAmount;
    const totalAmount = Math.max(0, Math.round(goodsTotal + deliveryFee));
    const vatAmount = Math.round(vat);
    // Fidélité : 1 point / 10 (marchandises hors livraison), calculée serveur.
    const loyaltyEarned = Math.floor(Math.max(0, goodsTotal) / 10);

    // Avance / reste : le montant encaissé peut être inférieur au total (vente à crédit).
    const paidAmount = b.paidAmount === undefined
      ? totalAmount
      : Math.max(0, Math.min(totalAmount, Number(b.paidAmount) || 0));
    const remaining = totalAmount - paidAmount;
    const paymentStatus = paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'unpaid';

    const sale = await db.transaction(async (tx) => {
      // Plusieurs caisses : verrouille les articles de la vente (ordre fixe, sans interblocage).
      // (Plats : on verrouille aussi leurs ingrédients, dans le même ordre global.)
      await lockProducts(tx, [
        ...normalizedItems.map((it) => it.productId),
        ...normalizedItems.flatMap((it) => (it.recipe || []).map((l: any) => l.ingredientId)),
        ...normalizedItems.flatMap((it) => (it.options || []).map((o: any) => o.ingredientId)),
      ]);
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
          items: normalizedItems,
          vatAmount,
          totalAmount,
          paymentStatus,
          paymentMethod: b.paymentMethod ?? null,
          paidAmount,
          dueDate: remaining > 0 ? (b.dueDate || null) : null, // échéance seulement s'il reste dû
          loyaltyPointsEarned: loyaltyEarned,
          notes: b.notes ?? null,
          cashierId: req.user!.sub,
          cashierName: req.user?.name ?? null,
          warehouseId: b.warehouseId ?? null,
          warehouseName: b.warehouseName ?? null,
        })
        .returning();

      // 2. Mouvement de sortie + déduction de stock (par entrepôt) pour chaque article.
      //    L'entrepôt vendeur est l'entrepôt actif de la caisse (b.warehouseId), avec repli.
      for (const item of normalizedItems) {
        const [product] = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (!product) continue; // article introuvable : on ignore
        const qty = Number(item.quantity) || 0;

        // Plat : pas de stock propre — on retire chaque ingrédient de la recette.
        // Un plat servi ne redevient pas un ingrédient : un retour ne remet rien en stock.
        // Ingrédient insuffisant : la vente passe quand même (le service ne doit pas être
        // bloqué par un stock mal saisi) ; le stock reste à 0 et le manque est noté sur la ligne.
        if (product.kind === 'dish') {
          if (saleType === 'return') continue;
          const shortages: { ingredientId: string; name: string; unit: string; missing: number }[] = [];
          // Besoins par portion, cumulés par ingrédient : recette + suppléments choisis.
          const perPortion = new Map<string, number>();
          for (const l of item.recipe || []) perPortion.set(l.ingredientId, (perPortion.get(l.ingredientId) || 0) + l.perPortion);
          for (const o of item.options || []) perPortion.set(o.ingredientId, (perPortion.get(o.ingredientId) || 0) + o.quantity);
          const label = (item.options || []).length ? `${product.name} + ${item.options.map((o: any) => o.label.replace(/^\+\s*/, '')).join(' + ')}` : product.name;
          for (const [ingredientId, portionQty] of perPortion) {
            const [ing] = await tx.select().from(products).where(eq(products.id, ingredientId)).limit(1);
            if (!ing) continue;
            const need = round3(portionQty * qty);
            if (need <= 0) continue;
            const ingWh = await resolveWarehouseId(tx, b.warehouseId, ing.id);
            if (!ingWh) continue;
            const available = Math.max(0, await getWarehouseStock(tx, ing.id, ingWh));
            const taken = round3(Math.min(need, available));
            if (taken < need) shortages.push({ ingredientId: ing.id, name: ing.name, unit: ing.unit, missing: round3(need - taken) });
            if (taken <= 0) continue;
            await tx.insert(stockMovements).values({
              id: generateId('MVT'),
              type: 'exit_sale',
              productId: ing.id,
              productName: ing.name,
              sku: ing.sku,
              warehouseId: ingWh,
              quantity: taken,
              reason: `Vente « ${label} » ×${qty} Réf: ${saleId}`,
              performedBy: req.user?.name ?? 'POS',
              referenceId: saleId,
              costPrice: ing.purchasePrice,
              costTotal: ing.purchasePrice * taken,
            });
            await adjustWarehouseStock(tx, ing.id, ingWh, -taken);
          }
          if (shortages.length) item.shortages = shortages;
          continue;
        }

        const whId = await resolveWarehouseId(tx, b.warehouseId, product.id);

        // Numéros de série / IMEI : chaque pièce vendue doit être identifiée (garantie client).
        if (product.trackSerial && saleType !== 'return') {
          item.warrantyUntil = await sellSerials(tx, {
            product, serials: item.serials || [], quantity: qty, warehouseId: whId, saleId, invoiceNumber,
            clientId: b.clientId && b.clientId !== 'PASSAGE' ? b.clientId : null,
            clientName: b.clientName ?? null, by: req.user?.name ?? null,
          });
        }

        await tx.insert(stockMovements).values({
          id: generateId('MVT'),
          type: 'exit_sale',
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          warehouseId: whId,
          quantity: qty,
          reason: `Vente POS Réf: ${saleId}`,
          performedBy: req.user?.name ?? 'POS',
          referenceId: saleId,
          costPrice: product.purchasePrice,
          costTotal: product.purchasePrice * qty,
        });

        if (whId) {
          // strict : refuse la vente si le stock relu sous verrou ne suffit plus
          await adjustWarehouseStock(tx, product.id, whId, -qty, { strict: saleType !== 'return' });
        } else {
          // Aucun entrepôt (cas dégénéré) : repli sur le total global.
          const newQty = Math.max(0, product.quantity - qty);
          await tx.update(products)
            .set({ quantity: newQty, status: computeProductStatus(newQty, product.minStock, product.expirationDate), updatedAt: new Date().toISOString() })
            .where(eq(products.id, product.id));
        }
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

      // Lignes enrichies (fin de garantie des articles suivis, manques d'ingrédients) → reçu.
      if (normalizedItems.some((it) => it.serials?.length || it.shortages?.length)) {
        const [withWarranty] = await tx.update(sales).set({ items: normalizedItems }).where(eq(sales.id, saleId)).returning();
        return withWarranty;
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
    if (err instanceof SerialError) return res.status(400).json({ error: err.message });
    if (err instanceof StockError) return res.status(409).json({ error: err.message });
    console.error('create sale error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'encaissement de la vente.' });
  }
});

const PAY_ROLES = ['Super Admin', 'Admin', 'Manager', 'Commercial', 'Caissier', 'Comptable'];

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
        // Solde non borné à 0 : cohérent avec l'avoir. Un solde négatif = crédit client
        // (borner à 0 ici effaçait par erreur un crédit issu d'un avoir antérieur).
        await tx
          .update(clients)
          .set({ balance: sql`${clients.balance} - ${applied}` })
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

    const rawItems = (invoice.items as any[]) || [];
    const invoiceGoodsHT = rawItems.reduce((a, it) => a + (Number(it.total) || 0), 0);
    // Un même plat peut figurer sur plusieurs lignes (suppléments différents) : pour l'avoir,
    // on raisonne par article (quantités et montants cumulés).
    const invoiceItems = Object.values(rawItems.reduce((acc: Record<string, any>, it) => {
      const cur = acc[it.productId];
      if (!cur) acc[it.productId] = { ...it };
      else {
        cur.quantity = (Number(cur.quantity) || 0) + (Number(it.quantity) || 0);
        cur.total = (Number(cur.total) || 0) + (Number(it.total) || 0);
        if (Array.isArray(it.serials)) cur.serials = [...(cur.serials || []), ...it.serials];
      }
      return acc;
    }, {})) as any[];

    const result = await db.transaction(async (tx) => {
      await lockProducts(tx, requested.map((r: any) => r?.productId));
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
        const qty = Math.max(0, Math.round((Number(line.quantity) || 0) * 1000) / 1000);
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
          // Appareils suivis : numéros retournés (vérifiés plus bas)
          serials: Array.isArray(src.serials) && src.serials.length ? cleanSerials(line.serials) : undefined,
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

      // 1b. Numéros de série retournés : remis en stock, ou « défectueux » si non réintégrés.
      for (const it of creditItems) {
        if (!it.serials) continue;
        const whId = await resolveWarehouseId(tx, invoice.warehouseId, it.productId);
        await returnSerials(tx, {
          productName: it.productName, productId: it.productId, serials: it.serials, quantity: Math.abs(Number(it.quantity) || 0),
          invoiceId: invoice.id, restock, warehouseId: whId, creditNumber, by: req.user?.name ?? null,
        });
      }

      // 2. Réintégration du stock (sauf marchandise détruite) dans l'entrepôt de la facture.
      if (restock) {
        for (const it of creditItems) {
          const returnedQty = Math.abs(Number(it.quantity) || 0);
          const [product] = await tx.select().from(products).where(eq(products.id, it.productId)).limit(1);
          // Plat : un plat servi ne redevient pas un ingrédient → rien à remettre en stock.
          if (!product || product.kind === 'dish') continue;
          const whId = await resolveWarehouseId(tx, invoice.warehouseId, product.id);
          await tx.insert(stockMovements).values({
            id: generateId('MVT'),
            type: 'entry_return',
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            warehouseId: whId,
            quantity: returnedQty,
            reason: `Avoir ${creditNumber} (facture ${invoice.invoiceNumber || invoice.id})`,
            performedBy: req.user?.name ?? 'Avoir',
            referenceId: creditNoteId,
            costPrice: product.purchasePrice,
            costTotal: product.purchasePrice * returnedQty,
          });
          if (whId) {
            await adjustWarehouseStock(tx, product.id, whId, returnedQty);
          } else {
            const newQty = product.quantity + returnedQty;
            await tx.update(products)
              .set({ quantity: newQty, status: computeProductStatus(newQty, product.minStock, product.expirationDate), updatedAt: new Date().toISOString() })
              .where(eq(products.id, product.id));
          }
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
    const msg = err instanceof SerialError || (typeof err?.message === 'string' && /créditer|retournable|facture|Article|Aucune/.test(err.message))
      ? err.message
      : 'Erreur lors de l\'établissement de l\'avoir.';
    res.status(400).json({ error: msg });
  }
});
