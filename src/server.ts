/**
 * Serveur API Express — passerelle entre le front React et PostgreSQL.
 * Le navigateur ne peut pas parler à Postgres directement : il appelle cette API.
 *
 * Lancement :  npm run server
 */
import 'dotenv/config';
import express from 'express';
import { sql } from 'drizzle-orm';
import { db } from './db/index.ts';
import { authRouter } from './server/routes/auth.ts';
import { categoriesRouter } from './server/routes/categories.ts';
import { productsRouter } from './server/routes/products.ts';
import { movementsRouter } from './server/routes/movements.ts';
import { clientsRouter } from './server/routes/clients.ts';
import { suppliersRouter } from './server/routes/suppliers.ts';
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

const app = express();
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

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`🚀 API Vokatra-ko démarrée sur http://localhost:${PORT}`);
  console.log(`   Test santé : http://localhost:${PORT}/api/health`);
});
