/**
 * Serveur API Express — passerelle entre le front React et PostgreSQL.
 * Le navigateur ne peut pas parler à Postgres directement : il appelle cette API.
 *
 * Lancement :  npm run server
 */
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { sql } from 'drizzle-orm';
import { db } from './db/index.ts';
import { ensureSchema } from './db/ensure-schema.ts';
import { authRouter } from './server/routes/auth.ts';
import { categoriesRouter } from './server/routes/categories.ts';
import { productsRouter } from './server/routes/products.ts';
import { movementsRouter } from './server/routes/movements.ts';
import { clientsRouter } from './server/routes/clients.ts';
import { suppliersRouter } from './server/routes/suppliers.ts';
import { supplierProductsRouter } from './server/routes/supplierProducts.ts';
import { clientPricesRouter } from './server/routes/clientPrices.ts';
import { salesRouter } from './server/routes/sales.ts';
import { auditsRouter } from './server/routes/audits.ts';
import { auditLogsRouter } from './server/routes/auditLogs.ts';
import { brandsRouter } from './server/routes/brands.ts';
import { warehousesRouter } from './server/routes/warehouses.ts';
import { settingsRouter } from './server/routes/settings.ts';
import { deliveriesRouter } from './server/routes/deliveries.ts';
import { usersRouter } from './server/routes/users.ts';
import { purchasesRouter } from './server/routes/purchases.ts';
import { expensesRouter } from './server/routes/expenses.ts';
import { paymentsRouter } from './server/routes/payments.ts';
import { eventsRouter } from './server/routes/events.ts';
import { aiRouter } from './server/routes/ai.ts';

const app = express();
// Derrière le proxy Render : permet à req.ip de refléter l'IP réelle du client
// (via X-Forwarded-For) — utilisé par le limiteur anti-force-brute du login.
app.set('trust proxy', 1);
app.use(express.json());

// CORS simple pour le dev (front sur :3000, API sur :3001)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.APP_URL || 'http://localhost:3000');
  res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Routes d'authentification (register / login / me)
app.use('/api/auth', authRouter);

// Routes catégories / sous-catégories
app.use('/api/categories', categoriesRouter);

// Routes produits & mouvements de stock
app.use('/api/products', productsRouter);
app.use('/api/movements', movementsRouter);

// Routes partenaires : clients & fournisseurs
app.use('/api/clients', clientsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/supplier-products', supplierProductsRouter);
app.use('/api/client-prices', clientPricesRouter);

// Routes ventes (POS)
app.use('/api/sales', salesRouter);

// Routes inventaires & journal d'audit
app.use('/api/audits', auditsRouter);
app.use('/api/audit-logs', auditLogsRouter);

// Routes catalogue : marques & entrepôts
app.use('/api/brands', brandsRouter);
app.use('/api/warehouses', warehousesRouter);

// Route réglages entreprise
app.use('/api/settings', settingsRouter);

// Routes livraisons
app.use('/api/deliveries', deliveriesRouter);

// Routes gestion des utilisateurs (Super Admin / Admin)
app.use('/api/users', usersRouter);

// Routes achats / fournisseurs
app.use('/api/purchases', purchasesRouter);

// Routes dépenses diverses
app.use('/api/expenses', expensesRouter);

// Historique des règlements (clients / fournisseurs)
app.use('/api/payments', paymentsRouter);

// Flux temps réel (Server-Sent Events)
app.use('/api/events', eventsRouter);

// Assistant IA (résumé d'activité)
app.use('/api/ai', aiRouter);

// Vérifie que l'API tourne et que la base répond.
app.get('/api/health', async (_req, res) => {
  try {
    const result = await db.execute(sql`select current_database() as db, current_user as usr`);
    const row = (result as any).rows?.[0] ?? {};
    res.json({ status: 'ok', database: row.db, user: row.usr });
  } catch (err) {
    console.error('Health check DB error:', err);
    res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});

// En production (Render…), on sert le front React buildé (dist/) depuis la même origine
// que l'API : les appels `/api` du front pointent alors sur ce serveur, sans CORS.
const distDir = path.resolve('dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  // Toute route GET hors /api renvoie index.html (routing côté client React).
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distDir, 'index.html'));
    }
    next();
  });
}

const PORT = Number(process.env.PORT) || 3001;

// Garantit la présence des tables récentes (idempotent) AVANT d'accepter du trafic.
// Un échec ne bloque pas le démarrage (le serveur reste up, on logge simplement).
ensureSchema()
  .then(() => console.log('✓ Schéma vérifié (ensureSchema).'))
  .catch((err) => console.error('ensureSchema a échoué (démarrage poursuivi) :', err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`🚀 API Vokatra-ko démarrée sur le port ${PORT}`);
    });
  });
