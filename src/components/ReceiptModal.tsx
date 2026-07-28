import React, { useState } from 'react';
import { Printer, FileText, Receipt } from 'lucide-react';
import { Sale } from '../types';
import { useMoney } from '../services/CurrencyContext';

interface ReceiptModalProps {
  sale: Sale;
  company?: { name?: string; address?: string; phone?: string; taxId?: string };
  onClose: () => void;
}

/**
 * Reçu / facture imprimable d'une vente — composant UNIQUE réutilisé par la Caisse (POS)
 * et le Journal des Ventes (réimpression). Format ticket 80 mm ou facture A4 au choix.
 * (Le justificatif d'avoir des Créances est une variante distincte, non couverte ici.)
 */
export default function ReceiptModal({ sale, company, onClose }: ReceiptModalProps) {
  const { format } = useMoney();
  const [printFormat, setPrintFormat] = useState<'ticket' | 'a4'>('ticket');
  const reste = sale.totalAmount - sale.paidAmount;

  return (
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
          <div className="flex justify-between"><span>Facture N° :</span><span className="font-bold">{sale.invoiceNumber || sale.id}</span></div>
          <div className="flex justify-between"><span>Date :</span><span>{new Date(sale.createdAt).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Caissier :</span><span>{sale.cashierName}</span></div>
          <div className="flex justify-between"><span>Client :</span><span className="font-bold">{sale.clientName}</span></div>
          <div className="border-b border-dashed border-slate-300 py-1"></div>
        </div>

        {/* Lignes d'articles */}
        <div className="space-y-1.5 text-[11px]">
          {sale.items.map((item) => (
            <div key={item.productId} className="flex justify-between items-start">
              <div>
                <span>{item.productName}</span>
                <span className="text-[9px] text-slate-500 block">
                  {item.packQty && item.unitLabel
                    ? `${item.packQty} ${item.unitLabel} (${item.quantity} pcs) x ${format(item.unitPrice)}`
                    : `${item.quantity} x ${format(item.unitPrice)}`}
                </span>
              </div>
              <span className="font-mono">{format(item.quantity * item.unitPrice)}</span>
            </div>
          ))}
          <div className="border-b border-dashed border-slate-300 py-1"></div>
        </div>

        <div className="text-xs space-y-1 text-right font-mono">
          <div className="flex justify-between"><span>TVA :</span><span>{format(sale.vatAmount)}</span></div>
          <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-1 text-slate-950 font-sans">
            <span>TOTAL TTC :</span><span>{format(sale.totalAmount)}</span>
          </div>
          {reste > 0 && (
            <>
              <div className="flex justify-between"><span>Payé :</span><span>{format(sale.paidAmount)}</span></div>
              <div className="flex justify-between font-bold text-red-600"><span>Reste dû :</span><span>{format(reste)}</span></div>
            </>
          )}
        </div>

        <div className="text-center pt-2 text-[10px] text-slate-500 border-t border-dashed border-slate-300">
          <p>Moyen de paiement: <strong className="uppercase">{sale.paymentMethod}</strong></p>
          {sale.notes && <p className="mt-0.5">{sale.notes}</p>}
          <p className="mt-1">Points fidélité gagnés: +{sale.loyaltyPointsEarned}</p>
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
                  printFormat === 'ticket' ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" /> Ticket caisse (80mm)
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('a4')}
                className={`py-2 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  printFormat === 'a4' ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Facture A4
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg text-xs cursor-pointer text-center flex items-center justify-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Imprimer ({printFormat === 'a4' ? 'A4' : 'Ticket'})
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-xs cursor-pointer text-center"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
