#!/usr/bin/env node
/**
 * Sincroniza la versión en los 3 archivos que la mantienen:
 *   - package.json
 *   - src-tauri/tauri.conf.json   (← lo lee el auto-updater)
 *   - src-tauri/Cargo.toml
 *
 * Uso:
 *   node scripts/bump-version.mjs patch              → 1.3.2 → 1.3.3
 *   node scripts/bump-version.mjs minor              → 1.3.2 → 1.4.0
 *   node scripts/bump-version.mjs major              → 1.3.2 → 2.0.0
 *   node scripts/bump-version.mjs 1.4.0              → set explícito
 *   node scripts/bump-version.mjs --check            → sólo reporta versiones actuales
 *   node scripts/bump-version.mjs patch --dry-run    → calcula sin escribir
 *
 * La versión "fuente de verdad" es la de `src-tauri/tauri.conf.json` porque
 * es la que consume el auto-updater de Tauri y lo que el usuario final ve.
 * Las otras dos se alinean con esa.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FILES = {
  pkg: join(ROOT, 'package.json'),
  tauri: join(ROOT, 'src-tauri', 'tauri.conf.json'),
  cargo: join(ROOT, 'src-tauri', 'Cargo.toml'),
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function getCargoVersion(content) {
  // Buscamos la PRIMERA línea `version = "X.Y.Z"` (la del paquete top-level,
  // no las de dependencias).
  const m = content.match(/^version\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

function setCargoVersion(content, next) {
  return content.replace(/^version\s*=\s*"[^"]+"/m, `version = "${next}"`);
}

function parseSemver(v) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!m) throw new Error(`Versión semver inválida: ${v}`);
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    pre: m[4] ?? null,
  };
}

function bump(current, kind) {
  const v = parseSemver(current);
  if (kind === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
  if (kind === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (kind === 'major') return `${v.major + 1}.0.0`;
  // Si pasaron una versión explícita, validar shape
  parseSemver(kind);
  return kind;
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const isCheck = argv.includes('--check');
// El "arg" es el primer token positional (no flag). --check es un caso
// especial: lo tratamos como el comando en sí, no como flag.
const arg = isCheck ? '--check' : argv.find((a) => !a.startsWith('--'));
if (!arg) {
  console.error('Uso: node scripts/bump-version.mjs <patch|minor|major|X.Y.Z|--check> [--dry-run]');
  process.exit(1);
}

const pkg = readJson(FILES.pkg);
const tauri = readJson(FILES.tauri);
const cargoText = readFileSync(FILES.cargo, 'utf8');
const cargoVersion = getCargoVersion(cargoText);

console.log(`📦 package.json:        ${pkg.version}`);
console.log(`🪟 tauri.conf.json:     ${tauri.version}  ← fuente de verdad`);
console.log(`🦀 Cargo.toml:          ${cargoVersion}`);

if (arg === '--check') {
  const allEqual = pkg.version === tauri.version && tauri.version === cargoVersion;
  if (allEqual) {
    console.log('\n✅ Sincronizados.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Desincronizados. Corregí con: node scripts/bump-version.mjs <X.Y.Z>');
    process.exit(1);
  }
}

const source = tauri.version; // fuente de verdad
const next = bump(source, arg);

if (dryRun) {
  console.log(`\n(dry-run) → bumpearía a ${next}\n`);
  console.log('No se escribió ningún archivo.');
  process.exit(0);
}

console.log(`\n→ Bumpeando a ${next}\n`);

pkg.version = next;
tauri.version = next;
const newCargoText = setCargoVersion(cargoText, next);

writeJson(FILES.pkg, pkg);
writeJson(FILES.tauri, tauri);
writeFileSync(FILES.cargo, newCargoText, 'utf8');

console.log(`✅ package.json        → ${next}`);
console.log(`✅ tauri.conf.json     → ${next}`);
console.log(`✅ Cargo.toml          → ${next}`);
console.log(`\nProximos pasos:`);
console.log(`  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`);
console.log(`  git commit -m "chore: bump v${next}"`);
console.log(`  git tag v${next}`);
console.log(`  git push && git push --tags    # esto dispara el release en GitHub Actions`);
console.log(`\nO simplemente:  npm run release ${arg}`);
