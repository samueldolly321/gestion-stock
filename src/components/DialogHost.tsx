import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, XCircle, HelpCircle } from 'lucide-react';
import { subscribeDialogs, resolveDialog, DialogRequest, DialogVariant } from '../services/dialog';

const variantStyle: Record<
  DialogVariant,
  { icon: React.ReactNode; iconWrap: string; confirmBtn: string; accent: string }
> = {
  success: {
    icon: <CheckCircle2 className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />,
    iconWrap: 'bg-emerald-100 dark:bg-emerald-500/10 ring-emerald-500/20',
    confirmBtn: 'bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500/40',
    accent: 'from-emerald-500/70',
  },
  error: {
    icon: <XCircle className="w-6 h-6 text-rose-500 dark:text-rose-400" />,
    iconWrap: 'bg-rose-100 dark:bg-rose-500/10 ring-rose-500/20',
    confirmBtn: 'bg-rose-600 hover:bg-rose-500 focus:ring-rose-500/40',
    accent: 'from-rose-500/70',
  },
  warning: {
    icon: <AlertTriangle className="w-6 h-6 text-amber-500 dark:text-amber-400" />,
    iconWrap: 'bg-amber-100 dark:bg-amber-500/10 ring-amber-500/20',
    confirmBtn: 'bg-amber-600 hover:bg-amber-500 focus:ring-amber-500/40',
    accent: 'from-amber-500/70',
  },
  info: {
    icon: <Info className="w-6 h-6 text-cyan-500 dark:text-cyan-400" />,
    iconWrap: 'bg-cyan-100 dark:bg-cyan-500/10 ring-cyan-500/20',
    confirmBtn: 'bg-cyan-600 hover:bg-cyan-500 focus:ring-cyan-500/40',
    accent: 'from-cyan-500/70',
  },
  danger: {
    icon: <HelpCircle className="w-6 h-6 text-rose-500 dark:text-rose-400" />,
    iconWrap: 'bg-rose-100 dark:bg-rose-500/10 ring-rose-500/20',
    confirmBtn: 'bg-rose-600 hover:bg-rose-500 focus:ring-rose-500/40',
    accent: 'from-rose-500/70',
  },
};

export default function DialogHost() {
  const [dialogs, setDialogs] = useState<DialogRequest[]>([]);
  useEffect(() => subscribeDialogs(setDialogs), []);

  // On affiche la dernière demande empilée (la plus récente).
  const current = dialogs[dialogs.length - 1];

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveDialog(current.id, false);
      if (e.key === 'Enter') resolveDialog(current.id, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key="dialog-backdrop"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => resolveDialog(current.id, false)}
        >
          <motion.div
            key={current.id}
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl"
          >
            {/* Filet d'accent coloré en haut */}
            <div
              className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${variantStyle[current.variant].accent} to-transparent`}
            />

            <div className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ring-1 ${variantStyle[current.variant].iconWrap}`}
                >
                  {variantStyle[current.variant].icon}
                </div>
                <div className="min-w-0 pt-0.5">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {current.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line break-words">
                    {current.message}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2.5">
                {current.kind === 'confirm' && (
                  <button
                    onClick={() => resolveDialog(current.id, false)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400/40"
                  >
                    {current.cancelText}
                  </button>
                )}
                <button
                  autoFocus
                  onClick={() => resolveDialog(current.id, true)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition cursor-pointer focus:outline-none focus:ring-2 ${variantStyle[current.variant].confirmBtn}`}
                >
                  {current.confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
