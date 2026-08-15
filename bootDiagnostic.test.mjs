import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync('public/index.html', 'utf8');
const swSource = readFileSync('public/sw.js', 'utf8');
const indexTs = readFileSync('index.ts', 'utf8');

// 1. HTML boot sentinel exists
assert(html.includes('data-temp-boot'), 'TEMP BOOT DEBUG sentinel missing from HTML');
assert(html.includes("stage='HTML_INLINE_RUNNING'"), 'HTML boot sentinel initial stage missing');
assert(html.includes('TEMP BOOT DEBUG'), 'TEMP BOOT DEBUG label missing');

// 2. index.ts sets APP_BUNDLE_EXECUTING
assert(indexTs.includes('__TEMP_BOOT_DEBUG'), 'index.ts does not reference TEMP BOOT DEBUG');
assert(indexTs.includes('APP_BUNDLE_EXECUTING'), 'index.ts does not set APP_BUNDLE_EXECUTING');

// 3. SW returns diagnostic HTML when no usable shell
assert(swSource.includes('TEMP SW OFFLINE FAILURE'), 'SW missing TEMP OFFLINE FAILURE diagnostic');
assert(swSource.includes('NO_USABLE_SHELL'), 'SW missing NO_USABLE_SHELL diagnostic');
assert(swSource.includes('SHELL_GENERATIONS'), 'SW missing shell generation enumeration');
assert(!swSource.includes('Response.error()'), 'SW still uses Response.error() fallback');

// 4. Diagnostic does not write CacheStorage (installShell uses it; diagnostic path must not)
const diagSection = swSource.slice(swSource.indexOf('NO_USABLE_SHELL'));
assert(!diagSection.includes('cache.put'), 'SW diagnostic path writes to CacheStorage');

// 5. Build generation architecture unchanged
assert(swSource.includes('__SHELL_VERSION__'), 'Build generation placeholder missing');
assert(swSource.includes('isCompleteShellCache'), 'Atomic install gate missing');
assert(swSource.includes('findUsableShellCache'), 'Shell cache discovery missing');

// 6. __SHELL_VERSION__ still stamped by build step
assert(swSource.includes("CACHE_NAME = `${CACHE_PREFIX}__SHELL_VERSION__`"), 'CACHE_NAME template literal broken');

console.log('Boot diagnostic regression tests passed');
