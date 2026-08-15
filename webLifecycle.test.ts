import { indexedDB } from 'fake-indexeddb';
import type { Meal } from './domain/meal';
import { createIndexedDbRepositories, WEB_DATABASE_NAME } from './storage/web/indexedDbRepositories';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const meal = (id: string, photos: Meal['photos']): Meal => ({ id, createdAt: '2026-01-01T00:00:00.000Z', mealDate: '2025-12-31', mealTime: '23:59', mealType: '晚餐', photos, foodText: id, note: 'note' });

async function run() {
  let number = 0; let urls = 0; const revoked: string[] = [];
  const repo = createIndexedDbRepositories({ databaseName: `${WEB_DATABASE_NAME}-lifecycle-${Date.now()}`, indexedDb: indexedDB, createPhotoId: () => `p-${++number}`, createObjectUrl: () => `blob:${++urls}`, revokeObjectUrl: (url) => { revoked.push(url); } });
  await repo.mealRepository.initialize();
  const shared = await repo.photoRepository.persistBlob(new Blob(['shared'], { type: 'image/jpeg' }), { originalWidth: 10, originalHeight: 20 });
  const orphan = await repo.photoRepository.persistBlob(new Blob(['orphan']), { originalWidth: 1, originalHeight: 1 });
  const meals = Array.from({ length: 1000 }, (_, index) => meal(`m-${index}`, [shared, shared, shared]));
  for (const item of meals) await repo.mealRepository.createMeal(item);
  urls = 0;
  const listed = await repo.mealRepository.listMeals();
  assert(listed.length === 1000 && listed[0].photos[0].uri === 'zheyican-photo:p-1', 'Metadata list was not stable-reference only');
  assert(urls === 0, 'Startup materialized historical Blob URLs');
  assert(await repo.photoRepository.resolvePhoto!(shared.uri) === 'blob:1' && Number(urls) === 1, 'Lazy resolver did not create one cached URL');
  assert(await repo.photoRepository.resolvePhoto!(shared.uri) === 'blob:1' && Number(urls) === 1, 'Resolver did not cache URL');
  repo.photoRepository.retainPhoto!(shared.uri); repo.photoRepository.retainPhoto!(shared.uri);
  repo.photoRepository.releasePhoto!(shared.uri);
  assert(!revoked.includes('blob:1'), 'Shared photo URL was revoked before its final consumer released it');
  repo.photoRepository.releasePhoto!(shared.uri);
  assert(revoked.includes('blob:1'), 'Photo URL was not revoked after final consumer release');
  assert(await repo.photoRepository.resolvePhoto!(shared.uri) === 'blob:2', 'Released photo URL was not lazily recreated');
  const candidates = await repo.photoRepository.getStartupOrphanCandidatePhotoIds!();
  assert(candidates.includes('p-2'), 'Startup orphan snapshot missed orphan');
  await repo.photoRepository.cleanupOrphans(candidates);
  assert(await repo.photoRepository.get('p-2') === null, 'Orphan was not deleted');
  await repo.photoRepository.deletePhoto(shared.uri);
  assert(await repo.photoRepository.get('p-1') !== null, 'Shared referenced photo was deleted');
  await repo.photoRepository.cleanupOrphans(candidates);
  assert(await repo.photoRepository.get('p-1') !== null, 'Repeated cleanup deleted referenced photo');
  const retryMeal = meal('fixed-draft-id', [shared]);
  await repo.mealRepository.createMeal(retryMeal); // Simulates a committed write whose refresh callback then failed.
  await repo.mealRepository.createMeal(retryMeal); // Retrying the same draft must overwrite, not duplicate.
  assert((await repo.mealRepository.listMeals()).filter((item) => item.id === 'fixed-draft-id').length === 1, 'Retry after UI refresh failure created a duplicate Meal');
  const conflictPhoto = { photoId: 'conflict-photo', blob: new Blob(['conflict']), mimeType: 'image/jpeg', originalWidth: 1, originalHeight: 1, size: 8, createdAt: '2026-01-01T00:00:00.000Z' };
  const conflictMeal = { ...(await repo.backupSource.listStoredMeals())[0], foodText: 'conflicting import', photos: [{ photoId: conflictPhoto.photoId, originalWidth: 1, originalHeight: 1, scale: 1, offsetX: 0, offsetY: 0 }] };
  const restore = await repo.backupSource.importBackupPart([conflictMeal], [conflictPhoto]);
  assert(restore.conflicts === 1 && restore.photosAdded === 0 && await repo.photoRepository.get('conflict-photo') === null, 'Conflict-only restore imported an orphan photo');
  repo.close();
}
run().catch((error) => { throw error; });
