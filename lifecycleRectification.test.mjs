import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const backup = readFileSync(new URL('./storage/web/backup.ts', import.meta.url), 'utf8');

assert.match(app, /const draftIdentity = useRef\(meal \? null : \{ id:/, 'New Meal must keep one draft identity');
assert.match(app, /id: draftIdentity!\.id, createdAt: draftIdentity!\.createdAt/, 'Create retries must reuse ID and createdAt');
assert.match(app, /try \{ await onSave\(\); \}[\s\S]*记录已保存/, 'Refresh failures must not be reported as write failures');
assert.match(app, /const preparePart = async[\s\S]*createBackupPart[\s\S]*const savePart = async[\s\S]*saveBackupPart\(readyPart\.file\)/, 'ZIP generation must finish before the explicit save click');
assert.doesNotMatch(app.match(/const savePart = async[\s\S]*?const selectRestore/)?.[0] ?? '', /createBackupPart/, 'Save click must not generate ZIP');
assert.match(backup, /export async function saveBackupPart\(file: File\)/, 'Save must receive the prebuilt File');
console.log('lifecycle rectification UI contract tests passed');
