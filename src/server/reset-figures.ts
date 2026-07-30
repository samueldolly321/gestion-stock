/**
 * Cœur de la « remise à zéro des chiffres » — utilisé par la route admin
 * (POST /api/admin/reset-figures) déclenchée depuis Configuration ERP.
 *
 * GARDE : catalogue produits (+ catégories/marques/entrepôts), clients &
 * fournisseurs, tarifs négociés, utilisateurs, réglages.
 * REMET À ZÉRO : stock produits, soldes & fidélité clients, et purge toutes les
 * transactions (ventes, achats, règlements, dépenses, livraisons, inventaires,
 * mouvements, journal d'audit) + compteurs de numérotation.
 *
 * Opération atomique (transaction) : tout ou rien.
 * (La commande CLI équivalente est `npm run db:reset-figures`.)
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';

// Tables purgées entièrement. Constante figée (aucune entrée utilisateur) →
// interpolation via sql.raw sans risque d'injection.
const TABLES_TO_CLEAR = [
  'stock_movements',
  'sales',
  'payments',
  'purchases',
  'expenses',
  'deliveries',
  'inventory_audits',
  'audit_logs',
  'document_counters',
];

/** Exécute la remise à zéro. Renvoie le nb de lignes effacées par table. */
export async function resetFigures(): Promise<Record<string, number>> {
  const cleared: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const t of TABLES_TO_CLEAR) {
      const r: any = await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM ${t}`));
      cleared[t] = r.rows?.[0]?.n ?? 0;
    }
    await tx.execute(sql.raw(`TRUNCATE ${TABLES_TO_CLEAR.join(', ')} RESTART IDENTITY`));
    await tx.execute(sql`UPDATE products SET quantity = 0, status = 'out_of_stock', updated_at = now()`);
    await tx.execute(sql`UPDATE clients SET balance = 0, loyalty_points = 0`);
  });
  return cleared;
}
