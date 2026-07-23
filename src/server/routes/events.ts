import { Router } from 'express';
import { verifyToken } from '../auth-middleware.ts';
import { addClient, removeClient } from '../events.ts';

export const eventsRouter = Router();

/**
 * GET /api/events?token=JWT — flux temps réel (Server-Sent Events).
 * EventSource ne peut pas envoyer d'en-tête Authorization : le jeton passe en query.
 */
eventsRouter.get('/', (req, res) => {
  const token = String(req.query.token || '');
  try {
    verifyToken(token);
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // désactive le buffering côté proxy
  res.flushHeaders?.();
  res.write(': connected\n\n');

  addClient(res);

  // Battement de cœur pour maintenir la connexion ouverte.
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* la connexion sera nettoyée au close */
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
});
