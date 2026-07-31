/**
 * Remise à zéro des « chiffres » — mise en service / redémarrage propre.
 *
 * GARDE (données de référence) :
 *   - catalogue produits (+ catégories, marques, entrepôts)
 *   - clients & fournisseurs (fiches)
 *   - tarifs négociés (supplier_products, client_prices)
 *   - utilisateurs & réglages (settings)
 *
 * REMET À ZÉRO :
 *   - stock de chaque produit (quantity = 0, statut = rupture)
 *   - soldes clients (créances/avances) et points de fidélité
 *   - toutes les transactions : ventes, achats, règlements, dépenses,
 *     livraisons, inventaires, mouvements de stock, journal d'audit
 *   - compteurs de numérotation légale (factures / avoirs repartent à 1)
 *
 * ⚠️ Opération DESTRUCTIVE et IRRÉVERSIBLE. Par sécurité, elle ne s'exécute que
 * si l'argument --confirm est fourni.
 *
 * Usage :
 *   npm run db:reset-figures            → affiche ce qui sera fait, PUIS S'ARRÊTE
 *   npm run db:reset-figures -- --confirm   → exécute réellement la remise à zéro
 *
 * En production : à lancer depuis le Shell du service sur Render (DATABASE_URL
 * y est déjà défini). Fais une sauvegarde avant si possible.
 */
import 'dotenv/config';
import { createPool } from './index.ts';

// Tables purgées entièrement (transactions / historique). Pas de FK bloquante :
// stock_movements référence products mais on ne vide QUE la table enfant.
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

async function main() {
  const confirmed = process.argv.slice(2).includes('--confirm');
  const pool = createPool();

  try {
    // Aperçu : combien de lignes vont être effacées / remises à zéro.
    const counts: Record<string, number> = {};
    for (const t of TABLES_TO_CLEAR) {
      const r = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
      counts[t] = r.rows[0].n;
    }
    const prod = await pool.query('SELECT count(*)::int AS n FROM products');
    const cli = await pool.query('SELECT count(*)::int AS n FROM clients');
    const sup = await pool.query('SELECT count(*)::int AS n FROM suppliers');

    console.log('\n=== Remise à zéro des chiffres — Vokatra-ko ===\n');
    console.log('CONSERVÉ :');
    console.log(`  • ${prod.rows[0].n} produit(s) (stock remis à 0)`);
    console.log(`  • ${cli.rows[0].n} client(s) (solde & fidélité remis à 0)`);
    console.log(`  • ${sup.rows[0].n} fournisseur(s)`);
    console.log('  • catégories, marques, entrepôts, tarifs négociés, utilisateurs, réglages\n');
    console.log('EFFACÉ :');
    for (const t of TABLES_TO_CLEAR) console.log(`  • ${t.padEnd(20)} ${counts[t]} ligne(s)`);
    console.log('');

    if (!confirmed) {
      console.log('ℹ️  Simulation uniquement — RIEN n\'a été modifié.');
      console.log('   Pour exécuter réellement : npm run db:reset-figures -- --confirm\n');
      return;
    }

    // Exécution atomique : tout ou rien.
    await pool.query('BEGIN');
    // 1) Purge des transactions & historique.
    await pool.query(`TRUNCATE ${TABLES_TO_CLEAR.join(', ')} RESTART IDENTITY`);
    // 2) Stock produits à 0 (total + par entrepôt) + statut rupture.
    await pool.query(`UPDATE products SET quantity = 0, status = 'out_of_stock', updated_at = now()`);
    await pool.query(`UPDATE product_stock SET quantity = 0, updated_at = now()`);
    // 3) Soldes & fidélité clients à 0.
    await pool.query(`UPDATE clients SET balance = 0, loyalty_points = 0`);
    await pool.query('COMMIT');

    console.log('✅ Remise à zéro effectuée. Les clients, fournisseurs et le catalogue');
    console.log('   produits sont conservés ; tout le reste est reparti à zéro.\n');
  } catch (err) {
    try { await pool.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Erreur lors de la remise à zéro :', err?.message || err);
  process.exit(1);
});
