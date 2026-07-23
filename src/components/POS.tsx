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
  Printer,
  FileText,
  Truck
} from 'lucide-react';
import { Product, Client, Sale, User, TransactionItem, DeliveryType } from '../types';
import { createSale } from '../services/salesService';
import { createDelivery, DELIVERY_TYPES, defaultFeeFor, deliveryTypeLabel } from '../services/deliveriesService';
import { showAlert } from '../services/dialog';
import { useMoney } from '../services/CurrencyContext';
import confetti from 'canvas-confetti';

interface POSProps {
  products: Product[];
  clients: Client[];
  user: User;
  onRefresh: () => void;
  currencySymbol: string;
  company?: { name?: string; address?: string; phone?: string; taxId?: string };
}

export default function POS({
  products,
  clients,
  user,
  onRefresh,
  currencySymbol,
  company
}: POSProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<Sale['paymentMethod']>('cash');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
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
  const [printFormat, setPrintFormat] = useState<'ticket' | 'a4'>('ticket');

  // Formatage monétaire (Ariary base / Euro converti)
  const { format } = useMoney();

  // Filter clients to find active details
  const selectedClient = useMemo(() => {
    return clients.find((c) => c.id === selectedClientId) || null;
  }, [clients, selectedClientId]);

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

  // Add product to cart
  const addToCart = (product: Product) => {
    // Check if product quantity limit reached
    const cartItem = cart.find((item) => item.productId === product.id);
    if (cartItem && cartItem.quantity >= product.quantity) {
      showAlert(`Stock insuffisant. Seulement ${product.quantity} disponibles.`, { variant: 'warning' });
      return;
    }

    if (cartItem) {
      setCart(
        cart.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice }
            : item
        )
      );
    } else {
      const newItem: TransactionItem = {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 1,
        unitPrice: product.salePrice,
        discount: 0,
        tax: product.vatRate,
        total: product.salePrice
      };
      setCart([...cart, newItem]);
    }
  };

  // Adjust quantity in cart
  const updateQuantity = (productId: string, delta: number) => {
    const p = products.find((prod) => prod.id === productId);
    if (!p) return;

    setCart(
      cart
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta;
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
        .filter(Boolean) as TransactionItem[]
    );
  };

  // Définit une quantité absolue (saisie directe au clavier). Bornée à [1, stock].
  const setQuantity = (productId: string, value: number | string) => {
    const p = products.find((prod) => prod.id === productId);
    if (!p) return;
    let q = Math.floor(Number(value) || 0);
    q = Math.max(1, Math.min(q, p.quantity));
    setCart(cart.map((item) => item.productId === productId
      ? { ...item, quantity: q, total: q * item.unitPrice * (1 - item.discount / 100) }
      : item));
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
      vatTotal += itemSubtotal * (item.tax / 100);
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
  }, [cart, discountPercent, deliveryEnabled, deliveryFee]);

  // Submit checkout — un seul appel API : le serveur crée la vente,
  // déduit le stock et crédite la fidélité en transaction.
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    try {
      // Notes finales : réf. de paiement (hors espèces) + livraison éventuelle.
      const noteParts: string[] = [];
      if (paymentRef && paymentMethod !== 'cash') noteParts.push(`[Réf. paiement : ${paymentRef}]`);
      if (deliveryEnabled) noteParts.push(`[Livraison ${deliveryTypeLabel(deliveryType)} : ${format(totals.delivery)}]`);
      if (notes) noteParts.push(notes);
      const notesFinal = noteParts.join(' ').trim();

      const created = await createSale({
        type: 'invoice',
        clientId: selectedClientId,
        clientName: selectedClient?.name || 'Client de Passage',
        status: 'delivered',
        items: cart,
        vatAmount: totals.vatTotal,
        totalAmount: totals.totalAmount, // inclut le tarif de livraison
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
                    className="p-3 bg-white hover:bg-slate-50 dark:bg-slate-900/40 dark:hover:bg-slate-800/60 disabled:opacity-40 border border-slate-200 dark:border-slate-800 rounded-xl transition duration-150 flex flex-col justify-between text-left h-36 cursor-pointer"
                  >
                    <div className="flex gap-2.5 items-start">
                      <img
                        src={p.image || 'https://api.dicebear.com/7.x/identicon/svg'}
                        alt={p.name}
                        className="w-9 h-9 rounded-lg object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate">{p.name}</h4>
                        <span className="text-[9px] text-cyan-400 font-mono block mt-0.5">{p.sku}</span>
                        {p.supplierName && (
                          <span className="text-[9px] text-slate-400 block truncate">Fourn. : {p.supplierName}</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 w-full">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Disponible :</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-300">{p.quantity - quantityInCart}</span>
                      </div>
                      <div className="flex justify-between items-end mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-800/50">
                        <span className="text-xs font-bold font-mono text-cyan-400">
                          {format(p.salePrice)}
                        </span>
                        {quantityInCart > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 font-mono rounded">
                            {quantityInCart} dans panier
                          </span>
                        )}
                      </div>
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
                    <span className="text-[10px] text-slate-400 font-mono">{format(item.unitPrice)} HT</span>
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
                      min={1}
                      value={item.quantity}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setQuantity(item.productId, e.target.value)}
                      className="font-mono text-xs font-bold text-slate-900 dark:text-white w-10 text-center bg-transparent border border-slate-200 dark:border-slate-700 rounded p-0.5 focus:outline-none focus:border-cyan-500"
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

          {/* Pricing calculations */}
          <div className="border-t border-slate-200 dark:border-slate-800/60 pt-4 space-y-2 text-xs font-mono text-slate-400">
            <div className="flex justify-between">
              <span>Sous-total HT :</span>
              <span className="text-slate-900 dark:text-white">{format(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>TVA cumulée :</span>
              <span className="text-slate-900 dark:text-white">{format(totals.vatTotal)}</span>
            </div>
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

      {/* RECEIPT MODAL PRINT TEMPLATE */}
      {showReceipt && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          {/* Taille de page dynamique selon le format choisi (ticket 80mm ou A4) */}
          <style>{`@media print { @page { size: ${printFormat === 'a4' ? 'A4' : '80mm auto'}; margin: ${printFormat === 'a4' ? '15mm' : '4mm'}; } }`}</style>
          <div className={`bg-white text-slate-950 rounded-2xl w-full ${printFormat === 'a4' ? 'max-w-md print-a4-card' : 'max-w-sm'} overflow-hidden shadow-2xl p-6 space-y-4 print-card animate-scale-up`}>
            
            <div className="text-center space-y-1">
              <span className="font-bold tracking-tight text-lg uppercase">{company?.name || 'Vokatra-ko ERP'}</span>
              {company?.address && <p className="text-[10px] text-slate-500">{company.address}</p>}
              {company?.phone && <p className="text-[10px] text-slate-500">Tél: {company.phone}</p>}
              {company?.taxId && <p className="text-[10px] text-slate-500">NIF / Stat: {company.taxId}</p>}
              <div className="border-b border-dashed border-slate-300 py-1"></div>
            </div>

            <div className="text-[10px] space-y-1">
              <div className="flex justify-between">
                <span>Facture N° :</span>
                <span className="font-bold">{showReceipt.invoiceNumber || showReceipt.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Date :</span>
                <span>{new Date(showReceipt.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Caissier :</span>
                <span>{showReceipt.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span>Client :</span>
                <span className="font-bold">{showReceipt.clientName}</span>
              </div>
              <div className="border-b border-dashed border-slate-300 py-1"></div>
            </div>

            {/* Cart products receipt list */}
            <div className="space-y-1.5 text-[11px]">
              {showReceipt.items.map((item) => (
                <div key={item.productId} className="flex justify-between items-start">
                  <div>
                    <span>{item.productName}</span>
                    <span className="text-[9px] text-slate-500 block">
                      {item.quantity} x {format(item.unitPrice)}
                    </span>
                  </div>
                  <span className="font-mono">{format(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
              <div className="border-b border-dashed border-slate-300 py-1"></div>
            </div>

            <div className="text-xs space-y-1 text-right font-mono">
              <div className="flex justify-between">
                <span>TVA :</span>
                <span>{format(showReceipt.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-1 text-slate-950 font-sans">
                <span>TOTAL TTC :</span>
                <span>{format(showReceipt.totalAmount)}</span>
              </div>
              {showReceipt.paidAmount < showReceipt.totalAmount && (
                <>
                  <div className="flex justify-between"><span>Payé :</span><span>{format(showReceipt.paidAmount)}</span></div>
                  <div className="flex justify-between font-bold text-red-600"><span>Reste dû :</span><span>{format(showReceipt.totalAmount - showReceipt.paidAmount)}</span></div>
                </>
              )}
            </div>

            <div className="text-center pt-2 text-[10px] text-slate-500 border-t border-dashed border-slate-300">
              <p>Moyen de paiement: <strong className="uppercase">{showReceipt.paymentMethod}</strong></p>
              {showReceipt.notes && <p className="mt-0.5">{showReceipt.notes}</p>}
              <p className="mt-1">Points fidélité gagnés: +{showReceipt.loyaltyPointsEarned}</p>
              <p className="font-bold mt-2">Merci de votre visite !</p>
            </div>

            <div className="pt-3 space-y-2.5 no-print">
              {/* Sélecteur de format d'impression */}
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1.5">Format d'impression</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintFormat('ticket')}
                    className={`py-2 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      printFormat === 'ticket'
                        ? 'bg-slate-950 text-white border-slate-950'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Ticket caisse (80mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintFormat('a4')}
                    className={`py-2 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      printFormat === 'a4'
                        ? 'bg-slate-950 text-white border-slate-950'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Facture A4
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg text-xs cursor-pointer text-center flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  Imprimer ({printFormat === 'a4' ? 'A4' : 'Ticket'})
                </button>
                <button
                  onClick={() => setShowReceipt(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-xs cursor-pointer text-center"
                >
                  Fermer
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
