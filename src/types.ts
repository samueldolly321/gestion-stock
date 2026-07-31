export type UserRole =
  | 'Super Admin'
  | 'Admin'
  | 'Manager'
  | 'Magasinier'
  | 'Commercial'
  | 'Acheteur'
  | 'Comptable'
  | 'Auditeur';

export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  path?: string;
  createdAt: string;
}

export interface Brand {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  vatNumber?: string;
  status: 'active' | 'inactive';
  contactPerson?: string;
  notes?: string;
  createdAt: string;
}

// Ligne du catalogue d'approvisionnement : un produit fourni par un fournisseur donné,
// avec le prix d'achat négocié chez lui. Les champs `product*` sont enrichis à la lecture
// (jointure produits) pour l'affichage — ils ne sont pas stockés dans la table.
export interface SupplierProduct {
  id: string;
  supplierId: string;
  productId: string;
  purchasePrice: number; // prix d'achat chez ce fournisseur
  supplierRef?: string | null;
  createdAt: string;
  updatedAt: string;
  // Enrichis à la lecture (jointure) :
  productName?: string;
  sku?: string;
  salePrice?: number;
  vatRate?: number;
  unit?: string;
  quantity?: number;
  supplierName?: string;
}

// Tarif de vente négocié d'un produit pour un client donné. Les champs `product*`/`default*`
// sont enrichis à la lecture (jointure) pour l'affichage — pas stockés dans la table.
export interface ClientPrice {
  id: string;
  clientId: string;
  productId: string;
  salePrice: number; // prix de vente pour ce client
  createdAt: string;
  updatedAt: string;
  // Enrichis à la lecture (jointure) :
  productName?: string;
  sku?: string;
  defaultSalePrice?: number; // prix de vente par défaut de la fiche article
  purchasePrice?: number; // prix d'achat (pour le garde-fou marge)
  vatRate?: number;
  unit?: string;
  clientName?: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  taxNumber?: string;
  balance: number;
  loyaltyPoints: number;
  notes?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  code: string;
  status: 'active' | 'inactive';
  capacity: number;
  managerId?: string;
  createdAt: string;
}

// Stock réel d'un produit dans un entrepôt donné (la somme sur tous les
// entrepôts = Product.quantity, conservé comme total dénormalisé).
export interface ProductStock {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  createdAt?: string;
  updatedAt?: string;
}

export type MovementType =
  | 'entry_reception'
  | 'entry_return'
  | 'exit_sale'
  | 'waste_loss'
  | 'transfer'
  | 'adjustment';

export interface StockMovement {
  id: string;
  type: MovementType;
  productId: string;
  productName?: string; // Cache for display
  sku?: string; // Cache for display
  warehouseId: string;
  warehouseName?: string; // Cache for display
  fromWarehouseId?: string | null;
  fromWarehouseName?: string | null; // Cache for display
  quantity: number;
  reason: string;
  performedBy: string; // User Name
  referenceId?: string; // e.g. purchase or sale document ID
  costPrice: number;
  costTotal: number;
  notes?: string;
  createdAt: string;
}

export interface AuditItem {
  productId: string;
  productName: string;
  sku: string;
  expectedQuantity: number;
  actualQuantity: number;
  diff: number;
  notes?: string;
}

export interface InventoryAudit {
  id: string;
  title: string;
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
  warehouseId: string;
  warehouseName?: string;
  auditorId: string;
  auditorName: string;
  items: AuditItem[];
  completedAt?: string | null;
  createdAt: string;
}

export interface TransactionItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number; // TOUJOURS en pièces (unité de base) — stock/comptabilité inchangés
  unitPrice: number; // prix à la pièce
  discount: number; // percentage or flat
  tax: number; // VAT percentage
  total: number;
  // Affichage « vente en gros » (n'affecte ni le stock ni les montants — quantity reste en pièces) :
  unitLabel?: string | null; // ex. « Carton » si la ligne a été saisie au carton
  packQty?: number | null; // nombre de cartons saisis (packQty × packSize = quantity)
}

export interface Sale {
  id: string;
  invoiceNumber?: string | null; // numéro de document légal (facture FAC- / avoir AV-)
  type: 'quote' | 'order' | 'delivery' | 'invoice' | 'return';
  relatedSaleId?: string | null; // avoir (type 'return') : facture d'origine corrigée
  clientId: string;
  clientName?: string;
  status: 'draft' | 'pending' | 'approved' | 'delivered' | 'returned' | 'cancelled';
  items: TransactionItem[];
  vatAmount: number;
  totalAmount: number;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  paymentMethod: 'cash' | 'card' | 'mobile_money' | 'bank_transfer' | 'check';
  paidAmount: number;
  dueDate?: string | null; // échéance de la créance (calendrier)
  loyaltyPointsEarned: number;
  notes?: string;
  cashierId: string;
  cashierName: string;
  warehouseId: string;
  warehouseName?: string;
  createdAt: string;
}

export type ExpenseCategory =
  | 'transport'
  | 'douane'
  | 'taxe'
  | 'commission'
  | 'manutention'
  | 'carburant'
  | 'autre';

export interface Expense {
  id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
  supplierId?: string | null;
  supplierName?: string | null;
  purchaseId?: string | null;
  paymentStatus: 'paid' | 'unpaid';
  date?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  kind: 'sale' | 'purchase';
  refId: string;
  partyId?: string | null;
  partyName?: string | null;
  amount: number;
  method?: string | null;
  note?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface PurchaseItem {
  productId: string;
  productName?: string;
  sku?: string;
  quantity: number; // TOUJOURS en pièces (unité de base)
  unitCost: number; // coût d'achat à la pièce (Ariary)
  tax: number; // % TVA
  total: number; // quantity * unitCost (HT)
  // Affichage « achat en gros » (n'affecte ni le stock ni les montants) :
  unitLabel?: string | null; // ex. « Carton » si saisi au carton
  packQty?: number | null; // nombre de cartons saisis (packQty × packSize = quantity)
}

export type PurchaseStatus = 'ordered' | 'received' | 'cancelled';

export interface Purchase {
  id: string;
  type: 'quote' | 'order' | 'reception' | 'invoice';
  supplierId: string;
  supplierName?: string;
  status: PurchaseStatus;
  items: PurchaseItem[];
  vatAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  paidAmount: number;
  receivedAt?: string | null;
  expectedDate?: string | null; // date de réception prévue (calendrier)
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export type DeliveryType = 'moto' | 'voiture' | 'camion' | 'velo' | 'pied';
export type DeliveryStatus = 'pending' | 'in_transit' | 'delivered' | 'cancelled';

export interface Delivery {
  id: string;
  saleId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  address?: string | null;
  type: DeliveryType;
  fee: number; // tarif de livraison (Ariary), ajouté à la facture
  status: DeliveryStatus;
  driverName?: string | null;
  scheduledDate?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  qrCode?: string;
  name: string;
  description?: string;
  categoryId: string;
  categoryName?: string;
  subCategoryId?: string | null;
  subCategoryName?: string;
  brandId?: string;
  brandName?: string;
  purchasePrice: number;
  salePrice: number;
  vatRate: number; // default e.g. 20
  weight?: number; // kg
  dimensions?: string; // L x W x H
  volume?: number; // m3
  unit: string; // e.g. Units, Liters, Kg, Boxes
  // Conditionnement (vente en gros) : 1 carton = packSize pièces. packSize=1 → aucun conditionnement.
  packSize?: number;
  packLabel?: string | null; // ex. « Carton »
  packPurchasePrice?: number | null; // prix d'achat au carton (optionnel)
  packSalePrice?: number | null; // prix de vente au carton (optionnel)
  minStock: number;
  maxStock: number;
  image?: string;
  expirationDate?: string | null;
  lotNumber?: string;
  serialNumber?: string;
  supplierId?: string;
  supplierName?: string;
  locationId?: string; // warehouse or specific zone/ray
  quantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface Setting {
  id: string; // 'global'
  companyName: string;
  brandName?: string | null;
  logo?: string;
  logoInitials?: string | null;
  currency: string;
  currencySymbol: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  defaultVatRate: number;
  invoicePrefix?: string;
  creditNotePrefix?: string;
  invoicePadding?: number;
  defaultLanguage: 'fr' | 'en';
  alertLowStock: boolean;
  alertExpirationDays: number;
  aboutText?: string | null; // page « À propos » (éditable)
  privacyText?: string | null; // page « Confidentialité » (éditable)
  rolePermissions?: Record<string, string[]> | null;
  writePermissions?: Record<string, string[]> | null;
  updatedAt: string;
}
