// Service de dialogues stylés (remplace alert()/confirm() natifs du navigateur).
// API impérative : on peut appeler showAlert/showConfirm depuis n'importe quel
// gestionnaire d'événement, sans hook React. Un unique <DialogHost/> monté à la
// racine s'abonne et affiche les modales.

export type DialogVariant = 'success' | 'error' | 'warning' | 'info' | 'danger';

export interface DialogRequest {
  id: number;
  kind: 'alert' | 'confirm';
  title: string;
  message: string;
  variant: DialogVariant;
  confirmText: string;
  cancelText: string;
  resolve: (value: boolean) => void;
}

type Listener = (dialogs: DialogRequest[]) => void;

let dialogs: DialogRequest[] = [];
let listeners: Listener[] = [];
let seq = 1;

function emit() {
  for (const l of listeners) l(dialogs);
}

export function subscribeDialogs(listener: Listener): () => void {
  listeners.push(listener);
  listener(dialogs);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function resolveDialog(id: number, value: boolean) {
  const d = dialogs.find((x) => x.id === id);
  if (!d) return;
  dialogs = dialogs.filter((x) => x.id !== id);
  emit();
  d.resolve(value);
}

const defaultTitles: Record<DialogVariant, string> = {
  success: 'Succès',
  error: 'Erreur',
  warning: 'Attention',
  info: 'Information',
  danger: 'Confirmation',
};

interface AlertOptions {
  title?: string;
  variant?: DialogVariant;
  confirmText?: string;
}

interface ConfirmOptions {
  title?: string;
  variant?: DialogVariant;
  confirmText?: string;
  cancelText?: string;
}

/** Affiche une alerte stylée (bouton OK). Résout quand l'utilisateur ferme. */
export function showAlert(message: string, opts: AlertOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    const variant = opts.variant ?? 'info';
    dialogs = [
      ...dialogs,
      {
        id: seq++,
        kind: 'alert',
        message,
        title: opts.title ?? defaultTitles[variant],
        variant,
        confirmText: opts.confirmText ?? 'OK',
        cancelText: '',
        resolve: () => resolve(),
      },
    ];
    emit();
  });
}

/** Affiche une confirmation stylée. Résout true (Confirmer) ou false (Annuler). */
export function showConfirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const variant = opts.variant ?? 'danger';
    dialogs = [
      ...dialogs,
      {
        id: seq++,
        kind: 'confirm',
        message,
        title: opts.title ?? defaultTitles[variant],
        variant,
        confirmText: opts.confirmText ?? 'Confirmer',
        cancelText: opts.cancelText ?? 'Annuler',
        resolve,
      },
    ];
    emit();
  });
}
