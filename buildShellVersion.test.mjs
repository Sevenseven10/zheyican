import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync('dist/index.html', 'utf8');
const sw = readFileSync('dist/sw.js', 'utf8');

const htmlHash = createHash('sha256').update(html).digest('hex').slice(0, 12);

assert(sw.includes(htmlHash), 'dist/sw.js does not contain the SHA-256 hash of dist/index.html');
assert(sw.includes('CACHE_PREFIX') && sw.includes('SHELL_MANIFEST_URL'), 'dist/sw.js is missing shell cache infrastructure');
assert(!sw.includes('__SHELL_VERSION__'), 'dist/sw.js still contains unstamped placeholder');

const altHtml = html + '<!-- alt -->';
const altHash = createHash('sha256').update(altHtml).digest('hex').slice(0, 12);
assert.notEqual(htmlHash, altHash, 'Hash must change when HTML content changes');

const altSw = sw.replace(htmlHash, altHash);
assert(altSw.includes(altHash), 'Alternate hash must produce a different CACHE_NAME');

console.log(`Build shell version test passed: ${htmlHash}`);
