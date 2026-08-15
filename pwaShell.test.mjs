import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const indexHtml = readFileSync('public/index.html', 'utf8');
const serviceWorkerSource = readFileSync('public/sw.js', 'utf8');
const webLayoutSource = readFileSync('platform/layout.web.ts', 'utf8');

assert(manifest.name === '这一餐' && manifest.short_name === '这一餐', 'PWA app name changed');
assert(manifest.display === 'standalone' && manifest.orientation === 'portrait', 'PWA standalone/portrait metadata is missing');
assert(manifest.theme_color === '#F3F2ED' && manifest.background_color === '#F3F2ED', 'PWA brand colors changed');
assert(manifest.icons.some((icon) => icon.src === '/pwa-icon-192.png' && icon.sizes === '192x192'), '192px PWA icon is missing');
assert(manifest.icons.some((icon) => icon.src === '/pwa-icon-512.png' && icon.sizes === '512x512'), '512px PWA icon is missing');
assert(indexHtml.includes('viewport-fit=cover'), 'Safe-area viewport metadata is missing');
assert(indexHtml.includes('apple-mobile-web-app-capable'), 'iOS standalone metadata is missing');
assert(indexHtml.includes('/manifest.webmanifest') && indexHtml.includes('/apple-touch-icon-180.png'), 'Manifest or Apple touch icon is not linked');
assert(webLayoutSource.includes('env(safe-area-inset-top)') && webLayoutSource.includes('env(safe-area-inset-bottom)'), 'Web safe-area layout is incomplete');
assert(webLayoutSource.includes("minHeight: cssDimension('100%')") && webLayoutSource.includes('addSave: {}'), 'Add Meal must fill the viewport without inventing spacing absent from Native');
assert(webLayoutSource.includes("max(42px, env(safe-area-inset-bottom))") && !webLayoutSource.includes("calc(42px + env(safe-area-inset-bottom))"), 'Add Meal must recover the Native bottom rhythm without duplicating the safe area');
assert(webLayoutSource.includes("historyDivider: { display: 'none' }") && webLayoutSource.includes("dataBackupEntry: { borderTopWidth: 0 }"), 'Web-only redundant dividers remain enabled');
assert(manifest.start_url === '/' && manifest.scope === '/', 'PWA start_url and scope must share the Service Worker scope');
assert(serviceWorkerSource.includes('CACHE_PREFIX') && serviceWorkerSource.includes('__SHELL_VERSION__') && serviceWorkerSource.includes('SHELL_MANIFEST_URL'), 'Versioned atomic shell cache is missing');
assert(serviceWorkerSource.includes('clients.claim()') && serviceWorkerSource.includes('self.skipWaiting()'), 'Service Worker activation control is incomplete');
assert(!serviceWorkerSource.includes('CORE_FILES') && !serviceWorkerSource.includes('cache.put(event.request'), 'Noncritical assets or runtime responses still mutate the app shell');

const pngSize = (path) => {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
assert(pngSize('public/pwa-icon-192.png').width === 192 && pngSize('public/pwa-icon-192.png').height === 192, '192px icon dimensions changed');
assert(pngSize('public/pwa-icon-512.png').width === 512 && pngSize('public/pwa-icon-512.png').height === 512, '512px icon dimensions changed');
assert(pngSize('public/apple-touch-icon-180.png').width === 180 && pngSize('public/apple-touch-icon-180.png').height === 180, 'Apple touch icon dimensions changed');

const origin = 'https://zheyican.example';
const keyFor = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
const stores = new Map();
const cacheApi = {
  open: async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      put: async (request, response) => { entries.set(keyFor(request), response.clone()); },
      match: async (request) => entries.get(keyFor(request))?.clone(),
    };
  },
  keys: async () => Array.from(stores.keys()),
  delete: async (name) => stores.delete(name),
};

let offline = false;
let failAsset = false;
const shellHtml = '<!doctype html><script src="/_expo/static/js/web/index-hash.js"></script><link rel="stylesheet" href="/_expo/static/css/web-hash.css"><link rel="manifest" href="/manifest.webmanifest">';
const fetchMock = async (request) => {
  if (offline) throw new Error('offline');
  const url = keyFor(request);
  if (url === `${origin}/` || url === `${origin}/index.html`) return new Response(shellHtml, { status: 200, headers: { 'content-type': 'text/html' } });
  if (failAsset && url.endsWith('index-hash.js')) return new Response('missing', { status: 503 });
  if (url.endsWith('index-hash.js') || url.endsWith('web-hash.css')) return new Response(`asset:${url}`, { status: 200 });
  throw new Error(`Unexpected fetch for noncritical resource: ${url}`);
};

const loadWorker = (source) => {
  const listeners = new Map();
  let claimed = false;
  let skipped = false;
  const worker = {
    location: { origin },
    addEventListener: (name, listener) => listeners.set(name, listener),
    skipWaiting: async () => { skipped = true; },
    clients: { claim: async () => { claimed = true; } },
  };
  runInNewContext(source, { self: worker, caches: cacheApi, fetch: fetchMock, URL, Response, Promise, Set, Array, Error, JSON });
  return {
    async install() {
      let pending;
      listeners.get('install')({ waitUntil: (promise) => { pending = promise; } });
      await pending;
    },
    async activate() {
      let pending;
      listeners.get('activate')({ waitUntil: (promise) => { pending = promise; } });
      await pending;
    },
    async fetch(request) {
      let pending;
      listeners.get('fetch')({ request, respondWith: (promise) => { pending = promise; } });
      return pending;
    },
    get claimed() { return claimed; },
    get skipped() { return skipped; },
  };
};

const stamp = (source, version) => source.replace('__SHELL_VERSION__', version);

// First online installation: only boot JS/CSS are required. A missing manifest/icon
// cannot reject the shell, and both Home Screen navigation URLs work offline.
const genA = loadWorker(stamp(serviceWorkerSource, 'genA'));
await genA.install();
await genA.activate();
assert(genA.skipped && genA.claimed, 'Completed shell did not become the active controller');
const genACache = stores.get('zheyican-shell-genA');
assert(genACache?.has(`${origin}/`) && genACache?.has(`${origin}/index.html`), 'HTML shell was not stored for both cold-launch URLs');
assert(genACache?.has(`${origin}/_expo/static/js/web/index-hash.js`) && genACache?.has(`${origin}/_expo/static/css/web-hash.css`), 'HTML boot resources were not cached');
assert(!genACache?.has(`${origin}/manifest.webmanifest`), 'Noncritical manifest was incorrectly required for the shell');

offline = true;
assert((await genA.fetch({ method: 'GET', mode: 'navigate', url: `${origin}/` })).status === 200, 'Offline cold navigation / did not return cached HTML');
assert((await genA.fetch({ method: 'GET', mode: 'navigate', url: `${origin}/index.html` })).status === 200, 'Offline cold navigation /index.html did not return cached HTML');
assert((await genA.fetch({ method: 'GET', mode: 'cors', url: `${origin}/_expo/static/js/web/index-hash.js` })).status === 200, 'Offline cold launch boot bundle was not cached');

// An interrupted update cannot become active or destroy the last complete shell.
offline = false;
failAsset = true;
const failedB = loadWorker(stamp(serviceWorkerSource, 'genB'));
let rejected = false;
try { await failedB.install(); } catch { rejected = true; }
assert(rejected && !failedB.skipped, 'Failed shell staging was allowed to activate');
assert(stores.has('zheyican-shell-genA'), 'Failed update removed the previously usable shell');
offline = true;
assert((await genA.fetch({ method: 'GET', mode: 'navigate', url: `${origin}/` })).status === 200, 'Old controller could not cold-launch after failed update');

// A complete update atomically supersedes the previous shell and then cleans it up.
offline = false;
failAsset = false;
const genB = loadWorker(stamp(serviceWorkerSource, 'genB'));
await genB.install();
await genB.activate();
assert(genB.skipped && genB.claimed, 'Completed update was not activated');
assert(stores.has('zheyican-shell-genB') && !stores.has('zheyican-shell-genA'), 'Old shell was removed before a complete replacement activated');
offline = true;
assert((await genB.fetch({ method: 'GET', mode: 'navigate', url: `${origin}/index.html` })).status === 200, 'Updated shell did not serve offline cold navigation');
assert(!serviceWorkerSource.includes('indexedDB.deleteDatabase') && !serviceWorkerSource.includes('zheyican-web-storage'), 'Service Worker touches production IndexedDB');
console.log('PWA atomic offline cold-launch regression tests passed');
