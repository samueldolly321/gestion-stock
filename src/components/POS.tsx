import React, { useState, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  User as UserIcon,
  Trash2,
  DollarSign,
  Plus,
  Minus,
  Sparkles,
  Receipt,
  CreditCard,
  PhoneCall,
  CheckCircle,
  TrendingUp,
  Coins,
  Truck
} from 'lucide-react';
import { Product, Client, ClientPrice, Sale, User, TransactionItem, DeliveryType } from '../types';
import { packSizeOf, hasPack } from '../services/pack';
import { createSale } from '../services/salesService';
import { createDelivery, DELIVERY_TYPES, defaultFeeFor, deliveryTypeLabel } from '../services/deliveriesService';
import ReceiptModal from './ReceiptModal';
import { showAlert } from '../services/dialog';
import { useMoney } from '../services/CurrencyContext';
import confetti from 'canvas-confetti';

interface POSProps {
  products: Product[];
  clients: Client[];
  clientPrices: ClientPrice[];
  user: User;
  onRefresh: () => void;
  currencySymbol: string;
  company?: { name?: string; address?: string; phone?: string; taxId?: string };
}

// Ligne de panier : quantity est TOUJOURS en pièces, unitPrice TOUJOURS à la pièce.
// saleUnit/packSize ne servent qu'à la saisie et à l'affichage (carton ↔ pièces).
interface CartLine extends TransactionItem {
  saleUnit: 'piece' | 'pack';
  packSize: number;
  packLabel?: string | null;
}

export default function POS({
  products,
  clients,
  clientPrices,
  user,
  onRefresh,
  currencySymbol,
  company
}: POSProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<Sale['paymentMethod']>('cash');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [applyVat, setApplyVat] = useState<boolean>(false); // TVA optionnelle (désactivée par défaut)
  const [notes, setNotes] = useState('');
  const [paymentRef, setPaymentRef] = useState(''); // réf. chèque / virement / TPE-CB
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('moto');
  const [deliveryFee, setDeliveryFee] = useState<number>(defaultFeeFor('moto'));
  const [advanceMode, setAdvanceMode] = useState(false); // vente partielle / à crédit
  const [amountReceived, setAmountReceived] = useState<number>(0);
  // Échéance de la créance (par défaut : dans 30 jours) — placée sur le calendrier.
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  // Checkout Receipt state
  const [showReceipt, setShowReceipt] = useState<Sale | null>(null);

  // Formatage monétaire (Ariary base / Euro converti)
  const { format } = useMoney();

  // Filter clients to find active details
  const selectedClient = useMemo(() => {
    return clients.find((c) => c.id === selectedClientId) || null;
  }, [clients, selectedClientId]);

  // Prix de vente À LA PIÈCE applicable au client : tarif négocié si défini, sinon prix par défaut.
  // En mode carton, si un prix de vente au carton est renseigné, on en déduit le prix/pièce.
  const perPiecePrice = (product: Product, saleUnit: 'piece' | 'pack' = 'piece'): number => {
    const cp = clientPrices.find((c) => c.clientId === selectedClientId && c.productId === product.id);
    if (cp) return cp.salePrice; // le tarif client (par pièce) est prioritaire
    const size = packSizeOf(product.packSize);
    if (saleUnit === 'pack' && size > 1 && product.packSalePrice != null) {
      return Number(product.packSalePrice) / size;
    }
    return product.salePrice;
  };
  const priceForClient = (product: Product): number => perPiecePrice(product, 'piece');
  // Un tarif négocié existe-t-il pour ce produit et ce client ?
  const hasClientPrice = (productId: string): boolean =>
    clientPrices.some((c) => c.clientId === selectedClientId && c.productId === productId);

  // Changer de client ré-applique automatiquement SES tarifs à toutes les lignes du panier.
  React.useEffect(() => {
    setCart((prev) =>
      prev.map((item) => {
        const prod = products.find((p) => p.id === item.productId);
        if (!prod) return item;
        const newPrice = perPiecePrice(prod, item.saleUnit);
        return { ...item, unitPrice: newPrice, total: item.quantity * newPrice * (1 - item.discount / 100) };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId]);

  // Filter products by search term (name, sku, barcode)
  const availableProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.quantity <= 0) return false; // Hide out of stock items
      return (
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcode.includes(searchTerm)
      );
    });
  }, [products, searchTerm]);

  // Pas de progression (+/-) d'une ligne : 1 carton si la ligne est en mode carton, sinon 1 pièce.
  const stepFor = (item: CartLine) => (item.saleUnit === 'pack' ? item.packSize : 1);

  // Add product to cart
  const addToCart = (product: Product) => {
    const cartItem = cart.find((item) => item.productId === product.id);
    if (cartItem) {
      const step = stepFor(cartItem);
      if (cartItem.quantity + step > product.quantity) {
        showAlert(`Stock insuffisant. Seulement ${product.quantity} disponibles.`, { variant: 'warning' });
        return;
      }
      setCart(
        cart.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + step, total: (item.quantity + step) * item.unitPrice * (1 - item.discount / 100) }
            : item
        )
      );
    } else {
      const price = priceForClient(product); // tarif négocié du client si défini (par pièce)
      const newItem: CartLine = {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 1,
        unitPrice: price,
        discount: 0,
        tax: product.vatRate,
        total: price,
        saleUnit: 'piece',
        packSize: packSizeOf(product.packSize),
        packLabel: product.packLabel ?? null,
      };
      setCart([...cart, newItem]);
    }
  };

  // Bascule pièce ↔ carton pour une ligne. Recalcule le prix/pièce et arrondit la quantité
  // à un multiple de la taille de colis (au moins 1 colis).
  const setSaleUnit = (productId: string, saleUnit: 'piece' | 'pack') => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const size = packSizeOf(prod.packSize);
    setCart(cart.map((item) => {
      if (item.productId !== productId) return item;
      const newPrice = perPiecePrice(prod, saleUnit);
      let qty = item.quantity;
      if (saleUnit === 'pack') {
        qty = Math.max(size, Math.round(item.quantity / size) * size); // multiple de la taille de colis
        if (qty > prod.quantity) qty = Math.max(size, Math.floor(prod.quantity / size) * size);
      }
      return { ...item, saleUnit, unitPrice: newPrice, quantity: qty, total: qty * newPrice * (1 - item.discount / 100) };
    }));
  };

  // Adjust quantity in cart
  const updateQuantity = (productId: string, delta: number) => {
    const p = products.find((prod) => prod.id === productId);
    if (!p) return;

    setCart(
      cart
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta * stepFor(item); // 1 pièce ou 1 carton
            if (newQty <= 0) return null;
            if (newQty > p.quantity) {
              showAlert(`Quantité limitée au stock disponible (${p.quantity}).`, { variant: 'warning' });
              return item;
            }
            return {
              ...item,
              quantity: newQty,
              total: newQty * item.unitPrice * (1 - item.discount / 100)
            };
          }
          return item;
        })
        .filter(Boolean) as CartLine[]
    );
  };

  // Définit une quantité absolue (saisie directe au clavier). En mode carton, la valeur
  // saisie est un nombre de cartons ; convertie en pièces. Toujours bornée au stock.
  const setQuantity = (productId: string, value: number | string) => {
    const p = products.find((prod) => prod.id === productId);
    const item = cart.find((i) => i.productId === productId);
    if (!p || !item) return;
    // Quantités décimales autorisées (poids/volume : 1,5 kg / 0,75 L). Arrondi à 3 décimales.
    const round3 = (n: number) => Math.round(n * 1000) / 1000;
    let pieces: number;
    if (item.saleUnit === 'pack') {
      const size = item.packSize;
      const cartons = Math.max(0, Number(value) || 0);
      pieces = round3(Math.min(cartons * size, p.quantity));
    } else {
      pieces = round3(Math.max(0, Math.min(Number(value) || 0, p.quantity)));
    }
    setCart(cart.map((it) => it.productId === productId
      ? { ...it, quantity: pieces, total: pieces * it.unitPrice * (1 - it.discount / 100) }
      : it));
  };

  // Définit le prix de vente unitaire d'une ligne (négociation par client au comptoir).
  // Saisie libre : aucune alerte ici — le garde-fou vente à perte est vérifié à l'encaissement.
  const setUnitPrice = (productId: string, value: number | string) => {
    const price = Math.max(0, Number(value) || 0);
    setCart(cart.map((item) => item.productId === productId
      ? { ...item, unitPrice: price, total: item.quantity * price * (1 - item.discount / 100) }
      : item));
  };

  // Une ligne est-elle en vente à perte (prix de vente < prix d'achat) ? — indicateur visuel.
  const isBelowCost = (item: TransactionItem): boolean => {
    const p = products.find((prod) => prod.id === item.productId);
    return !!p && item.unitPrice < p.purchasePrice;
  };

  // Remove item from cart
  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.productId !== productId));
  };

  // Clear Cart
  const clearCart = () => setCart([]);

  // Calculate Subtotals, VAT, Discounts and Totals
  const totals = useMemo(() => {
    let subtotal = 0;
    let vatTotal = 0;

    cart.forEach((item) => {
      const itemSubtotal = item.quantity * item.unitPrice;
      subtotal += itemSubtotal;
      // La TVA n'est comptée que si l'option est activée (vente sans TVA sinon).
      if (applyVat) vatTotal += itemSubtotal * (item.tax / 100);
    });

    const discountAmount = subtotal * (discountPercent / 100);
    const goodsTotal = subtotal + vatTotal - discountAmount;
    const delivery = deliveryEnabled ? Number(deliveryFee) || 0 : 0;
    const totalAmount = goodsTotal + delivery;
    // La fidélité est calculée sur les marchandises, pas sur les frais de livraison.
    const loyaltyPointsEarned = Math.floor(goodsTotal / 10);

    return {
      subtotal,
      vatTotal,
      discountAmount,
      delivery,
      totalAmount,
      loyaltyPointsEarned
    };
  }, [cart, discountPercent, deliveryEnabled, deliveryFee, applyVat]);

  // Submit checkout — un seul appel API : le serveur crée la vente,
  // déduit le stock et crédite la fidélité en transaction.
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    // Garde-fou marge : aucune ligne ne peut être vendue sous son prix d'achat.
    for (const item of cart) {
      const prod = products.find((p) => p.id === item.productId);
      if (prod && item.unitPrice < prod.purchasePrice) {
        showAlert(
          `« ${item.productName} » : prix de vente (${format(item.unitPrice)}) sous le prix d'achat (${format(prod.purchasePrice)}). Corrigez la ligne avant d'encaisser.`,
          { variant: 'warning' },
        );
        return;
      }
    }

    try {
      // Notes finales : réf. de paiement (hors espèces) + livraison éventuelle.
      const noteParts: string[] = [];
      if (paymentRef && paymentMethod !== 'cash') noteParts.push(`[Réf. paiement : ${paymentRef}]`);
      if (deliveryEnabled) noteParts.push(`[Livraison ${deliveryTypeLabel(deliveryType)} : ${format(totals.delivery)}]`);
      if (notes) noteParts.push(notes);
      const notesFinal = noteParts.join(' ').trim();

      // Si la TVA n'est pas appliquée, on neutralise le taux sur chaque ligne
      // (cohérence du reçu et des recalculs éventuels) et vatAmount = 0.
      // On transmet aussi le libellé/nombre de cartons (affichage reçu) ; quantity reste en pièces.
      const itemsForSale = cart.map((it) => ({
        ...it,
        tax: applyVat ? it.tax : 0,
        unitLabel: it.saleUnit === 'pack' ? (it.packLabel || 'Carton') : null,
        packQty: it.saleUnit === 'pack' ? Math.round(it.quantity / it.packSize) : null,
      }));

      const created = await createSale({
        type: 'invoice',
        clientId: selectedClientId,
        clientName: selectedClient?.name || 'Client de Passage',
        status: 'delivered',
        items: itemsForSale,
        vatAmount: totals.vatTotal,
        totalAmount: totals.totalAmount, // indicatif : le serveur recalcule
        // Champs pour le recalcul serveur (anti-falsification) :
        discountPercent,
        deliveryFee: totals.delivery,
        applyVat,
        paymentStatus: 'paid',
        paymentMethod,
        loyaltyPointsEarned: totals.loyaltyPointsEarned,
        // Montant encaissé (le reste devient une créance client).
        paidAmount: advanceMode ? Math.max(0, Math.min(amountReceived, totals.totalAmount)) : totals.totalAmount,
        dueDate: advanceMode ? dueDate : undefined, // échéance si vente à crédit
        notes: notesFinal,
        warehouseId: products[0]?.locationId || '',
      });

      // Crée la livraison liée à la facture si l'option est activée.
      if (deliveryEnabled) {
        try {
          await createDelivery({
            saleId: created.id,
            clientId: selectedClientId || null,
            clientName: selectedClient?.name || 'Client de Passage',
            address: selectedClient?.address || null,
            type: deliveryType,
            fee: Number(deliveryFee) || 0,
            status: 'pending',
            driverName: null,
            scheduledDate: null,
            notes: `Facture ${created.id}`,
          });
        } catch (delErr) {
          console.error('Création livraison échouée :', delErr);
        }
      }

      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#0047ab', '#6366f1', '#10b981'],
      });

      setShowReceipt(created);
      clearCart();
      setNotes('');
      setPaymentRef('');
      setDeliveryEnabled(false);
      setAdvanceMode(false);
      setAmountReceived(0);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      showAlert(err?.message || 'Erreur lors du traitement de la vente.', { variant: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title block */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Terminal Point de Vente (POS)</h2>
          <p className="text-xs text-slate-400">Facturation rapide, déduction automatique de stock et gestion de fidélité.</p>
        </div>
        <span className="text-xs px-2.5 py-1 bg-cyan-500/10 text-cyan-400 font-mono rounded-lg border border-cyan-500/20">
          Caisse : {user.name}
        </span>
      </div>

      {/* POS Screen Division */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        
        {/* Left Side: Product Picker */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Rechercher par nom, SKU ou scanner code-barres..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-slate-900/40 text-xs py-3.5 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800/80 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Product grid list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 max-h-[580px] overflow-y-auto pr-1">
            {availableProducts.length === 0 ? (
              <p className="text-xs text-slate-500 py-12 text-center col-span-3">
                Aucun produit disponible en stock ne correspond à la recherche.
              </p>
            ) : (
              availableProducts.map((p) => {
                const quantityInCart = cart.find((i) => i.productId === p.id)?.quantity || 0;
                const isMax = quantityInCart >= p.quantity;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={isMax}
                    className="p-3 bg-white hover:bg-slate-50 dark:bg-slate-900/40 dark:hover:bg-slate-800/60 disabled:opacity-40 border border-slate-200 dark:border-slate-800 rounded-xl transition duration-150 flex flex-col justify-between text-left cursor-pointer"
                  >
                    {/* Image du produit — bien en évidence */}
                    <img
                      src={p.image || 'https://api.dicebear.com/7.x/identicon/svg'}
                      alt={p.name}
                      className="w-full h-40 rounded-lg object-cover bg-slate-100 dark:bg-slate-800/40 mb-2.5"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">{p.name}</h4>
                      <span className="text-[9px] text-cyan-400 font-mono block mt-0.5">{p.sku}</span>
                      {p.supplierName && (
                        <span className="text-[9px] text-slate-400 block truncate">Fourn. : {p.supplierName}</span>
                      )}
                    </div>

                    <div className="mt-3 w-full">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Disponible :</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-300">{p.quantity - quantityInCart}</span>
                      </div>
                      <div className="flex justify-between items-end mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-800/50">
                        <span className="text-xs font-bold font-mono text-cyan-400">
                          {format(p.salePrice)}
                          <span className="text-[9px] font-normal text-slate-400"> /pce</span>
                        </span>
                        {quantityInCart > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 font-mono rounded">
                            {quantityInCart} dans panier
                          </span>
                        )}
                      </div>
                      {hasPack(p.packSize) && (
                        <div className="flex justify-between items-center mt-1 text-[10px] font-mono text-amber-600 dark:text-amber-400">
                          <span>{p.packLabel || 'Carton'} ×{packSizeOf(p.packSize)}</span>
                          <span className="font-bold">{format(p.packSalePrice != null ? p.packSalePrice : p.salePrice * packSizeOf(p.packSize))}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

        </div>

        {/* Right Side: Cart Summary Panel */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4" />
              Panier en cours
            </h3>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-[10px] text-red-400 hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                Vider
              </button>
            )}
          </div>

          {/* Cart items list */}
          <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                Le panier est vide.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.productId}
                  className="p-3 bg-white dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800/40 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">{item.productName}</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <input
                        type="number"
                        min={0}
                        value={item.unitPrice}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setUnitPrice(item.productId, e.target.value)}
                        title="Prix de vente unitaire (HT) — modifiable pour ce client."
                        className={`w-20 font-mono text-[10px] bg-transparent border rounded px-1 py-0.5 focus:outline-none focus:border-cyan-500 ${
                          isBelowCost(item)
                            ? 'border-red-500 text-red-500'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      />
                      <span className="text-[9px] text-slate-400 font-mono">HT</span>
                      {isBelowCost(item) && (
                        <span className="text-[8px] px-1 py-0.5 bg-red-500/10 text-red-500 rounded font-mono" title="Prix sous le prix d'achat — bloqué à l'encaissement">
                          &lt; achat
                        </span>
                      )}
                      {!isBelowCost(item) && hasClientPrice(item.productId) && (
                        <span className="text-[8px] px-1 py-0.5 bg-cyan-500/10 text-cyan-400 rounded font-mono" title="Tarif négocié de ce client">
                          tarif client
                        </span>
                      )}
                    </div>
                    {/* Unité de vente : pièce ou carton (uniquement si le produit a un conditionnement) */}
                    {hasPack(item.packSize) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <select
                          value={item.saleUnit}
                          onChange={(e) => setSaleUnit(item.productId, e.target.value as 'piece' | 'pack')}
                          className="text-[9px] font-mono bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-cyan-500"
                          title="Vendre à la pièce ou au carton"
                        >
                          <option value="piece">Pièce</option>
                          <option value="pack">{item.packLabel || 'Carton'} ×{item.packSize}</option>
                        </select>
                        <span className="text-[9px] text-slate-400 font-mono">= {item.quantity} pcs</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => updateQuantity(item.productId, -1)}
                      className="p-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.saleUnit === 'pack' ? Math.round((item.quantity / item.packSize) * 1000) / 1000 : item.quantity}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setQuantity(item.productId, e.target.value)}
                      title={item.saleUnit === 'pack' ? 'Nombre de cartons' : 'Quantité (pièces / kg / L)'}
                      className="font-mono text-xs font-bold text-slate-900 dark:text-white w-14 text-center bg-transparent border border-slate-200 dark:border-slate-700 rounded p-0.5 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={() => updateQuantity(item.productId, 1)}
                      className="p-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="p-1.5 text-red-400 hover:bg-red-500/10 rounded cursor-pointer ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Client & Billing parameters */}
          <div className="border-t border-slate-200 dark:border-slate-800/60 pt-4 space-y-3 text-xs">
            {/* Client selector */}
            <div>
              <label className="text-slate-400 block mb-1">Sélection Client :</label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-200 focus:outline-none"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.balance > 0 ? `(Solde: ${format(c.balance)})` : ''}
                  </option>
                ))}
              </select>
              {selectedClient && selectedClient.loyaltyPoints > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-amber-500 mt-1">
                  <Coins className="w-3 h-3" />
                  <span>Points fidélité cumulés : {selectedClient.loyaltyPoints}</span>
                </div>
              )}
            </div>

            {/* Discount selector */}
            <div>
              <label className="text-slate-400 block mb-1">Remise Exceptionnelle (%) :</label>
              <input
                type="number"
                min={0}
                max={100}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-slate-400 block mb-1.5">Moyen de Paiement :</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['cash', 'card', 'mobile_money', 'bank_transfer'] as Sale['paymentMethod'][]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-1.5 px-2 rounded-lg border text-[10px] font-bold uppercase transition duration-150 ${
                      paymentMethod === method
                        ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                        : 'bg-slate-50 dark:bg-slate-950/20 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    {method === 'cash' && 'Espèces'}
                    {method === 'card' && 'CB / TPE'}
                    {method === 'mobile_money' && 'Mobile Pay'}
                    {method === 'bank_transfer' && 'Virement'}
                  </button>
                ))}
              </div>

              {/* Référence de paiement (hors espèces) */}
              {paymentMethod !== 'cash' && (
                <div className="mt-2">
                  <label className="text-slate-400 block mb-1">
                    {paymentMethod === 'card'
                      ? 'Réf. transaction TPE / CB :'
                      : paymentMethod === 'bank_transfer'
                      ? 'Réf. virement :'
                      : 'Réf. transaction :'}
                  </label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder={
                      paymentMethod === 'card'
                        ? 'N° d\'autorisation / ticket TPE'
                        : paymentMethod === 'bank_transfer'
                        ? 'Référence du virement'
                        : 'N° de transaction'
                    }
                    className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Livraison à domicile (le tarif est ajouté au total de la facture) */}
          <div className="border-t border-slate-200 dark:border-slate-800/60 pt-3 space-y-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deliveryEnabled}
                onChange={(e) => setDeliveryEnabled(e.target.checked)}
                className="accent-cyan-500 w-3.5 h-3.5"
              />
              <span className="text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-cyan-500" />
                Livraison à domicile
              </span>
            </label>
            {deliveryEnabled && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={deliveryType}
                  onChange={(e) => {
                    const t = e.target.value as DeliveryType;
                    setDeliveryType(t);
                    setDeliveryFee(defaultFeeFor(t));
                  }}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                >
                  {DELIVERY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(Number(e.target.value))}
                  placeholder="Tarif"
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}
          </div>

          {/* Option TVA (désactivée par défaut) */}
          <div className="border-t border-slate-200 dark:border-slate-800/60 pt-3 text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyVat}
                onChange={(e) => setApplyVat(e.target.checked)}
                className="accent-cyan-500 w-3.5 h-3.5"
              />
              <span className="text-slate-700 dark:text-slate-200 font-semibold">
                Appliquer la TVA
              </span>
              <span className="text-[10px] text-slate-400">(sinon vente sans TVA)</span>
            </label>
          </div>

          {/* Pricing calculations */}
          <div className="border-t border-slate-200 dark:border-slate-800/60 pt-4 space-y-2 text-xs font-mono text-slate-400">
            <div className="flex justify-between">
              <span>Sous-total HT :</span>
              <span className="text-slate-900 dark:text-white">{format(totals.subtotal)}</span>
            </div>
            {applyVat && (
              <div className="flex justify-between">
                <span>TVA cumulée :</span>
                <span className="text-slate-900 dark:text-white">{format(totals.vatTotal)}</span>
              </div>
            )}
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-red-400">
                <span>Remise ({discountPercent}%) :</span>
                <span>-{format(totals.discountAmount)}</span>
              </div>
            )}
            {totals.delivery > 0 && (
              <div className="flex justify-between text-cyan-500">
                <span>Livraison ({deliveryTypeLabel(deliveryType)}) :</span>
                <span>+{format(totals.delivery)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold font-sans border-t border-slate-200 dark:border-slate-800/60 pt-2 text-slate-900 dark:text-white">
              <span>Total TTC :</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">
                {format(totals.totalAmount)}
              </span>
            </div>
          </div>

          {/* Encaissement : avance / vente à crédit */}
          <div className="border-t border-slate-200 dark:border-slate-800/60 pt-3 space-y-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={advanceMode}
                onChange={(e) => { setAdvanceMode(e.target.checked); if (e.target.checked) setAmountReceived(totals.totalAmount); }}
                className="accent-cyan-500 w-3.5 h-3.5"
              />
              <span className="text-slate-700 dark:text-slate-200 font-semibold">Paiement partiel / à crédit</span>
            </label>
            {advanceMode && (
              <div>
                <label className="text-slate-400 block mb-1">Montant encaissé maintenant (Ar)</label>
                <input
                  type="number"
                  min={0}
                  max={totals.totalAmount}
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="flex justify-between mt-1 text-[11px] font-mono">
                  <span className="text-slate-400">Reste dû (créance)</span>
                  <span className="text-red-500 font-bold">{format(Math.max(0, totals.totalAmount - amountReceived))}</span>
                </div>
                <div className="mt-2">
                  <label className="text-slate-400 block mb-1">Échéance de paiement</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    title="Date à laquelle le client doit régler le reste — apparaîtra sur le calendrier"
                    className="w-full bg-white dark:bg-slate-950/20 p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Checkout button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl cursor-pointer transition duration-150 flex items-center justify-center gap-1.5"
          >
            <Receipt className="w-4 h-4" />
            Encaisser la Facture (Fidélité +{totals.loyaltyPointsEarned})
          </button>
        </div>

      </div>

      {/* Reçu / facture imprimable (composant partagé avec l'onglet Ventes) */}
      {showReceipt && (
        <ReceiptModal sale={showReceipt} company={company} onClose={() => setShowReceipt(null)} />
      )}

    </div>
  );
}
