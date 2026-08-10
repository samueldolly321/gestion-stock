CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"user_name" text,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"entity_id" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" text,
	"path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"product_id" text NOT NULL,
	"sale_price" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_client_product" UNIQUE("client_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"tax_number" text,
	"balance" double precision DEFAULT 0 NOT NULL,
	"loyalty_points" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"sale_id" text,
	"client_id" text,
	"client_name" text,
	"address" text,
	"type" text NOT NULL,
	"fee" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"driver_name" text,
	"scheduled_date" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"supplier_id" text,
	"supplier_name" text,
	"purchase_id" text,
	"payment_status" text DEFAULT 'paid' NOT NULL,
	"date" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"warehouse_id" text,
	"warehouse_name" text,
	"auditor_id" text NOT NULL,
	"auditor_name" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"party_id" text,
	"party_name" text,
	"amount" double precision NOT NULL,
	"method" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_stock" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_product_warehouse" UNIQUE("product_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"qr_code" text,
	"name" text NOT NULL,
	"description" text,
	"category_id" text,
	"category_name" text,
	"sub_category_id" text,
	"sub_category_name" text,
	"brand_id" text,
	"brand_name" text,
	"purchase_price" double precision DEFAULT 0 NOT NULL,
	"sale_price" double precision DEFAULT 0 NOT NULL,
	"vat_rate" double precision DEFAULT 20 NOT NULL,
	"weight" double precision,
	"dimensions" text,
	"volume" double precision,
	"unit" text DEFAULT 'Unités' NOT NULL,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"pack_label" text,
	"pack_purchase_price" double precision,
	"pack_sale_price" double precision,
	"min_stock" double precision DEFAULT 5 NOT NULL,
	"max_stock" double precision DEFAULT 100 NOT NULL,
	"image" text,
	"expiration_date" text,
	"lot_number" text,
	"serial_number" text,
	"supplier_id" text,
	"supplier_name" text,
	"location_id" text,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'in_stock' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_name" text,
	"status" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vat_amount" double precision DEFAULT 0 NOT NULL,
	"discount_amount" double precision DEFAULT 0 NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
	"payment_status" text NOT NULL,
	"paid_amount" double precision DEFAULT 0 NOT NULL,
	"received_at" text,
	"expected_date" text,
	"warehouse_id" text,
	"warehouse_name" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text,
	"type" text NOT NULL,
	"related_sale_id" text,
	"client_id" text NOT NULL,
	"client_name" text,
	"status" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vat_amount" double precision DEFAULT 0 NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
	"payment_status" text NOT NULL,
	"payment_method" text,
	"paid_amount" double precision DEFAULT 0 NOT NULL,
	"due_date" text,
	"loyalty_points_earned" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"cashier_id" text NOT NULL,
	"cashier_name" text,
	"warehouse_id" text,
	"warehouse_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"company_name" text,
	"brand_name" text,
	"logo" text,
	"logo_initials" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"currency_symbol" text DEFAULT '€' NOT NULL,
	"tax_id" text,
	"address" text,
	"phone" text,
	"email" text,
	"default_vat_rate" double precision DEFAULT 20 NOT NULL,
	"invoice_prefix" text DEFAULT 'FAC' NOT NULL,
	"credit_note_prefix" text DEFAULT 'AV' NOT NULL,
	"invoice_padding" integer DEFAULT 6 NOT NULL,
	"default_language" text DEFAULT 'fr' NOT NULL,
	"alert_low_stock" boolean DEFAULT true NOT NULL,
	"alert_expiration_days" integer DEFAULT 30 NOT NULL,
	"about_text" text,
	"privacy_text" text,
	"role_permissions" jsonb,
	"write_permissions" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text,
	"sku" text,
	"warehouse_id" text,
	"warehouse_name" text,
	"from_warehouse_id" text,
	"from_warehouse_name" text,
	"quantity" double precision NOT NULL,
	"reason" text,
	"performed_by" text NOT NULL,
	"reference_id" text,
	"cost_price" double precision DEFAULT 0 NOT NULL,
	"cost_total" double precision DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"product_id" text NOT NULL,
	"purchase_price" double precision DEFAULT 0 NOT NULL,
	"supplier_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_supplier_product" UNIQUE("supplier_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"vat_number" text,
	"status" text DEFAULT 'active' NOT NULL,
	"contact_person" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" text NOT NULL,
	"avatar" text,
	"warehouse_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"code" text,
	"status" text DEFAULT 'active' NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"manager_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;