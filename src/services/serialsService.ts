/**
 * Numéros de série / IMEI (API) — voir src/server/routes/serials.ts.
 */
import { apiFetch } from './api';
import type { ProductSerial } from '../types';

export function listSerials(params: { productId?: string; status?: string } = {}): Promise<ProductSerial[]> {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return apiFetch<ProductSerial[]>(`/serials${q ? `?${q}` : ''}`);
}

export interface SerialLookup {
  serial: ProductSerial;
  product: { id: string; name: string; sku: string; warrantyMonths: number } | null;
  warehouseName: string;
  warrantyActive: boolean;
}
export function lookupSerial(serial: string): Promise<SerialLookup> {
  return apiFetch<SerialLookup>(`/serials/lookup/${encodeURIComponent(serial.trim())}`);
}

export function registerSerials(data: { productId: string; warehouseId: string; serials: string[] }): Promise<{ registered: number; filledExisting: number; addedToStock: number }> {
  return apiFetch('/serials/register', { method: 'POST', body: JSON.stringify(data) });
}

export function transferSerial(id: string, toWarehouseId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/serials/${id}/transfer`, { method: 'POST', body: JSON.stringify({ toWarehouseId }) });
}

export function retireSerial(id: string, reason: string, defective: boolean): Promise<{ ok: boolean }> {
  return apiFetch(`/serials/${id}/lost`, { method: 'POST', body: JSON.stringify({ reason, defective }) });
}

export function deleteSerial(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/serials/${id}`, { method: 'DELETE' });
}

/** Découpe une saisie (une par ligne, ou séparée par virgule / point-virgule) en numéros uniques. */
export function splitSerials(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const s = raw.trim().replace(/\s+/g, '');
    if (s && !seen.has(s.toUpperCase())) {
      seen.add(s.toUpperCase());
      out.push(s);
    }
  }
  return out;
}
