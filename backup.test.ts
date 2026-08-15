import type { StoredWebMeal, StoredWebPhoto } from './storage/web/indexedDbRepositories';
import { createBackupPart, planBackup, restoreValidatedParts, validateRestore } from './storage/web/backup';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const meal = (id: string, photoId: string): StoredWebMeal => ({ id, createdAt: '2025-12-31T23:59:00.000Z', mealDate: '2025-12-31', mealTime: '23:59', mealType: '晚餐', foodText: id, note: '保留备注', photos: [{ photoId, originalWidth: 12, originalHeight: 34, scale: 1.2, offsetX: 0.1, offsetY: -0.2 }] });

function source(meals: StoredWebMeal[], photos: StoredWebPhoto[]) {
  return {
    async listStoredMeals() { return meals.map((item) => structuredClone(item)); },
    async getStoredPhoto(id: string) { return photos.find((item) => item.photoId === id) ?? null; },
    async importBackupPart(incomingMeals: StoredWebMeal[], incomingPhotos: StoredWebPhoto[]) {
      let added = 0; let skipped = 0; let conflicts = 0; let photosAdded = 0;
      for (const photo of incomingPhotos) if (!photos.some((item) => item.photoId === photo.photoId)) { photos.push(photo); photosAdded++; }
      for (const item of incomingMeals) { const existing = meals.find((value) => value.id === item.id); if (!existing) { meals.push(item); added++; } else if (JSON.stringify(existing) === JSON.stringify(item)) skipped++; else conflicts++; }
      return { added, skipped, conflicts, photosAdded };
    },
  };
}

async function run() {
  const photos: StoredWebPhoto[] = [{ photoId: 'p1', blob: new Blob(['photo'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', originalWidth: 12, originalHeight: 34, size: 5, createdAt: '2026-01-01T00:00:00.000Z' }];
  const originalMeals = [meal('m1', 'p1')]; const original = source(originalMeals, photos);
  const emptyPlan = await planBackup(source([], [])); assert(emptyPlan.parts.length === 1, '0 Meal backup must create one valid part');
  const plan = await planBackup(original, 1); assert(plan.parts.length === 1, 'A single oversized Meal must remain unsplit');
  const part = await createBackupPart(original, plan, 0); const file = new File([part.blob], part.filename, { type: 'application/zip' });
  const valid = await validateRestore([file]); assert(valid.length === 1, 'Valid backup failed prevalidation');
  const targetMeals: StoredWebMeal[] = []; const targetPhotos: StoredWebPhoto[] = []; const target = source(targetMeals, targetPhotos);
  const first = await restoreValidatedParts(target, valid); assert(first.added === 1 && targetMeals[0].note === '保留备注' && targetMeals[0].photos[0].scale === 1.2 && targetPhotos[0].mimeType === 'image/jpeg', 'Restore did not preserve Meal/photo data');
  const repeat = await restoreValidatedParts(target, valid); assert(repeat.skipped === 1 && targetMeals.length === 1, 'Duplicate restore was not idempotent');
  targetMeals[0] = { ...targetMeals[0], foodText: 'local conflict' }; const conflict = await restoreValidatedParts(target, valid); assert(conflict.conflicts === 1 && targetMeals[0].foodText === 'local conflict', 'Conflict overwrote local Meal');
  let failed = false; try { await validateRestore([new File([new Blob(['bad'])], 'bad.zip')]); } catch { failed = true; } assert(failed, 'Corrupt ZIP passed validation');
  const multiPhotos: StoredWebPhoto[] = [
    { ...photos[0], photoId: 'p2', blob: new Blob(['two'], { type: 'image/png' }), mimeType: 'image/png', size: 3 },
  ];
  const multi = source([meal('m1', 'p1'), meal('m2', 'p2')], [...photos, ...multiPhotos]);
  const multiPlan = await planBackup(multi, 8); assert(multiPlan.parts.length === 2, 'Small target did not create multiple parts');
  const files = await Promise.all(multiPlan.parts.map(async (_, index) => { const output = await createBackupPart(multi, multiPlan, index); return new File([output.blob], output.filename); }));
  assert((await validateRestore(files)).length === 2, 'Multiple backup parts did not validate');
  for (const invalid of [files.slice(0, 1), [files[0], files[0]]]) { let rejected = false; try { await validateRestore(invalid); } catch { rejected = true; } assert(rejected, 'Missing or duplicate part passed validation'); }
}
run().catch((error) => { throw error; });
