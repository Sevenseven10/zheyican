const CACHE_PREFIX = 'zheyican-shell-';
const CACHE_NAME = `${CACHE_PREFIX}__SHELL_VERSION__`;
const SHELL_MANIFEST_URL = '/__zheyican_shell_manifest';

const startupAssetUrls = (html) => {
  const urls = new Set();
  const add = (value) => {
    if (!value) return;
    const url = new URL(value, self.location.origin);
    if (url.origin === self.location.origin) urls.add(`${url.pathname}${url.search}`);
  };
  for (const match of html.matchAll(/<script[^>]+\bsrc=["']([^"']+)["'][^>]*>/gi)) add(match[1]);
  for (const match of html.matchAll(/<link[^>]+\brel=["'][^"']*stylesheet[^"']*["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) add(match[1]);
  for (const match of html.matchAll(/<link[^>]+\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)) add(match[1]);
  return [...urls];
};

const isOk = (response, label) => {
  if (!response?.ok) throw new Error(`Unable to cache ${label}: ${response?.status ?? 'no response'}`);
  return response;
};

const DIAG_HTML = (title, body) => new Response(
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+title+'</title></head><body><pre style="font:12px/1.4 monospace;padding:8px;white-space:pre-wrap">'+body+'</pre></body></html>',
  { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }
);

const readShellManifest = async (cache) => {
  const response = await cache.match(SHELL_MANIFEST_URL);
  if (!response) return undefined;
  try {
    const manifest = await response.json();
    return Array.isArray(manifest?.required) ? manifest : undefined;
  } catch {
    return undefined;
  }
};

const isCompleteShellCache = async (cache) => {
  const manifest = await readShellManifest(cache);
  if (!manifest) return false;
  const required = ['/', '/index.html', ...manifest.required];
  return (await Promise.all(required.map((url) => cache.match(url)))).every(Boolean);
};

const findUsableShellCache = async () => {
  const names = await caches.keys();
  const ordered = [CACHE_NAME, ...names.filter((name) => name !== CACHE_NAME && name.startsWith(CACHE_PREFIX))];
  for (const name of ordered) {
    if (!names.includes(name)) continue;
    const cache = await caches.open(name);
    if (await isCompleteShellCache(cache)) return { name, cache };
  }
  return undefined;
};

const installShell = async () => {
  // Fetch all boot resources before changing a cache. A failed update therefore
  // leaves the previously activated offline shell intact.
  const shellResponse = isOk(await fetch('/', { cache: 'no-store' }), '/');
  const shellHtml = await shellResponse.clone().text();
  const required = startupAssetUrls(shellHtml);
  const assets = await Promise.all(required.map(async (url) => [url, isOk(await fetch(url, { cache: 'no-store' }), url)]));

  const cache = await caches.open(CACHE_NAME);
  await cache.put('/', shellResponse.clone());
  await cache.put('/index.html', shellResponse.clone());
  await Promise.all(assets.map(([url, response]) => cache.put(url, response.clone())));
  await cache.put(SHELL_MANIFEST_URL, new Response(JSON.stringify({ required }), {
    headers: { 'content-type': 'application/json' },
  }));
  if (!await isCompleteShellCache(cache)) throw new Error('Staged app shell is incomplete');
};

self.addEventListener('install', (event) => {
  event.waitUntil(installShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const shell = await findUsableShellCache();
    if (!shell || shell.name !== CACHE_NAME) return;
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const shell = await findUsableShellCache();
      try {
        return await fetch(event.request);
      } catch {
        if (!shell) {
          // TEMP OFFLINE BOOT DEBUG: diagnostic when no usable shell exists
          const names = await caches.keys();
          const shellNames = names.filter((n) => n.startsWith(CACHE_PREFIX));
          let detail = 'NO_USABLE_SHELL\n';
          detail += 'CACHE_NAME: ' + CACHE_NAME + '\n';
          detail += 'ALL_CACHE_NAMES: ' + JSON.stringify(names) + '\n';
          detail += 'SHELL_GENERATIONS: ' + JSON.stringify(shellNames) + '\n';
          for (const name of shellNames) {
            const cache = await caches.open(name);
            const hasRoot = !!(await cache.match('/'));
            const hasHtml = !!(await cache.match('/index.html'));
            const hasManifest = !!(await cache.match(SHELL_MANIFEST_URL));
            detail += '\nCACHE: ' + name + '\n';
            detail += '  /: ' + (hasRoot ? 'HIT' : 'MISS') + '\n';
            detail += '  /index.html: ' + (hasHtml ? 'HIT' : 'MISS') + '\n';
            detail += '  MANIFEST: ' + (hasManifest ? 'HIT' : 'MISS') + '\n';
            if (hasManifest) {
              const mResp = await cache.match(SHELL_MANIFEST_URL);
              try {
                const m = await mResp.json();
                detail += '  manifest.required: ' + JSON.stringify(m.required) + '\n';
                for (const url of m.required) {
                  detail += '    ' + url + ': ' + ((await cache.match(url)) ? 'HIT' : 'MISS') + '\n';
                }
              } catch (e) { detail += '  MANIFEST_READ_ERROR: ' + e.message + '\n'; }
            }
          }
          return DIAG_HTML('TEMP SW OFFLINE FAILURE', 'TEMP SW OFFLINE FAILURE\n' + detail);
        }
        return (await shell.cache.match('/')) || (await shell.cache.match('/index.html')) || DIAG_HTML('TEMP SW OFFLINE FAILURE', 'TEMP SW OFFLINE FAILURE\nSHELL_FOUND_BUT_EMPTY: ' + shell.name);
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const shell = await findUsableShellCache();
    const cached = await shell?.cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    // TEMP OFFLINE BOOT DEBUG: report boot asset cache miss
    if (shell && !response.ok) {
      const url = event.request.url;
      try {
        const manifest = await shell.cache.match(SHELL_MANIFEST_URL);
        if (manifest) {
          const m = await manifest.json();
          if (m.required && m.required.some((u) => url.endsWith(u) || u.endsWith(new URL(url).pathname))) {
            console.error('TEMP BOOT_ASSET_CACHE_MISS', url, response.status);
          }
        }
      } catch {}
    }
    return response;
  })());
});
