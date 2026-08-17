import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const entry = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const viewport = readFileSync(new URL('./platform/viewport.web.ts', import.meta.url), 'utf8');
const keyboardViewport = readFileSync(new URL('./platform/keyboardViewport.web.ts', import.meta.url), 'utf8');
const keyboardSession = readFileSync(new URL('./platform/keyboardViewportSession.ts', import.meta.url), 'utf8');
const nativeKeyboardViewport = readFileSync(new URL('./platform/keyboardViewport.ts', import.meta.url), 'utf8');
const layoutWeb = readFileSync(new URL('./platform/layout.web.ts', import.meta.url), 'utf8');
const shellBackground = readFileSync(new URL('./platform/shellBackground.web.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

assert.match(html, /html,\s*body,\s*#root\s*\{[^}]*height:\s*100vh;[^}]*min-height:\s*100vh;/s, 'Root shell needs a 100vh fallback');
assert.match(html, /@supports\s*\(height:\s*100dvh\)[\s\S]*?height:\s*100dvh;[\s\S]*?min-height:\s*100dvh;/, 'Normal Web needs a 100dvh enhancement');
assert.doesNotMatch(html, /@media\s*\(display-mode:\s*standalone\)[\s\S]*?height:\s*100vh;/, 'Standalone must not override a supported 100dvh root back to 100vh');
assert.doesNotMatch(html, /--app-viewport-height|100svh|-webkit-fill-available/, 'Root shell contains a prohibited height strategy');
assert.doesNotMatch(html, /calc\(\s*100dvh\s*\+\s*env\(safe-area-inset-top\)\s*\)/, 'R2 safe-area-in-root height formula must not exist');
assert.doesNotMatch(html, /safe-area-inset-top[\s\S]{0,80}?height:\s*calc/, 'safe-area must never be added into the Root total height');
assert.match(html, /navigator\.standalone\s*===\s*true/, 'iOS standalone detection must gate on navigator.standalone');
assert.match(html, /setAttribute\('data-ios-standalone',\s*'true'\)/, 'iOS standalone bootstrap must tag the document element');
assert.match(html, /html\[data-ios-standalone="true"\]/s, 'iOS standalone stable root must exist');
assert.match(html, /html\[data-ios-standalone="true"\][\s\S]*?height:\s*100vh;\s*min-height:\s*100vh;/, 'iOS standalone stable root must use a plain 100vh');
assert.match(html, /html\[data-ios-keyboard="true"\]\s*#app-bottom-nav[\s\S]*visibility:\s*hidden/, 'Keyboard must hide the bottom Nav via CSS visibility');
assert.match(html, /html\[data-ios-keyboard="true"\]\s*#add-action-dock[\s\S]*visibility:\s*hidden/, 'Keyboard must hide the Add Action Dock via CSS visibility');
assert.match(html, /pointer-events:\s*none/, 'Hidden bottom chrome must also reject taps');
assert.match(entry, /startKeyboardViewportSync\(\)/, 'Web entry must start the keyboard viewport sync');
assert.match(entry, /import \{ startKeyboardViewportSync \} from '\.\/platform\/keyboardViewport'/, 'Web entry must resolve the keyboard module through platform resolution');
assert.doesNotMatch(entry, /startViewportSync\s*\(\)/, 'Web entry must not start a Root Height manager');
assert.doesNotMatch(viewport, /visualViewport|innerHeight|clientHeight|setProperty/, 'Viewport module must not own Root Shell height');
assert.match(nativeKeyboardViewport, /return \(\) => undefined/, 'Native keyboard viewport must stay a no-op');
assert.doesNotMatch(nativeKeyboardViewport, /visualViewport|innerHeight|clientHeight/, 'Native keyboard viewport must not own Web viewport state');
assert.match(keyboardViewport, /data-ios-standalone/, 'Web keyboard workaround must gate on the iOS standalone tag');
assert.match(keyboardViewport, /focusin/, 'Keyboard lifecycle must be driven by focusin/focusout delegation');
assert.match(keyboardViewport, /focusout/, 'Keyboard lifecycle must be driven by focusin/focusout delegation');
assert.doesNotMatch(keyboardViewport, /style\.height|style\.minHeight/, 'Keyboard lifecycle must never mutate Root height');
assert.doesNotMatch(keyboardViewport, /position\s*[:=]\s*['"]?fixed/, 'Root must not be position fixed');
assert.doesNotMatch(keyboardViewport, /transform|translate/, 'Root must not be transformed');
assert.doesNotMatch(keyboardViewport, /safe-area-inset/, 'Keyboard lifecycle must not compensate with safe-area');
assert.doesNotMatch(keyboardViewport, /852|844|812|667|screen\.height/, 'Keyboard lifecycle must not hard-code a device height');
assert.match(keyboardSession, /requestAnimationFrame/, 'All Visual Viewport reads must be deferred after rAF');
assert.match(keyboardSession, /KEYBOARD_RESTORE_TOLERANCE_PX/, 'Keyboard restore must use a tiny tolerance');
assert.match(keyboardSession, /KEYBOARD_FALLBACK_MS/, 'Keyboard lifecycle must keep a short fallback cleanup');
assert.match(keyboardSession, /getRestingVisualViewportHeight/, 'Resting height is only a keyboard-closed detector');
assert.doesNotMatch(keyboardSession, /style\.height|style\.minHeight/, 'Keyboard session controller must never mutate Root height');
assert.match(shellBackground, /document\.documentElement\.style\.backgroundColor[\s\S]*document\.body\.style\.backgroundColor[\s\S]*root\.style\.backgroundColor/, 'Document shell background must support page-color synchronization');
assert.match(shellBackground, /querySelector\('meta\[name="theme-color"\]'\)[\s\S]*setAttribute\('content',\s*color\)/, 'Shell background must synchronize the theme-color meta');
assert.match(shellBackground, /light:\s*'#F3F2ED'[\s\S]*dark:\s*'#262725'[\s\S]*composer:\s*'#171816'[\s\S]*camera:\s*'#000000'/, 'Shell background color map must stay unchanged');
assert.match(html, /<meta name="theme-color" content="#F3F2ED" \/>/, 'Initial theme-color must stay #F3F2ED');
assert.match(app, /setShellBackground\([^)]*'light'[^)]*\)/, 'Light screens must synchronize the document shell');
assert.match(app, /setShellBackground\('dark'\)/, 'Add and Edit must synchronize the dark document shell');
assert.match(app, /setShellBackground\('composer'\)/, 'Photo Composer must synchronize its document shell');
assert.match(app, /useLayoutEffect\(\(\) => \{ setShellBackground\(startup === 'ready' && screen === 'add' \? 'dark' : 'light'\)/, 'Screen shell sync must run in useLayoutEffect before paint');
assert.doesNotMatch(app, /useEffect\(\(\) => \{ setShellBackground\(startup === 'ready' && screen === 'add'/, 'Screen shell sync must not regress to a paint-time useEffect');
assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/, 'Standalone status bar mode must be black-translucent');
assert.match(app, /nativeID="app-bottom-nav"/, 'Bottom Nav must expose a stable DOM id for Web');
assert.match(app, /nativeID="add-action-dock"/, 'Add Action Dock must expose a stable DOM id for Web');
assert.doesNotMatch(app, /nativeID="(?!app-bottom-nav|add-action-dock)[^"]*"/, 'App must not add unrelated DOM ids');
assert.match(app, /screenScroll:\s*\{[^}]*flex:\s*1[^}]*minHeight:\s*0/, 'Screen ScrollView region must own the remaining shell space');
assert.match(app, /<ScrollView style=\{styles\.screenScroll\}/, 'Screen ScrollView must be an explicit flex sibling region');
assert.match(app, /\{screen === 'today' \?[\s\S]*?<Nav screen=\{screen\} go=\{go\} \/>/, 'Main ScrollView and Bottom Nav must be shell siblings');
assert.match(app, /<\/ScrollView><View nativeID="add-action-dock"/, 'Add ScrollView and Action Dock must be shell siblings');
assert.doesNotMatch(app, /nav:\s*\{[^}]*position:\s*['"](?:absolute|fixed|sticky)['"]/s, 'Bottom Nav must be flow-owned');
assert.doesNotMatch(app, /nav:\s*\{[^}]*bottom:\s*0/s, 'Bottom Nav must not use a bottom anchor');
assert.doesNotMatch(app, /addActionDock:\s*\{[^}]*position:\s*['"](?:absolute|fixed|sticky)['"]/s, 'Add Action Dock must be flow-owned');
assert.doesNotMatch(app, /addActionDock:\s*\{[^}]*bottom:\s*0/s, 'Add Action Dock must not use a bottom anchor');
assert.doesNotMatch(app, /editorPage:\s*\{[^}]*paddingBottom:\s*172/s, 'Absolute-dock spacer must be removed from editor content');
assert.match(layoutWeb, /nav:\s*\{[^}]*paddingBottom:/, 'Nav safe-area padding must remain in the platform layout');
assert.match(layoutWeb, /addActionDock:\s*\{[^}]*paddingBottom:/, 'Dock safe-area padding must remain in the platform layout');
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
