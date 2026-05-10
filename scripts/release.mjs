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

// 1. Working tree limpio antes de empezar (sólo para release real;
//    en dry-run da igual, ya que no escribimos nada)
if (!dryRun) {
  const dirty = capture('git status --porcelain');
  if (dirty) {
    console.error('\n❌ El working tree no está limpio:\n');
    console.error(dirty);
    console.error('\nHacé commit / stash de los cambios pendientes antes de releasear.');
    process.exit(1);
  }
}

// 2. Bump (propagamos --dry-run para que NO escriba archivos en preview)
run(`node scripts/bump-version.mjs ${bumpArg}${dryRun ? ' --dry-run' : ''}`);

// 3. Calcular cuál es la próxima versión sin importar si escribimos o no
const tauri = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const next = dryRun ? computeNext(tauri.version, bumpArg) : tauri.version;

console.log(`\n📤 ${dryRun ? '(dry-run) ' : ''}Preparando release v${next}\n`);

if (dryRun) {
  console.log(`Si lo ejecutaras de verdad, harías:`);
  console.log(`  node scripts/bump-version.mjs ${bumpArg}`);
  console.log(`  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`);
  console.log(`  git commit -m "chore: release v${next}"`);
  console.log(`  git tag v${next}`);
  console.log(`  git push && git push --tags`);
  console.log(`\n(no se modificó ni un archivo)`);
  process.exit(0);
}

// 4. Git ops
run('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock');
run(`git commit -m "chore: release v${next}"`);
run(`git tag v${next}`);
run('git push');
run('git push --tags');

console.log(`\n✅ Tag v${next} pusheado. El workflow build.yml en GitHub Actions ya está corriendo.`);
console.log(`   Seguilo en: https://github.com/manw3b/clozr/actions`);

/**
 * Calcula la próxima versión SIN tocar archivos. Replica la lógica de
 * bump-version.mjs para poder mostrarla en dry-run sin haber escrito.
 */
function computeNext(current, kind) {
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Versión semver inválida: ${current}`);
  const [, M, mi, p] = m;
  const major = parseInt(M, 10);
  const minor = parseInt(mi, 10);
  const patch = parseInt(p, 10);
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'major') return `${major + 1}.0.0`;
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  throw new Error(`Argumento de bump inválido: ${kind}`);
}
