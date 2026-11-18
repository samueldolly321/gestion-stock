import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { settings, categories } from '../../db/schema.ts';
import { requireAuth, requireRole, type AuthedRequest } from '../auth-middleware.ts';
import { writeAuditLog, generateId } from '../helpers.ts';
import { cleanSectors, sectorLabel } from '../../services/sectors.ts';

export const settingsRouter = Router();

const MANAGE_ROLES = ['Super Admin', 'Admin', 'Manager'];

// Contenus par défaut si l'administrateur n'a pas encore personnalisé les pages.
const DEFAULT_ABOUT =
  "Vokatra-ko est une solution de gestion de stock et de point de vente (ERP) pensée pour les commerces, grossistes et magasins.\n\n" +
  "Elle réunit la gestion des articles, des achats et des ventes, la comptabilité et le pilotage de l'activité au sein d'une seule plateforme, hébergée sur votre propre base de données.\n\n" +
  "Ce texte est personnalisable dans Configuration ERP.";
const DEFAULT_PRIVACY =
  "Vos données sont hébergées sur votre propre base de données (PostgreSQL) : elles restent sous votre contrôle, sans dépendance à un cloud tiers.\n\n" +
  "Les mots de passe sont stockés de façon sécurisée (hachage) et l'accès aux fonctionnalités est contrôlé par un système de rôles (RBAC).\n\n" +
  "Ce texte est personnalisable dans Configuration ERP.";

/**
 * GET /api/settings/public — infos publiques (sans authentification) pour le portail de
 * connexion : marque + pages « À propos » / « Confidentialité ». Aucune donnée sensible.
 */
settingsRouter.get('/public', async (_req, res) => {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.id, 'global')).limit(1);
    res.json({
      brandName: row?.brandName ?? null,
      companyName: row?.companyName ?? null,
      aboutText: row?.aboutText || DEFAULT_ABOUT,
      privacyText: row?.privacyText || DEFAULT_PRIVACY,
    });
  } catch (err) {
    console.error('get public settings error:', err);
    res.json({ brandName: null, companyName: null, aboutText: DEFAULT_ABOUT, privacyText: DEFAULT_PRIVACY });
  }
});

/** GET /api/settings — renvoie les réglages globaux (ou null si jamais enregistrés). */
settingsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.id, 'global')).limit(1);
    res.json(row ?? null);
  } catch (err) {
    console.error('get settings error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des réglages.' });
  }
});

/**
 * PUT /api/settings/sectors — enregistre les secteurs d'activité (« Quel est votre commerce ? »)
 * et crée, en option, les catégories proposées choisies (celles qui existent déjà sont
 * ignorées, sans tenir compte des majuscules). Ne touche à aucun autre réglage.
 * Body : { sectors: string[], categories?: { name, children?: string[] }[] }
 */
settingsRouter.put('/sectors', requireAuth, requireRole(...MANAGE_ROLES), async (req: AuthedRequest, res) => {
  try {
    const b = req.body ?? {};
    const chosen = cleanSectors(b.sectors);
    if (chosen.length === 0) return res.status(400).json({ error: 'Choisissez au moins un secteur.' });
    const wanted: { name: string; children: string[] }[] = (Array.isArray(b.categories) ? b.categories : [])
      .map((c: any) => ({
        name: String(c?.name ?? '').trim().slice(0, 80),
        children: (Array.isArray(c?.children) ? c.children : []).map((x: any) => String(x ?? '').trim().slice(0, 80)).filter(Boolean),
      }))
      .filter((c: { name: string }) => c.name)
      .slice(0, 60);

    const result = await db.transaction(async (tx) => {
      const now = new Date().toISOString();
      await tx
        .insert(settings)
        .values({ id: 'global', businessSectors: chosen, updatedAt: now })
        .onConflictDoUpdate({ target: settings.id, set: { businessSectors: chosen, updatedAt: now } });

      let created = 0;
      const existing = await tx.select().from(categories);
      const key = (s: string) => s.toLowerCase();
      for (const c of wanted) {
        let parent = existing.find((e) => !e.parentId && key(e.name) === key(c.name));
        if (!parent) {
          const [row] = await tx.insert(categories).values({ id: generateId('CAT'), name: c.name, parentId: null, path: c.name }).returning();
          existing.push(row);
          parent = row;
          created++;
        }
        for (const ch of c.children) {
          if (existing.some((e) => e.parentId === parent!.id && key(e.name) === key(ch))) continue;
          const [row] = await tx
            .insert(categories)
            .values({ id: generateId('CAT'), name: ch, parentId: parent.id, path: `${parent.name} > ${ch}` })
            .returning();
          existing.push(row);
          created++;
        }
      }
      const [row] = await tx.select().from(settings).where(eq(settings.id, 'global')).limit(1);
      return { settings: row, createdCategories: created };
    });

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: `Secteur d'activité : ${chosen.map(sectorLabel).join(', ')}${result.createdCategories ? ` (+${result.createdCategories} catégories)` : ''}`,
      module: 'Paramètres',
      entityId: 'global',
    });
    res.json(result);
  } catch (err) {
    console.error('save sectors error:', err);
    res.status(500).json({ error: "Erreur lors de l'enregistrement du secteur d'activité." });
  }
});

/** PUT /api/settings — crée ou met à jour la ligne unique 'global' (upsert). */
settingsRouter.put('/', requireAuth, requireRole(...MANAGE_ROLES), async (req: AuthedRequest, res) => {
  try {
    const b = req.body ?? {};
    const values = {
      id: 'global',
      companyName: b.companyName ?? null,
      brandName: b.brandName ? String(b.brandName).slice(0, 40) : null,
      logo: b.logo ?? null,
      logoInitials: b.logoInitials ? String(b.logoInitials).slice(0, 2).toUpperCase() : null,
      currency: b.currency || 'MGA',
      currencySymbol: b.currencySymbol || 'Ar',
      taxId: b.taxId ?? null,
      address: b.address ?? null,
      phone: b.phone ?? null,
      email: b.email ?? null,
      defaultVatRate: Number(b.defaultVatRate) || 0,
      invoicePrefix: b.invoicePrefix ? String(b.invoicePrefix).slice(0, 8).toUpperCase() : 'FAC',
      creditNotePrefix: b.creditNotePrefix ? String(b.creditNotePrefix).slice(0, 8).toUpperCase() : 'AV',
      invoicePadding: Math.min(10, Math.max(1, Number(b.invoicePadding) || 6)),
      defaultLanguage: b.defaultLanguage || 'fr',
      alertLowStock: b.alertLowStock !== false,
      alertExpirationDays: Number(b.alertExpirationDays) || 0,
      aboutText: b.aboutText != null ? String(b.aboutText).slice(0, 8000) : null,
      privacyText: b.privacyText != null ? String(b.privacyText).slice(0, 8000) : null,
      rolePermissions: b.rolePermissions && typeof b.rolePermissions === 'object' ? b.rolePermissions : null,
      writePermissions: b.writePermissions && typeof b.writePermissions === 'object' ? b.writePermissions : null,
      updatedAt: new Date().toISOString(),
    };

    const [row] = await db
      .insert(settings)
      .values(values)
      .onConflictDoUpdate({ target: settings.id, set: values })
      .returning();

    await writeAuditLog({
      userId: req.user?.sub,
      userName: req.user?.name,
      action: 'Mise à jour des réglages de l\'entreprise',
      module: 'Paramètres',
      entityId: 'global',
    });

    res.json(row);
  } catch (err) {
    console.error('save settings error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement des réglages.' });
  }
});
