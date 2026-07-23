import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, BellOff, X, CheckCircle2, AlertTriangle, Info, Clock, Activity, Search } from 'lucide-react';
import { showAlert } from '../services/dialog';
import { ToastMessage, subscribeToasts, removeToast } from '../services/toast';
import { AuditLog } from '../types';

// Ré-export pour compatibilité (le type vit désormais dans services/toast).
export type { ToastMessage };

interface NotificationCenterProps {
  auditLogs?: AuditLog[];
}

export default function NotificationCenter({ auditLogs = [] }: NotificationCenterProps) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Historique de toutes les actions (journal d'audit).
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [seen, setSeen] = useState(0);
  const initialized = useRef(false);

  // Baseline : les actions déjà chargées au démarrage ne comptent pas comme « nouvelles ».
  useEffect(() => {
    if (!initialized.current && auditLogs.length > 0) {
      initialized.current = true;
      setSeen(auditLogs.length);
    }
  }, [auditLogs.length]);
  // Tant que le panneau est ouvert, tout est considéré comme vu.
  useEffect(() => {
    if (showHistory) setSeen(auditLogs.length);
  }, [showHistory, auditLogs.length]);

  const unseen = Math.max(0, auditLogs.length - seen);
  const filteredLogs = auditLogs.filter((l) => {
    if (!historySearch.trim()) return true;
    const s = historySearch.toLowerCase();
    return (l.action || '').toLowerCase().includes(s)
      || (l.module || '').toLowerCase().includes(s)
      || (l.userName || '').toLowerCase().includes(s);
  });

  useEffect(() => subscribeToasts(setToasts), []);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      showAlert("Votre navigateur ne prend pas en charge les notifications de bureau.", { variant: 'warning' });
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        new Notification("Vokatra-ko", {
          body: "Les notifications système sont maintenant activées !",
          icon: "https://api.dicebear.com/7.x/identicon/svg?seed=vokatra"
        });
      }
    } catch (error) {
      console.error("Erreur de demande de permission de notification:", error);
    }
  };

  const getIcon = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-cyan-500 dark:text-cyan-400 shrink-0" />;
    }
  };

  // Fond opaque (lisible en thème clair ET sombre) + bordure colorée par type.
  const getCardStyle = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success':
        return 'border-emerald-500/40 bg-white dark:bg-slate-900';
      case 'warning':
        return 'border-amber-500/40 bg-white dark:bg-slate-900';
      case 'error':
        return 'border-rose-500/40 bg-white dark:bg-slate-900';
      default:
        return 'border-cyan-500/40 bg-white dark:bg-slate-900';
    }
  };

  const getAccent = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-500';
      case 'warning':
        return 'bg-amber-500';
      case 'error':
        return 'bg-rose-500';
      default:
        return 'bg-cyan-500';
    }
  };

  return (
    <>
      {/* Cloche « Historique des actions » (journal complet), en bas à droite. */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={() => setShowHistory(true)}
          title="Voir toutes les actions effectuées"
          className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-medium tracking-wide shadow-lg transition cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Historique</span>
          {unseen > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-cyan-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unseen > 99 ? '99+' : unseen}
            </span>
          )}
        </button>
      </div>

      {/* 2. Overlaid Floating Toasts container */}
      <div
        id="toast-container"
        className="fixed top-16 right-4 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={`pointer-events-auto w-full p-4 pl-5 border rounded-xl shadow-xl flex gap-3 relative overflow-hidden ${getCardStyle(
                toast.type
              )}`}
            >
              {/* Decorative side accent glow */}
              <div className={`absolute top-0 left-0 w-1.5 h-full ${getAccent(toast.type)}`} />

              {getIcon(toast.type)}

              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide truncate">
                    {toast.title}
                  </h4>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 flex items-center gap-1 shrink-0">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(toast.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-normal break-words font-medium">
                  {toast.message}
                </p>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="absolute top-2.5 right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 3. Panneau latéral : historique complet des actions (journal d'audit). */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            className="fixed inset-0 z-[60] flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowHistory(false)}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.aside
              className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/40">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                    <Activity className="w-4 h-4 text-cyan-500" />
                    Historique des actions
                  </h3>
                  <p className="text-[10px] text-slate-400">{auditLogs.length} action(s) enregistrée(s)</p>
                </div>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-4 h-4" /></button>
              </div>

              <div className="p-3 border-b border-slate-200 dark:border-slate-800">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Rechercher (action, module, utilisateur)…"
                    className="w-full bg-white dark:bg-slate-950/30 pl-8 pr-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredLogs.length === 0 ? (
                  <p className="text-center text-slate-500 text-xs py-10">
                    {auditLogs.length === 0 ? 'Aucune action enregistrée pour le moment.' : 'Aucun résultat pour cette recherche.'}
                  </p>
                ) : (
                  filteredLogs.map((log) => (
                    <div key={log.id} className="p-2.5 bg-slate-50 dark:bg-slate-950/25 border border-slate-200 dark:border-slate-800/40 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 shrink-0">{log.module}</span>
                        <span className="text-[9px] font-mono text-slate-400 flex items-center gap-1 shrink-0">
                          <Clock className="w-2.5 h-2.5" />{new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-200 mt-1.5 leading-snug break-words">{log.action}</p>
                      {log.userName && <p className="text-[10px] text-slate-400 mt-0.5">par {log.userName}</p>}
                    </div>
                  ))
                )}
              </div>

              {/* Pied : réglage discret des notifications système du navigateur. */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                {permission === 'granted' ? (
                  <p className="text-[10px] text-emerald-500 flex items-center gap-1.5"><Bell className="w-3 h-3" /> Notifications bureau activées (actions des autres utilisateurs, même onglet en arrière-plan).</p>
                ) : permission === 'denied' ? (
                  <p className="text-[10px] text-slate-400 flex items-center gap-1.5"><BellOff className="w-3 h-3" /> Notifications bureau bloquées — à réautoriser dans les réglages du navigateur.</p>
                ) : (
                  <button
                    onClick={requestNotificationPermission}
                    className="w-full text-[11px] font-semibold px-3 py-2 rounded-lg border border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/10 flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <Bell className="w-3.5 h-3.5" /> Activer les notifications bureau
                  </button>
                )}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
