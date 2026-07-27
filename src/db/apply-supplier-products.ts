/**
 * Migration ciblée & idempotente : crée la table `supplier_products`
 * (catalogue d'approvisionnement fournisseur ↔ produit) si elle n'existe pas.
 *
 * Usage :
 *   - Local  :  tsx src/db/apply-supplier-products.ts   (utilise SQL_* du .env)
 *   - Render :  DATABASE_URL="<External Database URL>" tsx src/db/apply-supplier-products.ts
 *
 * N'affecte AUCUNE autre table (contrairement à `db:push`). Rejouable sans risque.
 */
import 'dotenv/config';
import { createPool } from './index.ts';

async function main() {
  const pool = createPool();
  const target = process.env.DATABASE_URL ? 'base distante (DATABASE_URL)' : 'base locale (.env)';
  console.log(`→ Application du schéma supplier_products sur : ${target}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_products (
      id text PRIMARY KEY NOT NULL,
      supplier_id text NOT NULL,
      product_id text NOT NULL,
      purchase_price double precision DEFAULT 0 NOT NULL,
      supplier_ref text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);

  // Contrainte d'unicité (un produit référencé une seule fois par fournisseur).
  // Ajoutée séparément et de façon idempotente (IF NOT EXISTS non supporté pour
  // ADD CONSTRAINT → on teste sa présence dans le catalogue système).
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uniq_supplier_product'
      ) THEN
        ALTER TABLE supplier_products
          ADD CONSTRAINT uniq_supplier_product UNIQUE (supplier_id, product_id);
      END IF;
    END $$;
  `);

  // Vérification : la table et la contrainte existent bien.
  const { rows } = await pool.query(`
    SELECT
      to_regclass('public.supplier_products') IS NOT NULL AS table_ok,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_supplier_product') AS constraint_ok
  `);
  console.log('✓ Table présente :', rows[0]?.table_ok, '| Contrainte unique :', rows[0]?.constraint_ok);

  await pool.end();
  console.log('✅ Terminé.');
}

main().catch((err) => {
  console.error('❌ Échec de la migration supplier_products :', err);
  process.exit(1);
});
