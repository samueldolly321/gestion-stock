/**
 * Service d'authentification front — 100% PostgreSQL via l'API Express.
 * Remplace l'ancienne authentification Firebase.
 */
import { apiFetch, setToken, clearToken, getToken } from './api';
import type { User, UserRole } from '../types';

interface AuthResponse {
  token: string;
  user: User;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<User> {
  const { token, user } = await apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  setToken(token);
  return user;
}

export async function login(email: string, password: string): Promise<User> {
  const { token, user } = await apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(token);
  return user;
}

// Restaure la session au chargement de la page à partir du jeton stocké.
export async function fetchMe(): Promise<User | null> {
  if (!getToken()) return null;
  try {
    const { user } = await apiFetch<{ user: User }>('/auth/me');
    return user;
  } catch {
    clearToken(); // jeton expiré/invalide
    return null;
  }
}

export function logout(): void {
  clearToken();
}
