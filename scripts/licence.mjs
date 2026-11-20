#!/usr/bin/env node
/**
 * Outil VENDEUR — génération des clés de licence de Vokatra-ko (version .exe).
 * N'est PAS inclus dans l'installateur (dossier scripts/ exclu du build).
 *
 *   node scripts/licence.mjs init
 *       Crée la paire de clés (une seule fois). La clé PRIVÉE est rangée HORS du projet :
 *       %USERPROFILE%\.vokatra-ko-licences\cle-privee.pem  → à sauvegarder (clé USB…) et
 *       à ne JAMAIS partager ni mettre sur GitHub. La clé publique est écrite dans
 *       src/server/license-public-key.ts (elle, peut être publiée).
 *
 *   node scripts/licence.mjs generer <CODE-MACHINE> "<Nom du client>"
 *       Affiche la clé à envoyer au client et l'ajoute au registre (registre-licences.csv).
 *
 *   node scripts/licence.mjs verifier <CLE> [CODE-MACHINE]
 *       Relit une clé (client, date, code machine) et contrôle sa signature.
 *
 * Plus simple : double-cliquer sur generer-licence.cmd à la racine du projet.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = process.env.VOKATRA_LICENCE_DIR || path.join(os.homedir(), '.vokatra-ko-licences');
const PRIV = path.join(VAULT, 'cle-privee.pem');
const PUB_TS = path.join(ROOT, 'src', 'server', 'license-public-key.ts');
const REGISTRY = path.join(VAULT, 'registre-licences.csv');

const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };
const normCode = (s) => String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
const fmtCode = (s) => normCode(s).match(/.{4}/g)?.join('-') ?? '';

function init() {
  if (fs.existsSync(PRIV)) {
    die(`Une clé privée existe déjà : ${PRIV}\nLa remplacer rendrait INVALIDES toutes les licences déjà vendues. Opération annulée.`);
  }
  fs.mkdirSync(VAULT, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).trim();
  fs.writeFileSync(PUB_TS,
    `// Clé PUBLIQUE de vérification des licences (générée par \`node scripts/licence.mjs init\`).\n` +
    `// Elle ne permet PAS de fabriquer des clés : la clé privée correspondante reste chez le vendeur.\n` +
    `export const LICENSE_PUBLIC_KEY = \`${pubPem}\`;\n`);
  if (!fs.existsSync(REGISTRY)) fs.writeFileSync(REGISTRY, '﻿date;client;code_machine;cle\n');
  console.log(`\n✔ Clés créées.\n  Clé privée : ${PRIV}\n  → SAUVEGARDEZ ce fichier (clé USB, coffre…). Sans lui, impossible de créer de nouvelles licences.\n  Clé publique : ${path.relative(ROOT, PUB_TS)} (incluse dans l'application)\n\n  Reconstruisez ensuite le .exe : npm run desktop:build\n`);
}

function loadPrivate() {
  if (!fs.existsSync(PRIV)) die(`Clé privée introuvable (${PRIV}). Lancez d'abord : node scripts/licence.mjs init`);
  return crypto.createPrivateKey(fs.readFileSync(PRIV));
}

function sign(machine, client) {
  const payload = { v: 1, m: fmtCode(machine), c: client, d: new Date().toISOString().slice(0, 10) };
  const p64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(`VK1.${p64}`), loadPrivate()).toString('base64url');
  return { key: `VK1.${p64}.${sig}`, payload };
}

function generer(machine, client) {
  if (normCode(machine).length !== 16) die('Code machine invalide : il fait 16 caractères, ex. 1A2B-3C4D-5E6F-7A8B (affiché par l’application).');
  client = String(client || '').trim();
  if (!client) die('Indiquez le nom du client, ex. : node scripts/licence.mjs generer 1A2B-3C4D-5E6F-7A8B "Épicerie Rasoa"');
  const { key, payload } = sign(machine, client.slice(0, 80));
  fs.mkdirSync(VAULT, { recursive: true });
  if (!fs.existsSync(REGISTRY)) fs.writeFileSync(REGISTRY, '﻿date;client;code_machine;cle\n');
  fs.appendFileSync(REGISTRY, `${payload.d};"${payload.c.replace(/"/g, '""')}";${payload.m};${key}\n`);
  console.log(`\n✔ Licence à vie — ${payload.c} — ordinateur ${payload.m}\n\nClé à envoyer au client (à copier en entier) :\n\n${key}\n\n(ajoutée au registre : ${REGISTRY})\n`);
}

function verifier(key, machine) {
  const parts = String(key || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'VK1') die('Clé illisible.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const pubSrc = fs.readFileSync(PUB_TS, 'utf8').match(/`([^`]+)`/)?.[1];
  const ok = crypto.verify(null, Buffer.from(`VK1.${parts[1]}`), crypto.createPublicKey(pubSrc), Buffer.from(parts[2], 'base64url'));
  console.log(`\nClient : ${payload.c}\nDate : ${payload.d}\nOrdinateur : ${payload.m}\nSignature : ${ok ? 'valide ✔' : 'INVALIDE ✖'}`);
  if (machine) console.log(`Pour ${fmtCode(machine)} : ${normCode(machine) === normCode(payload.m) ? 'oui ✔' : 'non ✖ (autre ordinateur)'}`);
  console.log('');
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'init') init();
else if (cmd === 'generer') generer(a, b);
else if (cmd === 'verifier') verifier(a, b);
else console.log('Usage :\n  node scripts/licence.mjs init\n  node scripts/licence.mjs generer <CODE-MACHINE> "<Nom du client>"\n  node scripts/licence.mjs verifier <CLE> [CODE-MACHINE]');
