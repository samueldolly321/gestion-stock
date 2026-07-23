import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

// Function to create a new connection pool.
// En production (Render, Railway…), la base est fournie via DATABASE_URL (avec SSL).
// En local, on utilise les variables SQL_* du fichier .env.
export const createPool = () => {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sep = url.includes('?') ? '&' : '?';
    const connectionString = url.includes('sslmode=') ? url : `${url}${sep}sslmode=no-verify`;
    return new Pool({ connectionString, connectionTimeoutMillis: 15000 });
  }
  return new Pool({
    host: process.env.SQL_HOST || 'localhost',
    user: process.env.SQL_USER || 'postgres',
    password: process.env.SQL_PASSWORD || 'postgres',
    database: process.env.SQL_DB_NAME || 'stockflow_db',
    port: Number(process.env.SQL_PORT) || 5432,
    connectionTimeoutMillis: 15000,
  });
};

// Create a pool instance.
const pool = createPool();

// Prevent unhandled pool-level errors from crashing the application
pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });
