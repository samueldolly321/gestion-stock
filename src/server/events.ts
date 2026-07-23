import type { Response } from 'express';

/**
 * Bus d'événements en mémoire pour la diffusion temps réel (SSE).
 * Chaque client connecté est une réponse HTTP maintenue ouverte.
 */
const clients = new Set<Response>();

export function addClient(res: Response): void {
  clients.add(res);
}

export function removeClient(res: Response): void {
  clients.delete(res);
}

// Diffuse un événement nommé à tous les clients connectés (format SSE).
export function publish(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}
