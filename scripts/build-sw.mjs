import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PLACEHOLDER = '__SHELL_VERSION__';
const htmlPath = new URL('../dist/index.html', import.meta.url);
const swPath = new URL('../dist/sw.js', import.meta.url);

const html = readFileSync(htmlPath, 'utf8');
const hash = createHash('sha256').update(html).digest('hex').slice(0, 12);

const sw = readFileSync(swPath, 'utf8');
if (!sw.includes(PLACEHOLDER)) {
  throw new Error(`dist/sw.js does not contain ${PLACEHOLDER} — was it already stamped?`);
}

const stamped = sw.replace(PLACEHOLDER, hash);
writeFileSync(swPath, stamped, 'utf8');
console.log(`Shell version: ${hash}`);
