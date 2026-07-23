/**
 * Script de diagnostic : vérifie que l'on peut se connecter à la base "stock".
 * Lancement :  npm run db:check
 */
import 'dotenv/config';
import { createPool } from './index.ts';

async function main() {
  const pool = createPool();
  const cfg = {
    host: process.env.SQL_HOST || 'localhost',
    port: process.env.SQL_PORT || '5432',
    database: process.env.SQL_DB_NAME || 'stockflow_db',
    user: process.env.SQL_USER || 'postgres',
  };
  console.log(`→ Connexion à postgres://${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ...`);

  try {
    const res = await pool.query('SELECT version(), current_database(), current_user');
    const row = res.rows[0];
    console.log('✅ Connexion réussie !');
    console.log('   Base      :', row.current_database);
    console.log('   Utilisateur:', row.current_user);
    console.log('   Version   :', String(row.version).split(',')[0]);

    // Liste les tables existantes dans le schéma public
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    if (tables.rows.length === 0) {
      console.log('   Tables    : (aucune — lancez "npm run db:push" pour les créer)');
    } else {
      console.log('   Tables    :', tables.rows.map((r) => r.table_name).join(', '));
    }
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Échec de connexion :', err instanceof Error ? err.message : err);
    console.error('\nVérifiez que :');
    console.error('  1. PostgreSQL est démarré et écoute sur le port', cfg.port);
    console.error('  2. La base "stock" existe et l\'utilisateur "user" y a accès');
    console.error('  3. Les valeurs SQL_* du fichier .env sont correctes');
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

main();
