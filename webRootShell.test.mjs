import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const entry = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const viewport = readFileSync(new URL('./platform/viewport.web.ts', import.meta.url), 'utf8');
const shellBackground = readFileSync(new URL('./platform/shellBackground.web.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

assert.match(html, /html,\s*body,\s*#root\s*\{[^}]*height:\s*100vh;[^}]*min-height:\s*100vh;/s, 'Root shell needs a 100vh fallback');
assert.match(html, /@supports\s*\(height:\s*100dvh\)[\s\S]*?height:\s*100dvh;[\s\S]*?min-height:\s*100dvh;/, 'Normal Web needs a 100dvh enhancement');
assert.doesNotMatch(html, /@media\s*\(display-mode:\s*standalone\)[\s\S]*?height:\s*100vh;/, 'Standalone must not override a supported 100dvh root back to 100vh');
assert.doesNotMatch(html, /--app-viewport-height|100svh|-webkit-fill-available/, 'Root shell contains a prohibited height strategy');
assert.doesNotMatch(entry, /startViewportSync/, 'Web entry must not start a Root Height manager');
assert.doesNotMatch(viewport, /visualViewport|innerHeight|clientHeight|setProperty/, 'Viewport module must not own Root Shell height');
assert.match(shellBackground, /document\.documentElement\.style\.backgroundColor[\s\S]*document\.body\.style\.backgroundColor[\s\S]*root\.style\.backgroundColor/, 'Document shell background must support page-color synchronization');
assert.match(shellBackground, /querySelector\('meta\[name="theme-color"\]'\)[\s\S]*setAttribute\('content',\s*color\)/, 'Shell background must synchronize the theme-color meta');
assert.match(shellBackground, /light:\s*'#F3F2ED'[\s\S]*dark:\s*'#262725'[\s\S]*composer:\s*'#171816'[\s\S]*camera:\s*'#000000'/, 'Shell background color map must stay unchanged');
assert.match(html, /<meta name="theme-color" content="#F3F2ED" \/>/, 'Initial theme-color must stay #F3F2ED');
assert.match(app, /setShellBackground\([^)]*'light'[^)]*\)/, 'Light screens must synchronize the document shell');
assert.match(app, /setShellBackground\('dark'\)/, 'Add and Edit must synchronize the dark document shell');
assert.match(app, /setShellBackground\('composer'\)/, 'Photo Composer must synchronize its document shell');
assert.match(app, /useLayoutEffect\(\(\) => \{ setShellBackground\(startup === 'ready' && screen === 'add' \? 'dark' : 'light'\)/, 'Screen shell sync must run in useLayoutEffect before paint');
assert.doesNotMatch(app, /useEffect\(\(\) => \{ setShellBackground\(startup === 'ready' && screen === 'add'/, 'Screen shell sync must not regress to a paint-time useEffect');
assert.match(html, /apple-mobile-web-app-status-bar-style" content="default"/, 'Standalone status bar mode must be default');
assert.doesNotMatch(html, /height:\s*(?:844|812|852|667)px/, 'the root shell must not hard-code an iPhone height');
assert.doesNotMatch(html, /margin-(?:top|bottom):\s*-/, 'the root shell must not hide gaps with negative margins');

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
