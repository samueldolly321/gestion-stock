/**
 * Connexion temps réel via Server-Sent Events (SSE).
 * S'abonne au flux /api/events et relaie les événements reçus.
 */
import { getToken } from './api';

export function connectRealtime(
  onEvent: (type: string, data: any) => void,
): () => void {
  const token = getToken();
  if (!token || typeof EventSource === 'undefined') return () => {};

  const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

  es.addEventListener('audit-log', (e) => {
    try {
      onEvent('audit-log', JSON.parse((e as MessageEvent).data));
    } catch {
      /* ignore payload malformé */
    }
  });

  // Retourne la fonction de fermeture propre.
  return () => es.close();
}
