/**
 * Numéros de série / IMEI (high-tech) — un appareil = une ligne `product_serials`.
 *
 * Règles :
 *  - le stock (`product_stock`) reste la référence des quantités ; un appareil « in_stock »
 *    est rattaché à l'entrepôt où il se trouve ;
 *  - enregistrer des numéros remplit d'abord les pièces déjà en stock SANS numéro (réception
 *    d'achat, inventaire…), le surplus est une nouvelle entrée en stock (mouvement) ;
 *  - un article suivi ne se vend qu'avec ses numéros (vérifiés côté serveur), la garantie
 *    client démarre à la vente ; un avoir remet le numéro en stock (ou « défectueux ») ;
 *  - transfert et perte se font appareil par appareil (le stock suit).
 */
import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { products, productSerials, productStock, stockMovements, warehouses } from '../../db/schema.ts';
import { requireAuth, requireWrite, type AuthedRequest } from '../auth-middleware.ts';
import { generateId, writeAuditLog } from '../helpers.ts';
import { adjustWarehouseStock } from '../stock.ts';

type Tx = any;
type SerialRow = typeof productSerials.$inferSelect;

export const serialsRouter = Router();

/** Erreur métier (→ HTTP 400 avec ce message). */
export class SerialError extends Error {}

/** Nettoie une liste de numéros : espaces retirés, vides et doublons supprimés (ordre conservé). */
export function cleanSerials(values: unknown): string[] {
  const list = Array.isArray(values) ? values : typeof values === 'string' ? values.split(/[\n,;]+/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const s = String(v ?? '').trim().replace(/\s+/g, '').slice(0, 64);
    if (s && !seen.has(s.toUpperCase())) {
      seen.add(s.toUpperCase());
      out.push(s);
    }
  }
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);
/** « 2027-11-18 » → « 18/11/2027 » (libellés de l'historique) */
const fr = (iso: string) => iso.split('-').reverse().join('/');

/** Fin de garantie : date de vente + N mois (AAAA-MM-JJ), null si pas de garantie. */
export function warrantyEnd(months: number, from = new Date()): string | null {
  if (!months || months <= 0) return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const event = (type: string, label: string, by?: string | null) => ({ at: new Date().toISOString(), type, label, by: by ?? null });

async function warehouseName(tx: Tx, id: string | null | undefined) {
  if (!id) return '';
  const [w] = await tx.select({ name: warehouses.name }).from(warehouses).where(eq(warehouses.id, id)).limit(1);
  return w?.name || '';
}

async function stockIn(tx: Tx, productId: string, warehouseId: string) {
  const [row] = await tx.select().from(productStock)
    .where(and(eq(productStock.productId, productId), eq(productStock.warehouseId, warehouseId))).limit(1);
  return Number(row?.quantity) || 0;
}

async function inStockSerialCount(tx: Tx, productId: string, warehouseId: string) {
  const rows = await tx.select({ id: productSerials.id }).from(productSerials)
    .where(and(eq(productSerials.productId, productId), eq(productSerials.status, 'in_stock'), eq(productSerials.warehouseId, warehouseId)));
  return rows.length;
}

// ---------------------------------------------------------------------------------------
// Vente / avoir (appelés depuis routes/sales.ts, dans la transaction du document)
// ---------------------------------------------------------------------------------------

/**
 * Marque vendus les numéros d'une ligne de vente. Vérifie : article suivi, nombre de numéros
 * = quantité, chaque numéro existe, appartient à l'article, est en stock dans l'entrepôt vendeur.
 * Retourne la fin de garantie appliquée.
 */
export async function sellSerials(
  tx: Tx,
  opts: { product: typeof products.$inferSelect; serials: string[]; quantity: number; warehouseId: string | null; saleId: string; invoiceNumber: string | null; clientId: string | null; clientName: string | null; by: string | null },
): Promise<string | null> {
  const { product, serials, quantity } = opts;
  if (serials.length === 0) throw new SerialError(`« ${product.name} » est suivi par numéro de série : scannez ou choisissez le(s) numéro(s) vendu(s).`);
  if (serials.length !== quantity) throw new SerialError(`« ${product.name} » : ${quantity} pièce(s) vendue(s) mais ${serials.length} numéro(s) de série.`);
  const rows: SerialRow[] = await tx.select().from(productSerials).where(inArray(productSerials.serial, serials));
  for (const s of serials) {
    const r = rows.find((x) => x.serial === s);
    if (!r) throw new SerialError(`Numéro de série inconnu : ${s}.`);
    if (r.productId !== product.id) throw new SerialError(`Le numéro ${s} n'appartient pas à « ${product.name} ».`);
    if (r.status !== 'in_stock') throw new SerialError(`Le numéro ${s} n'est pas en stock (déjà vendu ou retiré).`);
    if (opts.warehouseId && r.warehouseId && r.warehouseId !== opts.warehouseId) {
      throw new SerialError(`Le numéro ${s} se trouve dans un autre entrepôt (${await warehouseName(tx, r.warehouseId)}).`);
    }
  }
  const until = warrantyEnd(product.warrantyMonths || 0);
  const ref = opts.invoiceNumber || opts.saleId;
  for (const r of rows) {
    const updated = await tx.update(productSerials).set({
      status: 'sold',
      saleId: opts.saleId,
      invoiceNumber: opts.invoiceNumber,
      clientId: opts.clientId,
      clientName: opts.clientName,
      soldAt: today(),
      warrantyUntil: until,
      events: [...(r.events || []), event('sale', `Vendu (${ref})${opts.clientName ? ` à ${opts.clientName}` : ''}${until ? ` — garantie jusqu'au ${fr(until)}` : ''}`, opts.by)],
      updatedAt: new Date().toISOString(),
    }).where(and(eq(productSerials.id, r.id), eq(productSerials.status, 'in_stock'))).returning({ id: productSerials.id });
    if (updated.length !== 1) throw new SerialError(`Le numéro ${r.serial} vient d'être vendu par une autre caisse.`);
  }
  return until;
}

/** Avoir : les numéros retournés doivent avoir été vendus sur cette facture. */
export async function returnSerials(
  tx: Tx,
  opts: { productName: string; productId: string; serials: string[]; quantity: number; invoiceId: string; restock: boolean; warehouseId: string | null; creditNumber: string; by: string | null },
) {
  if (opts.serials.length !== opts.quantity) {
    throw new SerialError(`« ${opts.productName} » : choisissez les ${opts.quantity} numéro(s) de série retourné(s).`);
  }
  const rows: SerialRow[] = await tx.select().from(productSerials).where(inArray(productSerials.serial, opts.serials));
  for (const s of opts.serials) {
    const r = rows.find((x) => x.serial === s);
    if (!r || r.productId !== opts.productId || r.saleId !== opts.invoiceId || r.status !== 'sold') {
      throw new SerialError(`Le numéro ${s} n'a pas été vendu sur cette facture.`);
    }
  }
  for (const r of rows) {
    await tx.update(productSerials).set({
      status: opts.restock ? 'in_stock' : 'defective',
      warehouseId: opts.restock ? opts.warehouseId : r.warehouseId,
      saleId: null, invoiceNumber: null, clientId: null, clientName: null, soldAt: null, warrantyUntil: null,
      events: [...(r.events || []), event('return', `Retour (avoir ${opts.creditNumber})${opts.restock ? ' — remis en stock' : ' — défectueux, hors stock'}${r.clientName ? `, client ${r.clientName}` : ''}`, opts.by)],
      updatedAt: new Date().toISOString(),
    }).where(eq(productSerials.id, r.id));
  }
}

// ---------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------

/** GET /api/serials?productId=…&status=… — numéros d'un article (ou tous les « in_stock » pour la caisse). */
serialsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const conds = [];
    if (typeof req.query.productId === 'string') conds.push(eq(productSerials.productId, req.query.productId));
    if (typeof req.query.status === 'string') conds.push(eq(productSerials.status, req.query.status));
    const rows = await db.select().from(productSerials).where(conds.length ? and(...conds) : undefined);
    rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    res.json(rows);
  } catch (err) {
    console.error('list serials error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des numéros de série.' });
  }
});

/** GET /api/serials/lookup/:serial — fiche d'un appareil : article, statut, vente, garantie. */
serialsRouter.get('/lookup/:serial', requireAuth, async (req, res) => {
  try {
    const wanted = String(req.params.serial || '').trim().replace(/\s+/g, '');
    const all = await db.select().from(productSerials).where(eq(productSerials.serial, wanted)).limit(1);
    let row = all[0];
    if (!row) {
      // insensible à la casse (numéros alphanumériques)
      const rows = await db.select().from(productSerials);
      row = rows.find((r) => r.serial.toUpperCase() === wanted.toUpperCase()) as SerialRow;
    }
    if (!row) return res.status(404).json({ error: `Aucun appareil enregistré avec le numéro « ${wanted} ».` });
    const [product] = await db.select().from(products).where(eq(products.id, row.productId)).limit(1);
    const wh = await warehouseName(db, row.warehouseId);
    const warrantyActive = !!row.warrantyUntil && row.warrantyUntil >= today();
    res.json({ serial: row, product: product ? { id: product.id, name: product.name, sku: product.sku, warrantyMonths: product.warrantyMonths } : null, warehouseName: wh, warrantyActive });
  } catch (err) {
    console.error('lookup serial error:', err);
    res.status(500).json({ error: 'Erreur lors de la recherche du numéro.' });
  }
});

/**
 * POST /api/serials/register — enregistre des numéros pour un article dans un entrepôt.
 * Body : { productId, warehouseId, serials: string[] | "texte multi-lignes", costPrice? }
 * Les pièces déjà en stock sans numéro sont complétées d'abord ; le surplus entre en stock.
 */
serialsRouter.post('/register', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  try {
    const list = cleanSerials(b.serials);
    if (list.length === 0) return res.status(400).json({ error: 'Saisissez ou scannez au moins un numéro de série.' });
    if (list.length > 500) return res.status(400).json({ error: '500 numéros maximum en une fois.' });
    const [product] = await db.select().from(products).where(eq(products.id, b.productId)).limit(1);
    if (!product) return res.status(404).json({ error: 'Article introuvable.' });
    if (!product.trackSerial) return res.status(400).json({ error: "Cet article n'est pas suivi par numéro de série (activez-le dans sa fiche)." });
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, b.warehouseId || '')).limit(1);
    if (!wh) return res.status(400).json({ error: 'Choisissez un entrepôt.' });

    const existing = await db.select({ serial: productSerials.serial }).from(productSerials);
    const taken = new Set(existing.map((r) => r.serial.toUpperCase()));
    const dup = list.filter((s) => taken.has(s.toUpperCase()));
    if (dup.length) return res.status(409).json({ error: `Déjà enregistré${dup.length > 1 ? 's' : ''} : ${dup.slice(0, 10).join(', ')}${dup.length > 10 ? '…' : ''}.` });

    const result = await db.transaction(async (tx) => {
      const unassigned = Math.max(0, Math.floor((await stockIn(tx, product.id, wh.id)) - (await inStockSerialCount(tx, product.id, wh.id))));
      const fill = Math.min(unassigned, list.length);
      const added = list.length - fill;
      const by = req.user?.name ?? null;
      for (let i = 0; i < list.length; i++) {
        await tx.insert(productSerials).values({
          id: generateId('SN'),
          productId: product.id,
          serial: list[i],
          status: 'in_stock',
          warehouseId: wh.id,
          events: [event('entry', i < fill ? `Numéro enregistré (pièce déjà en stock, ${wh.name})` : `Entrée en stock (${wh.name})`, by)],
        });
      }
      if (added > 0) {
        await adjustWarehouseStock(tx, product.id, wh.id, added);
        const cost = Number(b.costPrice) >= 0 && b.costPrice !== undefined && b.costPrice !== '' ? Number(b.costPrice) : product.purchasePrice;
        await tx.insert(stockMovements).values({
          id: generateId('MVT'),
          type: 'entry_reception',
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          warehouseId: wh.id,
          warehouseName: wh.name,
          quantity: added,
          reason: `Entrée avec numéros de série (${added})`,
          performedBy: by ?? 'Système',
          referenceId: 'SERIALS',
          costPrice: cost,
          costTotal: cost * added,
        });
      }
      return { registered: list.length, filledExisting: fill, addedToStock: added };
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Numéros de série : ${list.length} enregistré(s) pour ${product.name}${result.addedToStock ? ` (+${result.addedToStock} en stock)` : ''}`,
      module: 'Articles',
      entityId: product.id,
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('register serials error:', err);
    res.status(500).json({ error: "Erreur lors de l'enregistrement des numéros de série." });
  }
});

/** POST /api/serials/:id/transfer — déplace UN appareil vers un autre entrepôt (le stock suit). */
serialsRouter.post('/:id/transfer', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const [row] = await db.select().from(productSerials).where(eq(productSerials.id, req.params.id)).limit(1);
    if (!row || row.status !== 'in_stock') return res.status(400).json({ error: "Seul un appareil en stock peut être transféré." });
    const [to] = await db.select().from(warehouses).where(eq(warehouses.id, req.body?.toWarehouseId || '')).limit(1);
    if (!to) return res.status(400).json({ error: "Choisissez l'entrepôt de destination." });
    if (to.id === row.warehouseId) return res.status(400).json({ error: "L'appareil est déjà dans cet entrepôt." });
    const [product] = await db.select().from(products).where(eq(products.id, row.productId)).limit(1);
    await db.transaction(async (tx) => {
      const fromId = row.warehouseId!;
      if ((await stockIn(tx, row.productId, fromId)) < 1) throw new SerialError("Stock insuffisant dans l'entrepôt d'origine.");
      const fromName = await warehouseName(tx, fromId);
      await adjustWarehouseStock(tx, row.productId, fromId, -1);
      await adjustWarehouseStock(tx, row.productId, to.id, 1);
      await tx.insert(stockMovements).values({
        id: generateId('MVT'), type: 'transfer', productId: row.productId, productName: product?.name, sku: product?.sku,
        warehouseId: to.id, warehouseName: to.name, fromWarehouseId: fromId, fromWarehouseName: fromName,
        quantity: 1, reason: `Transfert de l'appareil ${row.serial}`, performedBy: req.user?.name ?? 'Système', referenceId: row.id,
        costPrice: product?.purchasePrice || 0, costTotal: product?.purchasePrice || 0,
      });
      await tx.update(productSerials).set({
        warehouseId: to.id,
        events: [...(row.events || []), event('transfer', `Transféré de ${fromName} vers ${to.name}`, req.user?.name)],
        updatedAt: new Date().toISOString(),
      }).where(eq(productSerials.id, row.id));
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof SerialError) return res.status(400).json({ error: err.message });
    console.error('transfer serial error:', err);
    res.status(500).json({ error: 'Erreur lors du transfert.' });
  }
});

/** POST /api/serials/:id/lost — appareil perdu, volé ou défectueux : sort du stock. Body : { reason, defective? } */
serialsRouter.post('/:id/lost', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const [row] = await db.select().from(productSerials).where(eq(productSerials.id, req.params.id)).limit(1);
    if (!row || row.status !== 'in_stock') return res.status(400).json({ error: 'Seul un appareil en stock peut être retiré.' });
    const reason = String(req.body?.reason || '').trim().slice(0, 200) || 'Perte / casse';
    const defective = req.body?.defective === true;
    const [product] = await db.select().from(products).where(eq(products.id, row.productId)).limit(1);
    await db.transaction(async (tx) => {
      if (row.warehouseId) await adjustWarehouseStock(tx, row.productId, row.warehouseId, -1);
      await tx.insert(stockMovements).values({
        id: generateId('MVT'), type: 'waste_loss', productId: row.productId, productName: product?.name, sku: product?.sku,
        warehouseId: row.warehouseId, warehouseName: await warehouseName(tx, row.warehouseId),
        quantity: 1, reason: `${reason} — appareil ${row.serial}`, performedBy: req.user?.name ?? 'Système', referenceId: row.id,
        costPrice: product?.purchasePrice || 0, costTotal: product?.purchasePrice || 0,
      });
      await tx.update(productSerials).set({
        status: defective ? 'defective' : 'lost',
        events: [...(row.events || []), event('lost', `${defective ? 'Défectueux' : 'Retiré du stock'} : ${reason}`, req.user?.name)],
        updatedAt: new Date().toISOString(),
      }).where(eq(productSerials.id, row.id));
    });
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Appareil ${row.serial} retiré du stock (${reason})`, module: 'Articles', entityId: row.productId });
    res.json({ ok: true });
  } catch (err) {
    console.error('lost serial error:', err);
    res.status(500).json({ error: 'Erreur lors du retrait.' });
  }
});

/** DELETE /api/serials/:id — supprime un numéro saisi par erreur (appareil en stock ; le stock ne bouge pas). */
serialsRouter.delete('/:id', requireAuth, requireWrite('products'), async (req: AuthedRequest, res) => {
  try {
    const [row] = await db.select().from(productSerials).where(eq(productSerials.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ error: 'Numéro introuvable.' });
    if (row.status !== 'in_stock') return res.status(400).json({ error: "Un appareil vendu ou retiré fait partie de l'historique : il ne peut pas être supprimé." });
    await db.delete(productSerials).where(eq(productSerials.id, row.id));
    await writeAuditLog({ userId: req.user?.sub, userName: req.user?.name, action: `Numéro de série supprimé (erreur de saisie) : ${row.serial}`, module: 'Articles', entityId: row.productId });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete serial error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});
