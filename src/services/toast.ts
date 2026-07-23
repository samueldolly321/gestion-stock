// Store de toasts impératif (non bloquant, auto-dismiss).
// showToast() peut être appelé depuis n'importe où ; le <NotificationCenter/>
// monté à la racine s'abonne et affiche la pile.

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  timestamp: string;
}

type Listener = (toasts: ToastMessage[]) => void;

let toasts: ToastMessage[] = [];
let listeners: Listener[] = [];
let seq = 1;

const AUTO_DISMISS_MS = 5000;
const MAX_TOASTS = 5;

function emit() {
  for (const l of listeners) l(toasts);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.push(listener);
  listener(toasts);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const defaultTitles: Record<ToastMessage['type'], string> = {
  success: 'Succès',
  error: 'Erreur',
  warning: 'Attention',
  info: 'Information',
};

interface ToastOptions {
  title?: string;
  type?: ToastMessage['type'];
  id?: string;
  timestamp?: string;
  /** Durée avant disparition en ms. `null` = ne disparaît pas automatiquement. */
  duration?: number | null;
}

export function showToast(message: string, opts: ToastOptions = {}): string {
  const type = opts.type ?? 'success';
  const id = opts.id ?? `t${seq++}-${Date.now()}`;
  const toast: ToastMessage = {
    id,
    title: opts.title ?? defaultTitles[type],
    message,
    type,
    timestamp: opts.timestamp ?? new Date().toISOString(),
  };
  // Évite les doublons (ex. même id de log SSE) et borne la pile.
  toasts = [toast, ...toasts.filter((t) => t.id !== id)].slice(0, MAX_TOASTS);
  emit();

  const duration = opts.duration === undefined ? AUTO_DISMISS_MS : opts.duration;
  if (duration != null) {
    setTimeout(() => removeToast(id), duration);
  }
  return id;
}
