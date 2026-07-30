/**
 * Récupération de mot de passe — commande de secours.
 *
 * À utiliser quand un compte (typiquement le SUPER ADMIN) a oublié son mot de
 * passe et que personne d'autre ne peut le réinitialiser depuis l'onglet
 * Utilisateurs. Réinitialise directement le mot de passe en base.
 *
 * Usage :
 *   npm run reset-password -- <email> <nouveau_mot_de_passe>
 *
 * Exemples :
 *   npm run reset-password -- digital@salathis.com NouveauPass123
 *
 * En production (Render), lancer la commande depuis le Shell du service, ou en
 * local avec le DATABASE_URL de prod dans l'environnement.
 *
 * Sécurité : cette commande nécessite un accès au serveur / à la base — elle
 * n'est donc accessible qu'aux administrateurs système, pas via l'application.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createPool } from './index.ts';

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error('❌ Usage : npm run reset-password -- <email> <nouveau_mot_de_passe>');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('❌ Le mot de passe doit contenir au moins 6 caractères.');
    process.exit(1);
  }

  const pool = createPool();
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `UPDATE users
         SET password_hash = $1, active = true, updated_at = now()
       WHERE lower(email) = $2
       RETURNING id, name, email, role`,
      [hash, normalizedEmail],
    );

    if (result.rowCount === 0) {
      console.error(`❌ Aucun compte trouvé pour l'e-mail « ${email} ».`);
      process.exit(1);
    }

    const u = result.rows[0];
    console.log(`✅ Mot de passe réinitialisé pour ${u.name} <${u.email}> (${u.role}).`);
    console.log('   Le compte a été réactivé si nécessaire. Connectez-vous avec le nouveau mot de passe.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Erreur lors de la réinitialisation :', err?.message || err);
  process.exit(1);
});
