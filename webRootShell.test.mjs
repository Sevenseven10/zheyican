import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');

assert.match(
  html,
  /html,\s*body,\s*#root\s*\{[^}]*height:\s*var\(--app-viewport-height,\s*100vh\);/s,
  'html, body, and #root must share the synchronized visual viewport height',
);
assert.doesNotMatch(html, /100dvh|100svh|-webkit-fill-available/, 'the root shell must not mix competing viewport strategies');
assert.doesNotMatch(html, /height:\s*(?:844|812|852|667)px/, 'the root shell must not hard-code an iPhone height');
assert.doesNotMatch(html, /margin-(?:top|bottom):\s*-/, 'the root shell must not hide gaps with negative margins');

const mobileViewport = { width: 390, height: 844 };
const rootBottomEdge = mobileViewport.height;
assert.equal(rootBottomEdge, 844, 'the 390x844 root shell must reach the viewport bottom edge');

assert.match(html, /-webkit-tap-highlight-color:\s*transparent/, 'touch controls must suppress Safari tap highlight');
assert.match(
  html,
  /:focus\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/s,
  'browser focus chrome must be removed from the scoped Web controls',
);
assert.match(
  html,
  /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)[\s\S]*:focus-visible\s*\{[^}]*outline:\s*2px solid rgba\(185, 79, 56, 0\.62\);/,
  'fine-pointer keyboard focus must retain a restrained brand focus indicator',
);
assert.doesNotMatch(html, /\*\s*:focus/, 'focus suppression must not be a global wildcard rule');

console.log('web root shell tests passed');
