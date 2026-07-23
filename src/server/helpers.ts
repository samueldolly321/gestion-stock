import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { auditLogs, documentCounters, settings } from '../db/schema.ts';
import { publish } from './events.ts';

// Génère un identifiant unique (préfixe optionnel, ex: 'PRD', 'USR').
export function generateId(prefix?: string): string {
  const raw = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  return prefix ? `${prefix}-${raw}` : raw;
}

// Attribue le prochain numéro de document légal (séquence continue, sans trou) pour une
// série donnée : 'invoice' (factures, préfixe FAC) ou 'credit_note' (avoirs, préfixe AV).
// À appeler DANS la transaction du document (`tx`) : l'incrément du compteur et
// l'insertion du document partagent la même transaction, donc un échec annule les deux
// (pas de numéro « brûlé »). L'UPSERT verrouille la ligne du compteur (clé = série),
// ce qui sérialise les opérations concurrentes → aucun doublon.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function nextDocNumber(tx: Tx, kind: 'invoice' | 'credit_note'): Promise<string> {
  const [counter] = await tx
    .insert(documentCounters)
    .values({ key: kind, value: 1 })
    .onConflictDoUpdate({
      target: documentCounters.key,
      set: { value: sql`${documentCounters.value} + 1`, updatedAt: new Date().toISOString() },
    })
    .returning();

  const [cfg] = await tx.select().from(settings).where(eq(settings.id, 'global')).limit(1);
  const padding = cfg?.invoicePadding || 6;
  const prefix = kind === 'credit_note' ? (cfg?.creditNotePrefix || 'AV') : (cfg?.invoicePrefix || 'FAC');
  return `${prefix}-${String(counter.value).padStart(padding, '0')}`;
}

// Calcule le statut d'un produit selon sa quantité, son seuil et sa péremption.
export function computeProductStatus(
  quantity: number,
  minStock: number,
  expirationDate?: string | null,
): 'in_stock' | 'low_stock' | 'out_of_stock' | 'expired' {
  if (expirationDate && new Date(expirationDate) < new Date()) return 'expired';
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= minStock) return 'low_stock';
  return 'in_stock';
}

// Écrit une entrée immuable dans le journal d'audit ERP.
export async function writeAuditLog(entry: {
  userId?: string;
  userName?: string;
  action: string;
  module: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const [created] = await db
      .insert(auditLogs)
      .values({
        id: generateId('LOG'),
        userId: entry.userId ?? null,
        userName: entry.userName ?? null,
        action: entry.action,
        module: entry.module,
        entityId: entry.entityId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      })
      .returning();
    // Diffuse en temps réel à tous les clients connectés (SSE).
    publish('audit-log', created);
  } catch (err) {
    // Un échec d'audit ne doit jamais bloquer l'opération métier.
    console.error('writeAuditLog a échoué :', err);
  }
}
