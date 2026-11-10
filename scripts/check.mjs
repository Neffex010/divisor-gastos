import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function requireFile(relativePath, label) {
  const clean = relativePath.replace(/^\.\//, '').replace(/^\/+/, '');
  const target = clean === '' ? 'index.html' : clean;
  if (!existsSync(join(root, target))) {
    errors.push(`${label}: falta el archivo "${relativePath}"`);
  }
}

/* Manifest */
let manifest;
try {
  manifest = JSON.parse(read('manifest.json'));
} catch (error) {
  errors.push(`manifest.json no es JSON válido: ${error.message}`);
}

if (manifest) {
  for (const field of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
    if (!manifest[field]) errors.push(`manifest.json: falta "${field}"`);
  }

  if (manifest.display !== 'standalone') {
    errors.push('manifest.json: display debería ser "standalone"');
  }

  const sizes = new Set((manifest.icons || []).map((icon) => icon.sizes));
  for (const required of ['192x192', '512x512']) {
    if (!sizes.has(required)) errors.push(`manifest.json: falta un icono ${required}`);
  }

  if (!(manifest.icons || []).some((icon) => String(icon.purpose || '').includes('maskable'))) {
    errors.push('manifest.json: falta un icono maskable');
  }

  for (const icon of manifest.icons || []) {
    if (!icon.src) errors.push('manifest.json: icono sin src');
    else requireFile(icon.src, 'manifest.json');
  }
}

/* Service worker */
let sw = '';
try {
  sw = read('sw.js');
} catch {
  errors.push('sw.js: no existe');
}

if (sw) {
  if (!sw.includes("const CACHE_PREFIX = 'divisor-gastos-'")) {
    errors.push('sw.js: el prefijo de cache debe ser específico de la app');
  }
  if (sw.includes('keys.filter((k) => k !== CACHE)')) {
    errors.push('sw.js: no debe borrar caches de otras apps del mismo origen');
  }

  const assetsMatch = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  if (!assetsMatch) {
    errors.push('sw.js: no se encontró la lista ASSETS');
  } else {
    const assets = [...assetsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    for (const asset of assets) requireFile(asset, 'sw.js ASSETS');
  }
}

/* Referencias del HTML */
try {
  const html = read('index.html');
  const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const reference of references) {
    if (
      reference.startsWith('http') ||
      reference.startsWith('mailto:') ||
      reference.startsWith('#') ||
      reference.startsWith('data:')
    ) {
      continue;
    }
    requireFile(reference, 'index.html');
  }
} catch {
  errors.push('index.html: no existe');
}

/* Imports de los módulos */
const modules = ['app.js', 'js/money.js', 'js/ledger.js', 'js/storage.js'];
for (const modulePath of modules) {
  const source = read(modulePath);
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  for (const importPath of imports) {
    const target = resolve(dirname(join(root, modulePath)), importPath);
    if (!existsSync(target)) {
      errors.push(`${modulePath}: import no encontrado "${importPath}"`);
    }
  }
}

/* Sin diálogos nativos bloqueantes */
try {
  const app = read('app.js');
  if (/\balert\s*\(/.test(app)) errors.push('app.js: usa alert() nativo');
  if (/\bconfirm\s*\(/.test(app)) errors.push('app.js: usa confirm() nativo');
} catch {
  errors.push('app.js: no existe');
}

if (errors.length > 0) {
  console.error('Errores encontrados:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Chequeo estructural OK: manifest, iconos, service worker, HTML e imports.');
