import React, { useState } from 'react';
import { Printer, FileText, Receipt, ChefHat } from 'lucide-react';
import { Sale, CompanyInfo, Client } from '../types';
import { useMoney } from '../services/CurrencyContext';

interface ReceiptModalProps {
  sale: Sale;
  company?: CompanyInfo;
  /** Client de la vente (NIF / STAT / adresse imprimés pour une entreprise) */
  client?: Client | null;
  onClose: () => void;
}

/**
 * Reçu / facture imprimable d'une vente — composant UNIQUE réutilisé par la Caisse (POS)
 * et le Journal des Ventes (réimpression). Format ticket 80 mm ou facture A4 au choix.
 * (Le justificatif d'avoir des Créances est une variante distincte, non couverte ici.)
 */
export default function ReceiptModal({ sale, company, client, onClose }: ReceiptModalProps) {
  const { format } = useMoney();
  const [printFormat, setPrintFormat] = useState<'ticket' | 'a4' | 'kitchen'>('ticket');
  const reste = sale.totalAmount - sale.paidAmount;

  // Restauration : lignes à préparer en cuisine (plats), sans les boissons ni les emballages.
  const kitchenLines = (sale.items || []).filter((it: any) => it.kind === 'dish' || Array.isArray(it.recipe));
  const portions = kitchenLines.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  // Impression directe du bon de cuisine (le format change, puis l'impression est lancée).
  const printKitchen = () => {
    setPrintFormat('kitchen');
    setTimeout(() => window.print(), 80);
  };

  const renderKitchen = () => {
    const d = new Date(sale.createdAt);
    return (
      <div className="space-y-3 text-slate-950" data-testid="kitchen-ticket">
        <div className="text-center border-b-2 border-slate-950 pb-2">
          <p className="text-xl font-black tracking-wide">BON DE CUISINE</p>
          <p className="text-3xl font-black font-mono mt-1">{(sale.invoiceNumber || sale.id).replace(/^FAC-0*/, 'N° ')}</p>
          <p className="text-sm font-bold mt-1">{d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {d.toLocaleDateString('fr-FR')}</p>
        </div>
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between"><span>Client :</span><span className="font-bold">{sale.clientName || 'Client de passage'}</span></div>
          {sale.cashierName && <div className="flex justify-between"><span>Caisse :</span><span>{sale.cashierName}</span></div>}
        </div>
        <div className="border-t border-dashed border-slate-400 pt-2 space-y-2.5">
          {kitchenLines.map((it: any, i) => (
            <div key={i}>
              <p className="text-lg font-black leading-tight">
                <span className="font-mono">{Number(it.quantity) || 0} ×</span> {String(it.productName || '').toUpperCase()}
                {it.size?.label && <span className="ml-1.5 px-1.5 border-2 border-slate-950 rounded" data-testid="kitchen-size">{String(it.size.label).toUpperCase()}</span>}
              </p>
              {(it.options || []).map((o: any, j: number) => (
                <p key={j} className="text-base font-bold pl-6">{String(o.label).startsWith('+') ? '' : '+ '}{o.label}</p>
              ))}
            </div>
          ))}
        </div>
        {sale.notes && (
          <div className="border-2 border-slate-950 rounded p-2 text-sm font-bold">NOTE : {sale.notes}</div>
        )}
        <p className="text-center text-xs border-t border-dashed border-slate-400 pt-2">
          {portions} plat{portions > 1 ? 's' : ''} à préparer
        </p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Taille de page dynamique selon le format choisi (ticket / bon de cuisine 80mm, ou A4) */}
      <style>{`@media print { @page { size: ${printFormat === 'a4' ? 'A4' : '80mm auto'}; margin: ${printFormat === 'a4' ? '15mm' : '4mm'}; } }`}</style>
      <div className={`bg-white text-slate-950 rounded-2xl w-full ${printFormat === 'a4' ? 'max-w-md print-a4-card' : 'max-w-sm'} overflow-hidden shadow-2xl p-6 space-y-4 print-card animate-scale-up`}>
        {printFormat === 'kitchen' ? renderKitchen() : (<>

        <div className="text-center space-y-1">
          {company?.logo && <img src={company.logo} alt="" className="mx-auto max-h-14 max-w-[160px] object-contain" />}
          <span className="font-bold tracking-tight text-lg uppercase">{company?.name || 'Vokatra-ko ERP'}</span>
          {company?.address && <p className="text-[10px] text-slate-500">{company.address}</p>}
          {company?.phone && <p className="text-[10px] text-slate-500">Tél: {company.phone}</p>}
          {company?.email && <p className="text-[10px] text-slate-500">{company.email}</p>}
          {(company?.taxId || company?.statNumber) && (
            <p className="text-[10px] text-slate-500" data-testid="receipt-company-ids">
              {[company?.taxId && `NIF : ${company.taxId}`, company?.statNumber && `STAT : ${company.statNumber}`].filter(Boolean).join(' · ')}
            </p>
          )}
          {/* Rappel à l'écran seulement (non imprimé) : NIF / STAT de la société manquants */}
          {(!company?.taxId || !company?.statNumber) && (
            <p className="no-print text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-1" data-testid="receipt-ids-missing">
              {!company?.taxId && !company?.statNumber ? 'NIF et STAT' : !company?.taxId ? 'NIF' : 'STAT'} de votre société non renseigné{!company?.taxId && !company?.statNumber ? 's' : ''} :
              ils n'apparaîtront pas sur la facture. À compléter dans Configuration ERP (fiche société).
            </p>
          )}
          <div className="border-b border-dashed border-slate-300 py-1"></div>
        </div>

        <div className="text-[10px] space-y-1">
          <div className="flex justify-between"><span>Facture N° :</span><span className="font-bold">{sale.invoiceNumber || sale.id}</span></div>
          <div className="flex justify-between"><span>Date :</span><span>{new Date(sale.createdAt).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>Caissier :</span><span>{sale.cashierName}</span></div>
          {sale.warehouseName && <div className="flex justify-between"><span>Entrepôt :</span><span>{sale.warehouseName}</span></div>}
          <div className="flex justify-between"><span>Client :</span><span className="font-bold">{sale.clientName}</span></div>
          {client && client.address && <div className="flex justify-between gap-3"><span>Adresse :</span><span className="text-right">{client.address}</span></div>}
          {client && (client.taxNumber || client.statNumber) && (
            <div className="flex justify-between gap-3" data-testid="receipt-client-ids">
              <span>NIF / STAT client :</span>
              <span className="text-right font-mono">{[client.taxNumber && `NIF ${client.taxNumber}`, client.statNumber && `STAT ${client.statNumber}`].filter(Boolean).join(' · ')}</span>
            </div>
          )}
          <div className="border-b border-dashed border-slate-300 py-1"></div>
        </div>

        {/* Lignes d'articles */}
        <div className="space-y-1.5 text-[11px]">
          {sale.items.map((item, idx) => (
            <div key={`${item.productId}-${idx}`} className="flex justify-between items-start">
              <div>
                <span>{item.productName}{(item as any).size?.label ? ` (${(item as any).size.label})` : ''}</span>
                {Array.isArray((item as any).options) && (item as any).options.length > 0 && (
                  <span className="text-[9px] text-slate-600 block" data-testid="receipt-options">
                    {(item as any).options.map((o: any) => `${String(o.label).startsWith('+') ? '' : '+ '}${o.label} (${format(o.price)})`).join(' · ')}
                  </span>
                )}
                <span className="text-[9px] text-slate-500 block">
                  {item.packQty && item.unitLabel
                    ? `${item.packQty} ${item.unitLabel} (${item.quantity} pcs) x ${format(item.unitPrice)}`
                    : `${item.quantity} x ${format(item.unitPrice)}`}
                </span>
                {item.serials && item.serials.length > 0 && (
                  <span className="text-[9px] text-slate-600 block font-mono">
                    N° série / IMEI : {item.serials.join(', ')}
                  </span>
                )}
                {item.warrantyUntil && (
                  <span className="text-[9px] text-slate-600 block">
                    Garantie jusqu'au {item.warrantyUntil.split('-').reverse().join('/')}
                  </span>
                )}
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

        </>)}

        <div className="pt-3 space-y-2.5 no-print">
          {/* Restauration : bon de cuisine en un clic */}
          {kitchenLines.length > 0 && (
            <button
              type="button"
              onClick={printKitchen}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ChefHat className="w-4 h-4" /> Imprimer le bon de cuisine ({portions} plat{portions > 1 ? 's' : ''})
            </button>
          )}
          {/* Sélecteur de format d'impression */}
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1.5">Format d'impression</span>
            <div className={`grid gap-2 ${kitchenLines.length ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
              {kitchenLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPrintFormat('kitchen')}
                  className={`py-2 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    printFormat === 'kitchen' ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <ChefHat className="w-3.5 h-3.5" /> Bon de cuisine
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg text-xs cursor-pointer text-center flex items-center justify-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Imprimer ({printFormat === 'a4' ? 'A4' : printFormat === 'kitchen' ? 'Bon de cuisine' : 'Ticket'})
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
