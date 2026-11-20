/**
 * Stock réel par entrepôt — point d'entrée UNIQUE de toute variation de stock.
 *
 * Modèle : la table `product_stock` porte la quantité d'un produit dans CHAQUE
 * entrepôt ; `products.quantity` est le TOTAL (somme des entrepôts), maintenu
 * comme cache dénormalisé pour l'affichage, les alertes et la comptabilité.
 *
 * Tous les flux (vente, réception, ajustement, transfert, inventaire, avoir)
 * passent par `adjustWarehouseStock` afin que la ligne entrepôt ET le total
 * restent toujours cohérents, dans la même transaction que le document.
 */
import { and, asc, eq } from 'drizzle-orm';
import { products, productStock, warehouses } from '../db/schema.ts';
import { generateId, computeProductStatus } from './helpers.ts';

/** Transaction Drizzle (ou l'instance db). Typé `any` faute d'export de type dédié. */
type Tx = any;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Résout l'entrepôt à mouvementer pour un produit :
 * 1. `preferredId` s'il pointe vers un entrepôt existant (entrepôt actif de la caisse,
 *    de la commande, de l'inventaire…) ;
 * 2. sinon l'entrepôt où le produit détient le PLUS de stock ;
 * 3. sinon la localisation de la fiche produit ;
 * 4. sinon le tout premier entrepôt.
 * Retourne `null` seulement si aucun entrepôt n'existe (impossible après migration).
 */
export async function resolveWarehouseId(
  tx: Tx,
  preferredId: string | null | undefined,
  productId: string,
): Promise<string | null> {
  if (preferredId) {
    const [w] = await tx.select().from(warehouses).where(eq(warehouses.id, preferredId)).limit(1);
    if (w) return preferredId;
  }
  const rows = await tx.select().from(productStock).where(eq(productStock.productId, productId));
  if (rows.length) {
    const best = rows.reduce((a: any, b: any) => ((Number(b.quantity) || 0) > (Number(a.quantity) || 0) ? b : a));
    return best.warehouseId;
  }
  const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
  if (product?.locationId) {
    const [w] = await tx.select().from(warehouses).where(eq(warehouses.id, product.locationId)).limit(1);
    if (w) return product.locationId;
  }
  const [first] = await tx.select().from(warehouses).orderBy(asc(warehouses.createdAt)).limit(1);
  return first?.id ?? null;
}

/**
 * Verrouille d'avance plusieurs articles, toujours dans le même ordre (tri par id), au
 * début d'une transaction qui en touche plusieurs (vente, réception, inventaire…).
 * Sans cela, deux transactions verrouillant A puis B et B puis A pourraient s'attendre
 * mutuellement (interblocage).
 */
export async function lockProducts(tx: Tx, productIds: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(productIds.filter(Boolean) as string[])].sort();
  for (const id of ids) await tx.select({ id: products.id }).from(products).where(eq(products.id, id)).for('update');
}

/** Stock insuffisant au moment de valider (relu sous verrou dans la transaction). */
export class StockError extends Error {
  constructor(public productName: string, public available: number, public requested: number) {
    super(
      `Stock insuffisant pour « ${productName} » : il n'en reste que ${available.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} ` +
      `(demandé : ${requested.toLocaleString('fr-FR', { maximumFractionDigits: 3 })}). ` +
      `Une autre caisse vient peut-être de le vendre — la vente n'a pas été enregistrée.`,
    );
  }
}

/** Quantité d'un produit dans un entrepôt (0 si aucune ligne). */
export async function getWarehouseStock(tx: Tx, productId: string, warehouseId: string): Promise<number> {
  const [row] = await tx
    .select()
    .from(productStock)
    .where(and(eq(productStock.productId, productId), eq(productStock.warehouseId, warehouseId)))
    .limit(1);
  return row?.quantity ?? 0;
}

/**
 * Recalcule `products.quantity` = somme des lignes d'entrepôt, met à jour le statut,
 * et retourne le nouveau total. Appelé après chaque variation.
 */
export async function recomputeProductTotal(tx: Tx, productId: string): Promise<number> {
  const rows = await tx.select().from(productStock).where(eq(productStock.productId, productId));
  const total = round3(rows.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0));
  const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
  const status = product ? computeProductStatus(total, product.minStock, product.expirationDate) : 'in_stock';
  await tx
    .update(products)
    .set({ quantity: total, status, updatedAt: new Date().toISOString() })
    .where(eq(products.id, productId));
  return total;
}

/**
 * Ajuste le stock d'un produit dans un entrepôt de `delta` (positif = entrée,
 * négatif = sortie), puis recalcule le total produit + le statut.
 * La ligne d'entrepôt est bornée à 0 sauf `clampZero: false`.
 * Retourne la quantité de l'entrepôt et le nouveau total.
 */
export async function adjustWarehouseStock(
  tx: Tx,
  productId: string,
  warehouseId: string,
  delta: number,
  opts: { clampZero?: boolean; strict?: boolean } = {},
): Promise<{ warehouseQty: number; totalQty: number }> {
  const clampZero = opts.clampZero !== false;
  // Plusieurs caisses en réseau : on VERROUILLE l'article jusqu'à la fin de la transaction.
  // Deux ventes (ou vente + réception) simultanées du même article passent donc l'une
  // après l'autre, et la seconde lit le stock déjà mis à jour par la première.
  const [product] = await tx.select().from(products).where(eq(products.id, productId)).for('update');
  const [existing] = await tx
    .select()
    .from(productStock)
    .where(and(eq(productStock.productId, productId), eq(productStock.warehouseId, warehouseId)))
    .limit(1)
    .for('update');

  const available = Number(existing?.quantity) || 0;
  // Vente : refus si le stock (relu sous verrou) ne suffit plus — ex. la dernière pièce
  // vient d'être vendue par une autre caisse.
  if (opts.strict && delta < 0 && round3(available + delta) < 0) {
    throw new StockError(product?.name || productId, available, -delta);
  }

  let newQty = available + delta;
  if (clampZero && newQty < 0) newQty = 0;
  newQty = round3(newQty);

  const now = new Date().toISOString();
  if (existing) {
    await tx.update(productStock).set({ quantity: newQty, updatedAt: now }).where(eq(productStock.id, existing.id));
  } else {
    await tx.insert(productStock).values({ id: generateId('PS'), productId, warehouseId, quantity: newQty });
  }

  const totalQty = await recomputeProductTotal(tx, productId);
  return { warehouseQty: newQty, totalQty };
}

/**
 * Fixe la quantité ABSOLUE d'un produit dans un entrepôt (utilisé à la création/édition
 * d'un produit et lors des inventaires). Recalcule le total ensuite.
 */
export async function setWarehouseStock(
  tx: Tx,
  productId: string,
  warehouseId: string,
  quantity: number,
): Promise<{ warehouseQty: number; totalQty: number }> {
  const current = await getWarehouseStock(tx, productId, warehouseId);
  return adjustWarehouseStock(tx, productId, warehouseId, round3(quantity) - current);
}
