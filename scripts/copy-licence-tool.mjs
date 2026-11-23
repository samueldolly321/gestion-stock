#!/usr/bin/env node
/**
 * Dépose le générateur de clés de licence dans release\ (après `npm run desktop:build`) :
 *   release\Generer une licence.cmd      ← double-clic
 *   release\outil-licence\licence.mjs    ← copie de scripts/licence.mjs
 *   release\outil-licence\cle-publique.pem (pour « verifier »)
 * Sans danger si le dossier release est copié : la clé PRIVÉE reste dans
 * %USERPROFILE%\.vokatra-ko-licences (jamais copiée ici). Rien de tout cela n'entre dans l'installateur.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL = path.join(ROOT, 'release');
const OUT = path.join(REL, 'outil-licence');
fs.mkdirSync(OUT, { recursive: true });

fs.copyFileSync(path.join(ROOT, 'scripts', 'licence.mjs'), path.join(OUT, 'licence.mjs'));
const pub = fs.readFileSync(path.join(ROOT, 'src', 'server', 'license-public-key.ts'), 'utf8').match(/`(-----BEGIN PUBLIC KEY-----[^`]+)`/)?.[1];
if (!pub) throw new Error('Clé publique introuvable dans src/server/license-public-key.ts');
fs.writeFileSync(path.join(OUT, 'cle-publique.pem'), pub.trim() + '\n');

// Fenêtre du générateur (UTF-8 avec BOM conservé par la copie binaire).
fs.copyFileSync(path.join(ROOT, 'scripts', 'generateur-licence.ps1'), path.join(OUT, 'generateur-licence.ps1'));

// Même lanceur que generer-licence.cmd, mais qui ouvre la copie locale.
const cmd = fs.readFileSync(path.join(ROOT, 'generer-licence.cmd'), 'utf8')
  .replace('%~dp0scripts\\generateur-licence.ps1', '%~dp0outil-licence\\generateur-licence.ps1');
if (!cmd.includes('outil-licence')) throw new Error('generer-licence.cmd : chemin « scripts\\generateur-licence.ps1 » introuvable');
fs.writeFileSync(path.join(REL, 'Generer une licence.cmd'), cmd);

console.log(`✔ Générateur de licences déposé dans ${path.relative(ROOT, REL)}\\ (Generer une licence.cmd + outil-licence\\)`);
