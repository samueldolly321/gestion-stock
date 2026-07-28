/**
 * Client HTTP du front vers l'API Express.
 * Le JWT est conservé dans localStorage et injecté automatiquement.
 */
const API_BASE = '/api'; // proxifié vers http://localhost:3001 par Vite en dev
const TOKEN_KEY = 'stockflow_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // `no-store` : jamais de réponse GET servie depuis le cache du navigateur.
  // Évite d'afficher des données périmées (ex. un achat qui n'apparaissait qu'après
  // plusieurs rafraîchissements). Les données d'un ERP doivent toujours être fraîches.
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as any)?.error || `Erreur ${res.status}`);
  }
  return data as T;
}
