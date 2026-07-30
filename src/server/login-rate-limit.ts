/**
 * Limiteur anti-force-brute pour la connexion — 100 % en mémoire (aucune dépendance).
 *
 * Objectif : ralentir les attaques par essais successifs de mots de passe. On
 * compte les échecs par clé « IP + e-mail » : après `MAX_FAILURES` échecs dans
 * une fenêtre de `WINDOW_MS`, la clé est bloquée pendant `LOCK_MS`. Une connexion
 * réussie remet le compteur à zéro.
 *
 * Limites assumées (contexte : une seule instance web sur Render) :
 * - État en mémoire → réinitialisé à chaque redémarrage/redéploiement (acceptable).
 * - Clé par (IP, e-mail) : protège chaque compte sans qu'un attaquant puisse
 *   verrouiller un utilisateur légitime juste en connaissant son e-mail depuis
 *   une autre IP.
 */

const WINDOW_MS = 15 * 60 * 1000; // fenêtre d'observation des échecs (15 min)
const MAX_FAILURES = 5; // nb d'échecs tolérés avant blocage
const LOCK_MS = 15 * 60 * 1000; // durée de blocage après dépassement (15 min)
const MAX_ENTRIES = 10_000; // garde-fou mémoire (sweep au-delà)

interface Entry {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
}

const attempts = new Map<string, Entry>();

/** Purge les entrées expirées si la table grossit trop (anti-fuite mémoire). */
function sweep(now: number): void {
  if (attempts.size < MAX_ENTRIES) return;
  for (const [k, e] of attempts) {
    if (e.blockedUntil < now && now - e.firstFailureAt > WINDOW_MS) attempts.delete(k);
  }
}

/**
 * Statut de blocage d'une clé. `retryAfter` = secondes avant réessai possible.
 * `now` est injecté (le serveur passe Date.now()).
 */
export function loginRateStatus(key: string, now: number): { blocked: boolean; retryAfter: number } {
  const e = attempts.get(key);
  if (!e) return { blocked: false, retryAfter: 0 };
  if (e.blockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((e.blockedUntil - now) / 1000) };
  }
  return { blocked: false, retryAfter: 0 };
}

/** Enregistre un échec de connexion pour la clé ; déclenche le blocage au seuil. */
export function recordLoginFailure(key: string, now: number): void {
  let e = attempts.get(key);
  // Nouvelle fenêtre si aucune entrée ou fenêtre précédente expirée.
  if (!e || now - e.firstFailureAt > WINDOW_MS) {
    e = { failures: 0, firstFailureAt: now, blockedUntil: 0 };
  }
  e.failures += 1;
  if (e.failures >= MAX_FAILURES) {
    e.blockedUntil = now + LOCK_MS;
  }
  attempts.set(key, e);
  sweep(now);
}

/** Réinitialise le compteur après une connexion réussie. */
export function recordLoginSuccess(key: string): void {
  attempts.delete(key);
}
