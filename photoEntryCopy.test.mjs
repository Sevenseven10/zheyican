import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

// Exactly one visible "选择照片" label. An accessibilityLabel on the empty-photo
// placeholder is a screen-reader affordance, not a duplicate visible label.
assert.equal((app.match(/<Text[^>]*>选择照片<\/Text>/g) ?? []).length, 1, 'Add/Edit must expose one consistent visible photo-library label');
assert.equal((app.match(/从相册选择/g) ?? []).length, 0, 'legacy photo-library wording remains');
assert.match(app, /photoInputAvailability\.showCameraAction && <Pressable[^>]+><Text[^>]+>拍照<\/Text>/, 'Native camera action must remain behind the platform capability');
assert.match(readFileSync(new URL('./platform/photoInput.web.ts', import.meta.url), 'utf8'), /showCameraAction:\s*false/, 'Web must expose only the system photo chooser entry');

console.log('photo entry copy tests passed');
