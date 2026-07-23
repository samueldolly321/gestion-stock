import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Truck, ShoppingBag, HandCoins } from 'lucide-react';
import { Delivery, Purchase, Sale } from '../types';
import { deliveryTypeLabel } from '../services/deliveriesService';
import { useMoney } from '../services/CurrencyContext';

interface CalendarProps {
  deliveries: Delivery[];
  purchases: Purchase[];
  sales: Sale[];
  onNavigate: (tab: string) => void;
}

type Ev = { kind: 'delivery' | 'purchase' | 'receivable'; label: string; sub: string };

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function Calendar({ deliveries, purchases, sales, onNavigate }: CalendarProps) {
  const { format } = useMoney();
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Regroupe les événements par jour (clé YYYY-MM-DD).
  const events = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    const add = (dateStr: string | null | undefined, ev: Ev) => {
      if (!dateStr) return;
      const k = dateStr.slice(0, 10);
      (m[k] ||= []).push(ev);
    };
    deliveries.forEach((d) => {
      if (d.status === 'cancelled') return;
      add(d.scheduledDate, { kind: 'delivery', label: d.clientName || 'Livraison', sub: deliveryTypeLabel(d.type) });
    });
    purchases.forEach((p) => {
      if (p.status === 'ordered') add(p.expectedDate, { kind: 'purchase', label: p.supplierName || 'Commande', sub: 'Réception prévue' });
    });
    sales.forEach((s) => {
      if (s.type === 'return') return; // pas les avoirs
      const reste = (Number(s.totalAmount) || 0) - (Number(s.paidAmount) || 0);
      if (reste > 0.5 && s.dueDate) {
        add(s.dueDate, { kind: 'receivable', label: s.clientName || 'Créance', sub: `Échéance ${format(reste)}` });
      }
    });
    return m;
  }, [deliveries, purchases, sales, format]);

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const monthLabel = anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // lundi en tête

  const cells: (number | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (dir: number) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));

  // Totaux du mois affiché (pour le sous-titre).
  const monthKeys = Object.keys(events).filter((k) => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
  const nbDeliv = monthKeys.reduce((a, k) => a + events[k].filter((e) => e.kind === 'delivery').length, 0);
  const nbPurch = monthKeys.reduce((a, k) => a + events[k].filter((e) => e.kind === 'purchase').length, 0);
  const nbCrea = monthKeys.reduce((a, k) => a + events[k].filter((e) => e.kind === 'receivable').length, 0);

  return (
    <div className="space-y-6">
      {/* En-tête + navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-cyan-500" />
            Calendrier
          </h2>
          <p className="text-xs text-slate-400">Commandes fournisseurs (réception prévue) et livraisons planifiées.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-3 text-[10px] font-mono mr-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block"></span> Livraisons</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Commandes</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> Créances</span>
          </div>
          <button onClick={() => setAnchor(new Date())} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">Aujourd'hui</button>
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg px-1">
            <button onClick={() => shift(-1)} className="p-1.5 text-slate-400 hover:text-cyan-500"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-semibold text-slate-900 dark:text-white min-w-[130px] text-center capitalize">{monthLabel}</span>
            <button onClick={() => shift(1)} className="p-1.5 text-slate-400 hover:text-cyan-500"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 font-mono">{nbDeliv} livraison(s) · {nbPurch} commande(s) · {nbCrea} échéance(s) de créance ce mois-ci</p>

      {/* Grille */}
      <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-950/20">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-mono uppercase text-slate-400 tracking-wider">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-[92px] border-b border-r border-slate-100 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-950/10" />;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const evs = events[key] || [];
            const isToday = key === todayKey;
            return (
              <div key={i} className="min-h-[92px] border-b border-r border-slate-100 dark:border-slate-800/40 p-1.5 space-y-1 align-top">
                <div className={`text-[11px] font-mono ${isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500 text-white font-bold' : 'text-slate-400'}`}>{day}</div>
                {evs.slice(0, 3).map((e, j) => {
                  const tab = e.kind === 'delivery' ? 'deliveries' : e.kind === 'purchase' ? 'purchases' : 'receivables';
                  const cls = e.kind === 'delivery'
                    ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/20'
                    : e.kind === 'purchase'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20'
                    : 'bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20';
                  return (
                    <button
                      key={j}
                      onClick={() => onNavigate(tab)}
                      title={`${e.label} — ${e.sub}`}
                      className={`w-full text-left px-1.5 py-0.5 rounded text-[9px] truncate flex items-center gap-1 cursor-pointer transition ${cls}`}
                    >
                      {e.kind === 'delivery' ? <Truck className="w-2.5 h-2.5 shrink-0" /> : e.kind === 'purchase' ? <ShoppingBag className="w-2.5 h-2.5 shrink-0" /> : <HandCoins className="w-2.5 h-2.5 shrink-0" />}
                      <span className="truncate">{e.label}</span>
                    </button>
                  );
                })}
                {evs.length > 3 && <div className="text-[9px] text-slate-400 pl-1">+{evs.length - 3} autre(s)</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
