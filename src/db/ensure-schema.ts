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

  // Entrepôt de destination sur les commandes d'achat (réception ciblée).
  await db.execute(sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS warehouse_id text;`);
  await db.execute(sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS warehouse_name text;`);

  // Stock réel par entrepôt : table product_stock (une ligne par couple produit×entrepôt).
  // products.quantity reste le TOTAL (somme des lignes). Migration additive et réversible.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS product_stock (
      id text PRIMARY KEY NOT NULL,
      product_id text NOT NULL,
      warehouse_id text NOT NULL,
      quantity double precision DEFAULT 0 NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_product_warehouse') THEN
        ALTER TABLE product_stock
          ADD CONSTRAINT uniq_product_warehouse UNIQUE (product_id, warehouse_id);
      END IF;
    END $$;
  `);

  // Backfill : répartit le stock existant de chaque produit dans SON entrepôt
  // (location_id s'il pointe vers un entrepôt valide, sinon un entrepôt par défaut).
  // Ne touche QUE les produits n'ayant encore aucune ligne de stock → rejouable.
  await db.execute(sql`
    DO $$
    DECLARE
      default_wh text;
    BEGIN
      -- Rien à faire s'il n'existe aucun produit à répartir.
      IF NOT EXISTS (
        SELECT 1 FROM products p
        WHERE NOT EXISTS (SELECT 1 FROM product_stock ps WHERE ps.product_id = p.id)
      ) THEN
        RETURN;
      END IF;

      -- Entrepôt par défaut : le plus ancien existant, sinon on crée « Entrepôt Central ».
      SELECT id INTO default_wh FROM warehouses ORDER BY created_at ASC LIMIT 1;
      IF default_wh IS NULL THEN
        default_wh := 'WH-CENTRAL';
        INSERT INTO warehouses (id, name, location, code, status, capacity)
        VALUES (default_wh, 'Entrepôt Central', NULL, 'CENTRAL', 'active', 0)
        ON CONFLICT (id) DO NOTHING;
      END IF;

      INSERT INTO product_stock (id, product_id, warehouse_id, quantity, created_at, updated_at)
      SELECT
        'PS-' || p.id,
        p.id,
        CASE
          WHEN p.location_id IS NOT NULL AND p.location_id <> ''
               AND EXISTS (SELECT 1 FROM warehouses w WHERE w.id = p.location_id)
          THEN p.location_id
          ELSE default_wh
        END,
        COALESCE(p.quantity, 0),
        now(), now()
      FROM products p
      WHERE NOT EXISTS (SELECT 1 FROM product_stock ps WHERE ps.product_id = p.id)
      ON CONFLICT (product_id, warehouse_id) DO NOTHING;
    END $$;
  `);
}
