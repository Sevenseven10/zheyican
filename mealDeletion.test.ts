import { indexedDB } from 'fake-indexeddb';
import type { Meal } from './domain/meal';
import { createNativeMealRepository, DELETE_MEAL_SQL } from './storage/native/mealRepository';
import { createIndexedDbRepositories, WEB_DATABASE_NAME, WebStorageError } from './storage/web/indexedDbRepositories';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const meal = (id: string, photos: Meal['photos']): Meal => ({ id, createdAt: '2026-08-15T00:00:00.000Z', mealDate: '2026-08-15', mealTime: '12:00', mealType: '午餐', photos, foodText: id, note: null });

async function runDeletionTests() {
  const databaseName = `${WEB_DATABASE_NAME}-delete-test-${Date.now()}-${Math.random()}`;
  let photoNumber = 0;
  const repositories = createIndexedDbRepositories({
    databaseName,
    indexedDb: indexedDB,
    createPhotoId: () => `photo-${++photoNumber}`,
    createObjectUrl: (blob) => `blob:delete-${blob.size}-${photoNumber}`,
    revokeObjectUrl: () => undefined,
  });
  await repositories.mealRepository.initialize();
  const photo1 = await repositories.photoRepository.persistBlob(new Blob(['one']), { originalWidth: 100, originalHeight: 100 });
  const photo2 = await repositories.photoRepository.persistBlob(new Blob(['two']), { originalWidth: 100, originalHeight: 100 });
  const photo3 = await repositories.photoRepository.persistBlob(new Blob(['three']), { originalWidth: 100, originalHeight: 100 });
  const photoB = await repositories.photoRepository.persistBlob(new Blob(['other']), { originalWidth: 100, originalHeight: 100 });
  await repositories.mealRepository.createMeal(meal('A', [photo1, photo2]));
  await repositories.mealRepository.createMeal(meal('B', [photoB]));

  // The edit draft removed photo1 and added photo3; the deletion cleanup union
  // must still remove all three A photos after the authoritative Meal delete.
  await repositories.mealRepository.deleteMeal('A');
  await Promise.all(Array.from(new Set([photo1.uri, photo2.uri, photo3.uri, photo2.uri])).map((uri) => repositories.photoRepository.deletePhoto(uri)));
  assert((await repositories.mealRepository.listMeals()).map((item) => item.id).join(',') === 'B', 'Deleting Meal A changed another Meal');
  assert(await repositories.photoRepository.get('photo-1') === null, 'Removed draft photo was not cleaned up');
  assert(await repositories.photoRepository.get('photo-2') === null, 'Existing Meal photo was not cleaned up');
  assert(await repositories.photoRepository.get('photo-3') === null, 'New draft photo was not cleaned up');
  assert(await repositories.photoRepository.get('photo-4') !== null, 'Photo belonging to Meal B was deleted');
  assert((await repositories.mealRepository.listMeals())[0]?.photos[0]?.uri.startsWith('blob:delete-'), 'Other Meal photo did not materialize');
  await repositories.mealRepository.deleteMeal('missing');
  assert((await repositories.mealRepository.listMeals()).length === 1, 'Deleting a missing Meal changed stored records');
  repositories.close();

  const failureName = `${databaseName}-failure`;
  const healthy = createIndexedDbRepositories({ databaseName: failureName, indexedDb: indexedDB, createPhotoId: () => 'failure-photo', createObjectUrl: () => 'blob:failure', revokeObjectUrl: () => undefined });
  await healthy.mealRepository.initialize();
  const failurePhoto = await healthy.photoRepository.persistBlob(new Blob(['failure']), { originalWidth: 100, originalHeight: 100 });
  await healthy.mealRepository.createMeal(meal('failure-meal', [failurePhoto]));
  healthy.close();
  const failing = createIndexedDbRepositories({ databaseName: failureName, indexedDb: indexedDB, beforeCommit: (operation) => { if (operation === 'meal-delete') throw new DOMException('Injected delete failure', 'AbortError'); } });
  let deleteFailed = false;
  try { await failing.mealRepository.deleteMeal('failure-meal'); } catch (error) { deleteFailed = error instanceof WebStorageError && error.code === 'TRANSACTION_FAILED'; }
  assert(deleteFailed, 'Delete transaction failure was not surfaced as WebStorageError');
  assert((await failing.mealRepository.listMeals()).some((item) => item.id === 'failure-meal'), 'Failed delete removed the Meal');
  assert(await failing.photoRepository.get('failure-photo') !== null, 'Failed delete removed a Photo');
  failing.close();

  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const native = createNativeMealRepository(Promise.resolve({
    execAsync: async () => undefined,
    getAllAsync: async () => [],
    runAsync: async (sql: string, ...params: unknown[]) => { calls.push({ sql, params }); },
  }));
  await native.initialize();
  await native.createMeal(meal('native', []));
  await native.updateMeal(meal('native', []));
  await native.listMeals();
  await native.deleteMeal('native');
  assert(calls.at(-1)?.sql === DELETE_MEAL_SQL && calls.at(-1)?.params[0] === 'native', 'Native delete did not use DELETE_MEAL_SQL');
}

runDeletionTests().catch((error) => { throw error; });
