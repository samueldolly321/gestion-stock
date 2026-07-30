/**
 * Migrations légères & idempotentes appliquées au DÉMARRAGE du serveur.
 *
 * Raison d'être : Render déploie le code automatiquement à chaque push, mais ne
 * crée jamais les nouvelles tables. Depuis un poste où le port 5432 est bloqué en
 * sortie (fréquent sur les réseaux d'entreprise), on ne peut pas non plus appliquer
 * le schéma à distance. On laisse donc le serveur — qui, lui, atteint la base par
 * le réseau interne — garantir la présence des tables récentes à chaque boot.
 *
 * Chaque instruction est idempotente (`IF NOT EXISTS`), donc rejouable sans risque.
 */
import { sql } from 'drizzle-orm';
import { db } from './index.ts';

export async function ensureSchema(): Promise<void> {
  // Table `supplier_products` — catalogue d'approvisionnement (fournisseur ↔ produit).
  await db.execute(sql`
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
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_supplier_product') THEN
        ALTER TABLE supplier_products
          ADD CONSTRAINT uniq_supplier_product UNIQUE (supplier_id, product_id);
      END IF;
    END $$;
  `);

  // Colonne `brand_name` sur settings (nom de marque de la barre latérale, administrable).
  await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_name text;`);

  // Pages éditables « À propos » / « Confidentialité » (portail de connexion).
  await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS about_text text;`);
  await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS privacy_text text;`);

  // Conditionnement (vente en gros) sur products : carton ↔ pièces.
  await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size integer DEFAULT 1 NOT NULL;`);
  await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_label text;`);
  await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_purchase_price double precision;`);
  await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_sale_price double precision;`);

  // Table `client_prices` — tarifs de vente négociés par client.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_prices (
      id text PRIMARY KEY NOT NULL,
      client_id text NOT NULL,
      product_id text NOT NULL,
      sale_price double precision DEFAULT 0 NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_client_product') THEN
        ALTER TABLE client_prices
          ADD CONSTRAINT uniq_client_product UNIQUE (client_id, product_id);
      END IF;
    END $$;
  `);

  // Quantités décimales (poids/volume : kg, litre…) : passe les colonnes de
  // quantité et de seuils d'entier à double precision. On ne convertit QUE si la
  // colonne est encore de type entier (évite un rewrite de table à chaque boot).
  await db.execute(sql`
    DO $$
    DECLARE
      col record;
    BEGIN
      FOR col IN
        SELECT table_name, column_name FROM (VALUES
          ('products', 'quantity'),
          ('products', 'min_stock'),
          ('products', 'max_stock'),
          ('stock_movements', 'quantity')
        ) AS t(table_name, column_name)
      LOOP
        IF EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_name = col.table_name AND c.column_name = col.column_name AND c.data_type = 'integer'
        ) THEN
          EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE double precision USING %I::double precision',
                         col.table_name, col.column_name, col.column_name);
        END IF;
      END LOOP;
    END $$;
  `);
}
