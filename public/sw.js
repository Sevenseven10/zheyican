const CACHE_PREFIX = 'zheyican-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const CORE_FILES = [
  '/manifest.webmanifest',
  '/apple-touch-icon-180.png',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
];

const cacheShellFiles = async (cache, files) => {
  const responses = await Promise.all(files.map(async (file) => {
    const response = await fetch(file, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to cache shell asset: ${file}`);
    return [file, response];
  }));
  await Promise.all(responses.map(([file, response]) => cache.put(file, response.clone())));
};

const shellAssetUrls = (html) => Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g), (match) => match[1])
  .map((path) => new URL(path, self.location.origin))
  .filter((url) => url.origin === self.location.origin && (url.protocol === 'http:' || url.protocol === 'https:'))
  .map((url) => url.pathname + url.search);

const installShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  const shellResponse = await fetch('/', { cache: 'no-store' });
  if (!shellResponse.ok) throw new Error('Unable to cache the app shell.');
  await cache.put('/', shellResponse.clone());
  await cache.put('/index.html', shellResponse.clone());
  const html = await shellResponse.text();
  const files = Array.from(new Set([...CORE_FILES, ...shellAssetUrls(html)]));
  await cacheShellFiles(cache, files);
};

self.addEventListener('install', (event) => {
  event.waitUntil(installShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedShell = async () => (await cache.match(request)) || (await cache.match(url.pathname === '/index.html' ? '/index.html' : '/'));
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put('/', response.clone());
          if (url.pathname === '/index.html') await cache.put('/index.html', response.clone());
          return response;
        }
        return (await cachedShell()) || response;
      } catch {
        return (await cachedShell()) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (!response.ok) return response;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    return response;
  })());
});
