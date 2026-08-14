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
assert(webLayoutSource.includes("minHeight: cssDimension('100%')") && webLayoutSource.includes("addSave: { marginTop: cssDimension('auto') }"), 'Add Meal content does not fill the mobile viewport before the safe-area inset');
assert(webLayoutSource.includes("max(16px, env(safe-area-inset-bottom))") && !webLayoutSource.includes("calc(42px + env(safe-area-inset-bottom))"), 'Add Meal bottom safe-area is duplicated');
assert(webLayoutSource.includes("historyDivider: { display: 'none' }") && webLayoutSource.includes("dataBackupEntry: { borderTopWidth: 0 }"), 'Web-only redundant dividers remain enabled');
assert(manifest.start_url === '/' && manifest.scope === '/', 'PWA start_url and scope must share the Service Worker scope');
assert(serviceWorkerSource.includes("clients.claim()") && serviceWorkerSource.includes("self.skipWaiting()"), 'Service Worker activation control is incomplete');
assert(serviceWorkerSource.includes("cache.put('/index.html'") && serviceWorkerSource.includes("cacheShellFiles"), 'HTML shell and required assets are not explicitly precached');

const pngSize = (path) => {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
assert(pngSize('public/pwa-icon-192.png').width === 192 && pngSize('public/pwa-icon-192.png').height === 192, '192px icon dimensions changed');
assert(pngSize('public/pwa-icon-512.png').width === 512 && pngSize('public/pwa-icon-512.png').height === 512, '512px icon dimensions changed');
assert(pngSize('public/apple-touch-icon-180.png').width === 180 && pngSize('public/apple-touch-icon-180.png').height === 180, 'Apple touch icon dimensions changed');

const origin = 'https://zheyican.example';
const keyFor = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
const stores = new Map([['zheyican-shell-old', new Map()]]);
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
  match: async (request) => {
    for (const entries of stores.values()) {
      const response = entries.get(keyFor(request));
      if (response) return response.clone();
    }
    return undefined;
  },
};
const listeners = new Map();
let offline = false;
let claimed = false;
let skipped = false;
const shellHtml = '<!doctype html><script src="/_expo/static/js/web/index-hash.js"></script><link rel="stylesheet" href="/_expo/static/css/web-hash.css">';
const fetchMock = async (request) => {
  if (offline) throw new Error('offline');
  const url = keyFor(request);
  if (url === `${origin}/`) return new Response(shellHtml, { status: 200, headers: { 'content-type': 'text/html' } });
  return new Response(`asset:${url}`, { status: 200 });
};
const worker = {
  location: { origin },
  addEventListener: (name, listener) => listeners.set(name, listener),
  skipWaiting: async () => { skipped = true; },
  clients: { claim: async () => { claimed = true; } },
};
runInNewContext(serviceWorkerSource, {
  self: worker,
  caches: cacheApi,
  fetch: fetchMock,
  URL,
  Response,
  Promise,
  Set,
  Array,
  Error,
});

let installPromise;
listeners.get('install')({ waitUntil: (promise) => { installPromise = promise; } });
await installPromise;
assert(skipped, 'New Service Worker did not become available without forcing a page reload');
const currentCache = stores.get('zheyican-shell-v2');
assert(currentCache, 'Current Service Worker cache was not created');
assert(currentCache.has(`${origin}/`), 'App shell HTML was not precached');
assert(currentCache.has(`${origin}/index.html`), 'Index HTML fallback was not precached');
assert(currentCache.has(`${origin}/_expo/static/js/web/index-hash.js`), 'Hashed JavaScript bundle was not precached');
assert(currentCache.has(`${origin}/_expo/static/css/web-hash.css`), 'Hashed stylesheet was not precached');

offline = true;
let navigationResponse;
listeners.get('fetch')({
  request: { method: 'GET', mode: 'navigate', url: `${origin}/` },
  respondWith: (promise) => { navigationResponse = promise; },
});
assert((await navigationResponse).status === 200, 'Offline navigation did not return the cached App Shell');
let assetResponse;
listeners.get('fetch')({
  request: { method: 'GET', mode: 'cors', url: `${origin}/_expo/static/js/web/index-hash.js` },
  respondWith: (promise) => { assetResponse = promise; },
});
assert((await assetResponse).status === 200, 'Offline hashed asset did not return from cache');

let activatePromise;
listeners.get('activate')({ waitUntil: (promise) => { activatePromise = promise; } });
await activatePromise;
assert(claimed, 'Updated Service Worker did not claim the next normal session');
assert(!stores.has('zheyican-shell-old'), 'Old shell cache was not removed after update');
assert(!serviceWorkerSource.includes('indexedDB.deleteDatabase') && !serviceWorkerSource.includes('zheyican-web-storage'), 'Service Worker touches production IndexedDB');
