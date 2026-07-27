/**
 * Service front pour l'assistant IA (résumé d'activité).
 */
import { apiFetch } from './api';

export interface AiSummary {
  summary: string;
  period: 'day' | 'month';
  label: string;
}

export function generateSummary(period: 'day' | 'month'): Promise<AiSummary> {
  return apiFetch<AiSummary>('/ai/summary', { method: 'POST', body: JSON.stringify({ period }) });
}
