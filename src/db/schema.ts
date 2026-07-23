import { pgTable, text, timestamp, boolean, doublePrecision, integer, jsonb } from 'drizzle-orm/pg-core';

// Colonnes de dates communes : stockées en timestamp, renvoyées en chaîne ISO
// pour rester compatibles avec le front (qui manipule des strings ISO).
const createdAt = timestamp('created_at', { mode: 'string' }).defaultNow().notNull();
const updatedAt = timestamp('updated_at', { mode: 'string' }).defaultNow().notNull();

// 1. Users — inclut password_hash pour l'authentification 100% PostgreSQL
export const users = pgTable('users', {
  id: text('id').primaryKey(), // uid généré côté serveur
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'), // null pour les comptes démo/externes
  role: text('role').notNull(), // 'Super Admin' | 'Admin' | 'Manager' | ...
  avatar: text('avatar'),
  active: boolean('active').default(true).notNull(),
  createdAt,
  updatedAt,
});

// 2. Categories
export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  parentId: text('parent_id'),
  path: text('path'),
  createdAt,
});

// 3. Brands
export const brands = pgTable('brands', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  logo: text('logo'),
  createdAt,
});

// 4. Suppliers
export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  companyName: text('company_name'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  vatNumber: text('vat_number'),
  status: text('status').default('active').notNull(), // 'active' | 'inactive'
  contactPerson: text('contact_person'),
  notes: text('notes'),
  createdAt,
});

// 5. Clients
export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  taxNumber: text('tax_number'),
  balance: doublePrecision('balance').default(0).notNull(),
  loyaltyPoints: integer('loyalty_points').default(0).notNull(),
  notes: text('notes'),
  status: text('status').default('active').notNull(), // 'active' | 'inactive'
  createdAt,
});

// 6. Warehouses
export const warehouses = pgTable('warehouses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  location: text('location'),
  code: text('code'),
  status: text('status').default('active').notNull(), // 'active' | 'inactive'
  capacity: integer('capacity').default(0).notNull(),
  managerId: text('manager_id'),
  createdAt,
});

// 7. Products
export const products = pgTable('products', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull(),
  barcode: text('barcode'),
  qrCode: text('qr_code'),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: text('category_id'),
  categoryName: text('category_name'),
  subCategoryId: text('sub_category_id'),
  subCategoryName: text('sub_category_name'),
  brandId: text('brand_id'),
  brandName: text('brand_name'),
  purchasePrice: doublePrecision('purchase_price').default(0).notNull(),
  salePrice: doublePrecision('sale_price').default(0).notNull(),
  vatRate: doublePrecision('vat_rate').default(20).notNull(),
  weight: doublePrecision('weight'),
  dimensions: text('dimensions'),
  volume: doublePrecision('volume'),
  unit: text('unit').default('Unités').notNull(),
  minStock: integer('min_stock').default(5).notNull(),
  maxStock: integer('max_stock').default(100).notNull(),
  image: text('image'),
  expirationDate: text('expiration_date'),
  lotNumber: text('lot_number'),
  serialNumber: text('serial_number'),
  supplierId: text('supplier_id'),
  supplierName: text('supplier_name'),
  locationId: text('location_id'),
  quantity: integer('quantity').default(0).notNull(),
  status: text('status').default('in_stock').notNull(), // in_stock | low_stock | out_of_stock | expired
  createdAt,
  updatedAt,
});

// 8. Stock Movements
export const stockMovements = pgTable('stock_movements', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // entry_reception | exit_sale | waste_loss | transfer | adjustment
  productId: text('product_id').notNull().references(() => products.id),
  productName: text('product_name'),
  sku: text('sku'),
  warehouseId: text('warehouse_id'),
  warehouseName: text('warehouse_name'),
  fromWarehouseId: text('from_warehouse_id'),
  fromWarehouseName: text('from_warehouse_name'),
  quantity: integer('quantity').notNull(),
  reason: text('reason'),
  performedBy: text('performed_by').notNull(),
  referenceId: text('reference_id'),
  costPrice: doublePrecision('cost_price').default(0).notNull(),
  costTotal: doublePrecision('cost_total').default(0).notNull(),
  notes: text('notes'),
  createdAt,
});

// 9. Inventory Audits — items stockés en JSONB
export const inventoryAudits = pgTable('inventory_audits', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull(), // draft | in_progress | completed | cancelled
  warehouseId: text('warehouse_id'),
  warehouseName: text('warehouse_name'),
  auditorId: text('auditor_id').notNull(),
  auditorName: text('auditor_name').notNull(),
  items: jsonb('items').$type<unknown[]>().default([]).notNull(),
  completedAt: text('completed_at'),
  createdAt,
});

// 10. Purchases — items stockés en JSONB
export const purchases = pgTable('purchases', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // quote | order | reception | invoice
  supplierId: text('supplier_id').notNull(),
  supplierName: text('supplier_name'),
  status: text('status').notNull(),
  items: jsonb('items').$type<unknown[]>().default([]).notNull(),
  vatAmount: doublePrecision('vat_amount').default(0).notNull(),
  discountAmount: doublePrecision('discount_amount').default(0).notNull(),
  totalAmount: doublePrecision('total_amount').default(0).notNull(),
  paymentStatus: text('payment_status').notNull(), // unpaid | partially_paid | paid
  paidAmount: doublePrecision('paid_amount').default(0).notNull(),
  receivedAt: text('received_at'), // date de réception en stock (null = pas encore reçu)
  expectedDate: text('expected_date'), // date de réception prévue (pour le calendrier)
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt,
});

// 11. Sales — items stockés en JSONB
export const sales = pgTable('sales', {
  id: text('id').primaryKey(),
  // Numéro de document légal, séquentiel et sans trou (facture FAC-000001, avoir AV-000001).
  // Attribué aux factures (type 'invoice') et aux avoirs (type 'return') ; null pour devis/commandes.
  invoiceNumber: text('invoice_number').unique(),
  type: text('type').notNull(), // quote | order | delivery | invoice | return
  // Pour un avoir (type 'return') : id de la facture d'origine qu'il corrige.
  relatedSaleId: text('related_sale_id'),
  clientId: text('client_id').notNull(),
  clientName: text('client_name'),
  status: text('status').notNull(),
  items: jsonb('items').$type<unknown[]>().default([]).notNull(),
  vatAmount: doublePrecision('vat_amount').default(0).notNull(),
  totalAmount: doublePrecision('total_amount').default(0).notNull(),
  paymentStatus: text('payment_status').notNull(),
  paymentMethod: text('payment_method'), // cash | card | mobile_money | bank_transfer | check
  paidAmount: doublePrecision('paid_amount').default(0).notNull(), // encaissé (le reste = créance client)
  dueDate: text('due_date'), // date d'échéance de la créance (pour le calendrier)
  loyaltyPointsEarned: integer('loyalty_points_earned').default(0).notNull(),
  notes: text('notes'),
  cashierId: text('cashier_id').notNull(),
  cashierName: text('cashier_name'),
  warehouseId: text('warehouse_id'),
  warehouseName: text('warehouse_name'),
  createdAt,
});

// 17. Document Counters — compteurs séquentiels des numéros légaux (factures, etc.).
// Une ligne par séquence (clé 'invoice'). L'incrément se fait DANS la transaction
// du document (verrou de ligne via ON CONFLICT) → séquence sans trou : un rollback
// de la vente annule aussi l'incrément.
export const documentCounters = pgTable('document_counters', {
  key: text('key').primaryKey(), // 'invoice'
  value: integer('value').default(0).notNull(),
  updatedAt,
});

// 16. Payments — historique des règlements (clients sur ventes / fournisseurs sur achats)
export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'sale' (règlement client) | 'purchase' (règlement fournisseur)
  refId: text('ref_id').notNull(), // id de la vente ou de l'achat concerné
  partyId: text('party_id'), // clientId ou supplierId
  partyName: text('party_name'),
  amount: doublePrecision('amount').notNull(),
  method: text('method'), // cash | card | mobile_money | bank_transfer | check
  note: text('note'),
  createdBy: text('created_by'),
  createdAt,
});

// 12. Audit Logs (journal d'actions ERP) — immuable
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  userName: text('user_name'),
  action: text('action').notNull(),
  module: text('module').notNull(),
  entityId: text('entity_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt,
});

// 15. Expenses — dépenses diverses (transport, douane, taxes... liées aux achats)
export const expenses = pgTable('expenses', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  category: text('category').notNull(), // transport | douane | taxe | commission | manutention | carburant | autre
  amount: doublePrecision('amount').default(0).notNull(),
  supplierId: text('supplier_id'),
  supplierName: text('supplier_name'),
  purchaseId: text('purchase_id'), // lien optionnel à une commande d'achat
  paymentStatus: text('payment_status').default('paid').notNull(), // paid | unpaid
  date: text('date'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt,
  updatedAt,
});

// 14. Deliveries — livraisons chez le client (type + tarif ajouté à la facture)
export const deliveries = pgTable('deliveries', {
  id: text('id').primaryKey(),
  saleId: text('sale_id'), // vente/facture liée (optionnel)
  clientId: text('client_id'),
  clientName: text('client_name'),
  address: text('address'),
  type: text('type').notNull(), // moto | voiture | camion | velo | pied
  fee: doublePrecision('fee').default(0).notNull(),
  status: text('status').default('pending').notNull(), // pending | in_transit | delivered | cancelled
  driverName: text('driver_name'),
  scheduledDate: text('scheduled_date'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt,
  updatedAt,
});

// 13. Settings (une seule ligne 'global')
export const settings = pgTable('settings', {
  id: text('id').primaryKey(), // 'global'
  companyName: text('company_name'),
  logo: text('logo'),
  logoInitials: text('logo_initials'), // 1-2 lettres affichées dans le logo (sinon dérivées du nom)
  currency: text('currency').default('EUR').notNull(),
  currencySymbol: text('currency_symbol').default('€').notNull(),
  taxId: text('tax_id'),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  defaultVatRate: doublePrecision('default_vat_rate').default(20).notNull(),
  // Numérotation des documents légaux : préfixes + nombre de chiffres (padding zéros, commun).
  invoicePrefix: text('invoice_prefix').default('FAC').notNull(),
  creditNotePrefix: text('credit_note_prefix').default('AV').notNull(),
  invoicePadding: integer('invoice_padding').default(6).notNull(),
  defaultLanguage: text('default_language').default('fr').notNull(),
  alertLowStock: boolean('alert_low_stock').default(true).notNull(),
  alertExpirationDays: integer('alert_expiration_days').default(30).notNull(),
  // Matrice RBAC personnalisée : rôle -> liste d'onglets autorisés (null = défauts).
  rolePermissions: jsonb('role_permissions').$type<Record<string, string[]>>(),
  // Droits d'écriture : rôle -> modules où créer/éditer/supprimer est permis.
  writePermissions: jsonb('write_permissions').$type<Record<string, string[]>>(),
  updatedAt,
});
