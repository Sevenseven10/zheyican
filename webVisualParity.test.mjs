import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const webLayout = readFileSync(new URL('./platform/layout.web.ts', import.meta.url), 'utf8');
const nativeLayout = readFileSync(new URL('./platform/layout.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

assert.match(html, /-webkit-text-size-adjust:\s*100%/, 'Safari text autosizing must not change Native typography tokens');
assert.match(html, /#root \[dir="auto"\]\s*\{\s*line-height:\s*1\.2;/s, 'implicit Web text line boxes must map to the compact iOS system metric');
assert.match(html, /font-family:\s*-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif/, 'Web must use the local iOS Chinese system font stack');

assert.match(webLayout, /paddingTop: cssDimension\('max\(70px, env\(safe-area-inset-top\)\)'\)/, 'Today, History, and data pages must recover the Native iOS 70px top rhythm');
assert.match(webLayout, /paddingTop: cssDimension\('max\(63px, env\(safe-area-inset-top\)\)'\)/, 'Add and Edit must recover the Native iOS 63px top rhythm');
assert.match(webLayout, /paddingBottom: cssDimension\('max\(24px, env\(safe-area-inset-bottom\)\)'\)/, 'bottom navigation must retain the Native 24px inset while respecting a larger Web safe area');
assert.match(webLayout, /height: cssDimension\('max\(84px, calc\(50px \+ env\(safe-area-inset-bottom\)\)\)'\)/, 'bottom navigation must recover the Native 84px visual height');
assert.match(webLayout, /addSave: \{\}/, 'Web Add/Edit must not invent auto spacing absent from Native');
assert.match(webLayout, /brandIndex: \{ bottom: 50 \}/, 'Splash index must recover the Native iOS bottom position');

assert.match(nativeLayout, /page: \{\}/, 'Native layout adapter must remain unchanged');
assert.match(app, /getMealPhotoLayout\(count, containerWidth\)/, 'the shared 1–6 photo composition algorithm must remain in use');
assert.doesNotMatch(webLayout, /transform|scale\(/, 'visual parity must not be simulated with Web scaling');

console.log('web visual parity tests passed');
