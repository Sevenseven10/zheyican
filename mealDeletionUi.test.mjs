import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const nativeConfirmation = readFileSync(new URL('./platform/confirmDelete.ts', import.meta.url), 'utf8');
const webConfirmation = readFileSync(new URL('./platform/confirmDelete.web.ts', import.meta.url), 'utf8');

assert.match(app, /\{meal \? <Pressable[\s\S]*删除这一餐/, 'Delete action must only render for an existing Meal');
assert.match(app, /const \[deleting, setDeleting\] = useState\(false\)/, 'Delete action must guard against double submission');
assert.match(app, /await mealRepository\.deleteMeal\(meal\.id\);[\s\S]*cleanupUris/, 'Meal must be deleted before photo cleanup');
assert.match(app, /new Set\(\[\.\.\.initialPhotoUris\.current, \.\.\.newPhotoUris\.current, \.\.\.photos\.map/, 'Delete cleanup must include initial, new, and current photos');
assert.match(app, /await onDelete\(\)/, 'Successful deletion must refresh and return via the parent route');
assert.match(nativeConfirmation, /删除这一餐？[\s\S]*无法撤销[\s\S]*style: 'cancel'[\s\S]*style: 'destructive'/, 'Native confirmation must default safely to cancel');
assert.match(webConfirmation, /window\.confirm\('删除这一餐？/, 'Web must use a browser confirmation');

console.log('meal deletion UI contract tests passed');
