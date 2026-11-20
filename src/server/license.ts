/**
 * Licences de la version de bureau (.exe) — vérification HORS LIGNE.
 *
 * Principe :
 *  - chaque ordinateur a un « code machine » (dérivé de l'identifiant Windows MachineGuid) ;
 *  - le vendeur génère une clé pour ce code avec SA clé privée (scripts/licence.mjs, gardée
 *    hors du projet) ; l'application ne contient que la clé PUBLIQUE et vérifie la signature ;
 *  - une clé n'est valable que sur l'ordinateur dont elle porte le code ; elle est à vie ;
 *  - sans clé : 7 jours d'essai, puis l'API est bloquée (sauf santé et licence).
 *
 * Actif seulement si LICENSE_REQUIRED=1 (positionné par electron/main.cjs). La version web
 * (Render) et `npm run dev` ne sont pas concernées.
 *
 * Format de clé : VK1.<payload base64url>.<signature Ed25519 base64url>
 *   payload = {"v":1,"m":"<code machine>","c":"<client>","d":"AAAA-MM-JJ"}
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { LICENSE_PUBLIC_KEY } from './license-public-key.ts';

export const TRIAL_DAYS = 7;
const DAY = 24 * 3600 * 1000;

export const licenseRequired = () => process.env.LICENSE_REQUIRED === '1';

// --- Code machine -------------------------------------------------------------------------

let machineCodeCache: string | null = null;

function machineSeed(): string {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
      if (m) return m[1].toLowerCase();
    } catch { /* repli ci-dessous */ }
  }
  // Repli (autres systèmes / registre illisible) : nom du PC + 1re adresse MAC physique.
  const mac = Object.values(os.networkInterfaces()).flat().find((i) => i && !i.internal && i.mac !== '00:00:00:00:00:00')?.mac || '';
  return `${os.hostname()}|${mac}`;
}

/** « 1A2B-3C4D-5E6F-7A8B » : stable pour un même Windows, différent d'un PC à l'autre. */
export function getMachineCode(): string {
  if (!machineCodeCache) {
    const h = crypto.createHash('sha256').update(`vokatra-ko:${machineSeed()}`).digest('hex').slice(0, 16).toUpperCase();
    machineCodeCache = h.match(/.{4}/g)!.join('-');
  }
  return machineCodeCache;
}

// --- Vérification d'une clé ---------------------------------------------------------------

export interface LicensePayload { v: number; m: string; c: string; d: string }

const normCode = (s: string) => String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');

export function verifyKey(key: string, machineCode = getMachineCode()): { ok: true; payload: LicensePayload } | { ok: false; error: string } {
  const parts = String(key || '').trim().replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== 'VK1') return { ok: false, error: 'Clé illisible : vérifiez qu’elle a été copiée en entier (elle commence par « VK1. »).' };
  let payload: LicensePayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'Clé illisible : vérifiez qu’elle a été copiée en entier.' };
  }
  let valid = false;
  try {
    valid = crypto.verify(null, Buffer.from(`VK1.${parts[1]}`), LICENSE_PUBLIC_KEY, Buffer.from(parts[2], 'base64url'));
  } catch { valid = false; }
  if (!valid) return { ok: false, error: 'Clé invalide (signature incorrecte).' };
  if (normCode(payload.m) !== normCode(machineCode)) {
    return { ok: false, error: `Cette clé a été faite pour un autre ordinateur (code ${payload.m}). Le code de cet ordinateur est ${machineCode}.` };
  }
  return { ok: true, payload };
}

// --- État (essai / licence) ----------------------------------------------------------------
// Date de début d'essai conservée à TROIS endroits (fichier, base, registre Windows) : on
// garde la plus ancienne, pour qu'effacer l'un d'eux ne relance pas l'essai.

interface StateFile { key?: string; trialStart?: string; lastSeen?: string }

const stateDir = () => process.env.LICENSE_DIR || path.resolve('.');
const statePath = () => path.join(stateDir(), 'licence.json');
// Surchargeables pour les tests (évite de démarrer un vrai essai sur le PC du développeur).
const REG_KEY = process.env.LICENSE_REG_KEY || 'HKCU\\Software\\Vokatra-ko';
const META_PREFIX = process.env.LICENSE_META_PREFIX || '';

function readFileState(): StateFile {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')) || {}; } catch { return {}; }
}
function writeFileState(s: StateFile) {
  try { fs.mkdirSync(stateDir(), { recursive: true }); fs.writeFileSync(statePath(), JSON.stringify(s, null, 2)); } catch (e) {
    console.error('Licence : écriture impossible', e);
  }
}
function regGet(name: string): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('reg', ['query', REG_KEY, '/v', name], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.match(new RegExp(`${name}\\s+REG_SZ\\s+(\\S+)`))?.[1] ?? null;
  } catch { return null; }
}
function regSet(name: string, value: string) {
  if (process.platform !== 'win32') return;
  try { execFileSync('reg', ['add', REG_KEY, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], { windowsHide: true, stdio: 'ignore' }); } catch { /* ignore */ }
}
async function dbGet(k: string): Promise<string | null> {
  try {
    const r: any = await db.execute(sql`SELECT value FROM app_meta WHERE key = ${META_PREFIX + k}`);
    return r.rows?.[0]?.value ?? null;
  } catch { return null; }
}
async function dbSet(k: string, v: string) {
  try {
    await db.execute(sql`INSERT INTO app_meta (key, value) VALUES (${META_PREFIX + k}, ${v}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  } catch { /* ignore */ }
}

const validDate = (s?: string | null) => (s && !Number.isNaN(Date.parse(s)) ? s : null);
const oldest = (...d: (string | null | undefined)[]) =>
  d.map(validDate).filter(Boolean).sort((a, b) => Date.parse(a!) - Date.parse(b!))[0] ?? null;
const latest = (...d: (string | null | undefined)[]) =>
  d.map(validDate).filter(Boolean).sort((a, b) => Date.parse(b!) - Date.parse(a!))[0] ?? null;

export type LicenseState = 'licensed' | 'trial' | 'expired' | 'clock';
export interface LicenseStatus {
  required: boolean;
  state: LicenseState;
  machineCode: string;
  licensee?: string;
  activatedOn?: string;
  trialDays: number;
  trialDaysLeft?: number;
}

let cache: { at: number; status: LicenseStatus } | null = null;

export async function getLicenseStatus(force = false): Promise<LicenseStatus> {
  if (!licenseRequired()) return { required: false, state: 'licensed', machineCode: '', trialDays: TRIAL_DAYS };
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.status;

  const machineCode = getMachineCode();
  const file = readFileState();
  const now = new Date();

  let status: LicenseStatus;
  const check = file.key ? verifyKey(file.key, machineCode) : null;
  if (check?.ok) {
    status = { required: true, state: 'licensed', machineCode, licensee: check.payload.c, activatedOn: check.payload.d, trialDays: TRIAL_DAYS };
  } else {
    const [dbStart, dbSeen] = await Promise.all([dbGet('trial_start'), dbGet('last_seen')]);
    const trialStart = oldest(file.trialStart, dbStart, regGet('TrialStart')) || now.toISOString();
    const lastSeen = latest(file.lastSeen, dbSeen, regGet('LastSeen'));
    // Horloge reculée de plus d'un jour (pour prolonger l'essai) → bloqué jusqu'à correction.
    const clockBack = lastSeen && now.getTime() < Date.parse(lastSeen) - DAY;
    const left = Math.ceil((Date.parse(trialStart) + TRIAL_DAYS * DAY - now.getTime()) / DAY);
    status = {
      required: true,
      state: clockBack ? 'clock' : left > 0 ? 'trial' : 'expired',
      machineCode,
      trialDays: TRIAL_DAYS,
      trialDaysLeft: Math.max(0, Math.min(TRIAL_DAYS, left)),
    };
    // Mémorise début d'essai + dernière date vue aux trois endroits.
    const seen = clockBack ? lastSeen! : latest(lastSeen, now.toISOString())!;
    writeFileState({ ...file, trialStart, lastSeen: seen });
    regSet('TrialStart', trialStart);
    regSet('LastSeen', seen);
    await Promise.all([dbSet('trial_start', trialStart), dbSet('last_seen', seen)]);
  }
  cache = { at: Date.now(), status };
  return status;
}

export async function activateLicense(key: string): Promise<{ ok: true; status: LicenseStatus } | { ok: false; error: string }> {
  const check = verifyKey(key);
  if (check.ok === false) return { ok: false, error: check.error };
  const file = readFileState();
  writeFileState({ ...file, key: String(key).trim().replace(/\s+/g, '') });
  return { ok: true, status: await getLicenseStatus(true) };
}

/** L'API est-elle utilisable ? (licence valide ou essai en cours) */
export const isUsable = (s: LicenseStatus) => s.state === 'licensed' || s.state === 'trial';
