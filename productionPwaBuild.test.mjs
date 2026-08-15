import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const html = readFileSync('dist/index.html', 'utf8');
const sw = readFileSync('dist/sw.js', 'utf8');
const assetPaths = new Set();

for (const match of html.matchAll(/<script[^>]+\bsrc=["']([^"']+)["'][^>]*>/gi)) assetPaths.add(match[1]);
for (const match of html.matchAll(/<link[^>]+\brel=["'][^"']*stylesheet[^"']*["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) assetPaths.add(match[1]);
for (const match of html.matchAll(/<link[^>]+\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)) assetPaths.add(match[1]);

assert(assetPaths.size > 0, 'Production HTML has no startup assets');
for (const assetPath of assetPaths) {
  assert(assetPath.startsWith('/'), `Startup asset must be same-origin: ${assetPath}`);
  assert(existsSync(resolve('dist', `.${assetPath.split('?')[0]}`)), `Production startup asset is missing: ${assetPath}`);
}
assert(sw.includes("CACHE_NAME = `${CACHE_PREFIX}v5`"), 'Production Service Worker cache version is not v5');
assert(sw.includes('startupAssetUrls(shellHtml)') && sw.includes('isCompleteShellCache(cache)'), 'Production Service Worker does not atomically cache HTML startup assets');
assert(!sw.includes('CORE_FILES'), 'Production shell still makes noncritical PWA metadata installation-critical');
console.log(`Production PWA build verified: ${[...assetPaths].join(', ')}`);
