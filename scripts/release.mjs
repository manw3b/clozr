#!/usr/bin/env node
/**
 * Release end-to-end:
 *   1. Bumpea las 3 versiones (package.json, tauri.conf.json, Cargo.toml).
 *   2. Verifica que el working tree esté limpio (excepto los 3 archivos
 *      bumpeados).
 *   3. Hace commit + tag + push.
 *   4. El push del tag dispara `.github/workflows/build.yml` que compila
 *      Win/Mac/Linux y publica el release.
 *
 * Uso:
 *   npm run release patch
 *   npm run release minor
 *   npm run release 1.4.0
 *   npm run release patch -- --dry-run    → no toca git, sólo muestra
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bumpArg = args.find((a) => !a.startsWith('--'));

if (!bumpArg) {
  console.error('Uso: npm run release <patch|minor|major|X.Y.Z> [-- --dry-run]');
  process.exit(1);
}

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  if (dryRun && opts.skipOnDry) return '';
  return execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function capture(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: ROOT }).trim();
}

// 1. Working tree limpio antes de empezar
const dirty = capture('git status --porcelain');
if (dirty) {
  console.error('\n❌ El working tree no está limpio:\n');
  console.error(dirty);
  console.error('\nHacé commit / stash de los cambios pendientes antes de releasear.');
  process.exit(1);
}

// 2. Bump
run(`node scripts/bump-version.mjs ${bumpArg}`);

// 3. Leer la versión nueva del tauri.conf.json
const tauri = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const next = tauri.version;

console.log(`\n📤 Preparando release v${next}\n`);

if (dryRun) {
  console.log(`(dry-run: no se hacen git ops)`);
  console.log(`Ejecutá:`);
  console.log(`  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`);
  console.log(`  git commit -m "chore: release v${next}"`);
  console.log(`  git tag v${next}`);
  console.log(`  git push && git push --tags`);
  process.exit(0);
}

// 4. Git ops
run('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml');
run(`git commit -m "chore: release v${next}"`);
run(`git tag v${next}`);
run('git push');
run('git push --tags');

console.log(`\n✅ Tag v${next} pusheado. El workflow build.yml en GitHub Actions ya está corriendo.`);
console.log(`   Seguilo en: https://github.com/manw3b/clozr/actions`);
