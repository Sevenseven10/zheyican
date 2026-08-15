import type { Meal } from './domain/meal';
import { indexedDB } from 'fake-indexeddb';
import {
  createIndexedDbRepositories,
  WEB_DATABASE_NAME,
  WEB_DATABASE_VERSION,
  WEB_PHOTO_REFERENCE_PREFIX,
  WebStorageError,
} from './storage/web/indexedDbRepositories';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runWebRepositoryTests(indexedDb: IDBFactory) {
  const databaseName = `${WEB_DATABASE_NAME}-test-${Date.now()}-${Math.random()}`;
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  let nextPhotoId = 0;
  const createRepositories = (beforeCommit?: (operation: 'photo-put' | 'meal-create' | 'meal-update' | 'meal-delete') => void) => createIndexedDbRepositories({
    databaseName,
    indexedDb,
    createPhotoId: () => `photo-${++nextPhotoId}`,
    createObjectUrl: () => {
      const url = `blob:test-${createdUrls.length + 1}`;
      createdUrls.push(url);
      return url;
    },
    revokeObjectUrl: (url) => { revokedUrls.push(url); },
    beforeCommit,
  });

  const first = createRepositories();
  await first.mealRepository.initialize();
  const blob = new Blob(['fixture-photo'], { type: 'image/jpeg' });
  const photo = await first.photoRepository.persistBlob(blob, { originalWidth: 1200, originalHeight: 900 });
  const storedPhoto = await first.photoRepository.get('photo-1');
  assert(storedPhoto?.blob instanceof Blob, 'Photo Blob was not stored in IndexedDB');
  assert(storedPhoto.mimeType === 'image/jpeg' && storedPhoto.size === blob.size, 'Photo MIME or size metadata changed');
  assert(storedPhoto.originalWidth === 1200 && storedPhoto.originalHeight === 900, 'Photo dimensions metadata changed');
  const heicWithoutBrowserMime = await first.photoRepository.persistBlob(new Blob(['heic-fixture']), {
    photoId: 'metadata-heic',
    mimeType: 'image/heic',
    originalWidth: 3024,
    originalHeight: 4032,
  });
  assert((await first.photoRepository.get('metadata-heic'))?.mimeType === 'image/heic', 'Inferred HEIC MIME was not persisted');
  await first.photoRepository.deletePhoto(heicWithoutBrowserMime.uri);

  const meal: Meal = {
    id: 'web-persisted-meal',
    createdAt: '2026-08-14T04:34:00.000Z',
    mealDate: '2026-08-14',
    mealTime: '12:34',
    mealType: '午餐',
    photos: [photo],
    foodText: 'IndexedDB meal',
    note: null,
  };
  await first.mealRepository.createMeal(meal);
  assert((await first.mealRepository.listMeals())[0]?.id === meal.id, 'IndexedDB Meal create/list failed');
  const rawDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDb.open(databaseName, WEB_DATABASE_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const rawMeal = await new Promise<{ photos: Array<{ photoId?: string; uri?: string }> }>((resolve, reject) => {
    const request = rawDatabase.transaction('meals', 'readonly').objectStore('meals').get(meal.id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  rawDatabase.close();
  assert(rawMeal.photos[0].photoId === 'photo-1' && !('uri' in rawMeal.photos[0]), 'Persisted Web Meal must use photoId, not a display URI');
  await first.mealRepository.updateMeal({ ...meal, foodText: 'IndexedDB meal updated' });
  assert((await first.mealRepository.listMeals())[0]?.foodText === 'IndexedDB meal updated', 'IndexedDB Meal update failed');
  first.close();

  const reloaded = createRepositories();
  await reloaded.mealRepository.initialize();
  const afterReload = await reloaded.mealRepository.listMeals();
  assert(afterReload[0]?.id === meal.id && afterReload[0].photos.length === 1, 'IndexedDB reload did not retain Meal/photo references');
  assert(afterReload[0].photos[0].uri.startsWith('blob:test-'), 'Stored photo was not materialized as a display object URL');
  assert(createdUrls.length >= 2 && revokedUrls.includes(createdUrls[0]), 'Object URL replacement/revoke lifecycle failed');

  let missingPhotoRejected = false;
  try {
    await reloaded.mealRepository.createMeal({
      ...meal,
      id: 'broken-meal',
      photos: [{ ...photo, uri: `${WEB_PHOTO_REFERENCE_PREFIX}missing-photo` }],
    });
  } catch (error) {
    missingPhotoRejected = error instanceof WebStorageError && error.code === 'PHOTO_NOT_FOUND';
  }
  assert(missingPhotoRejected, 'Missing photo reference did not prevent Meal commit');
  assert(!(await reloaded.mealRepository.listMeals()).some((item) => item.id === 'broken-meal'), 'Photo failure left a partial Meal');

  reloaded.close();
  const failingUpdate = createRepositories((operation) => {
    if (operation === 'meal-update') throw new DOMException('Injected transaction failure', 'AbortError');
  });
  const failedEditPhoto = await failingUpdate.photoRepository.persistBlob(new Blob(['failed-edit-photo'], { type: 'image/jpeg' }), { originalWidth: 800, originalHeight: 600 });
  let updateRejected = false;
  try { await failingUpdate.mealRepository.updateMeal({ ...meal, photos: [failedEditPhoto], foodText: 'must not commit' }); } catch { updateRejected = true; }
  assert(updateRejected, 'Injected Meal update transaction failure was not reported');
  assert(await failingUpdate.photoRepository.get('photo-1') !== null, 'Failed edit deleted the existing photo');
  assert(await failingUpdate.photoRepository.get('photo-2') !== null, 'New photo should remain available for targeted orphan cleanup after update failure');
  failingUpdate.close();

  const afterFailedUpdate = createRepositories();
  const preservedMeals = await afterFailedUpdate.mealRepository.listMeals();
  assert(preservedMeals[0]?.foodText === 'IndexedDB meal updated', 'Failed update overwrote existing Meal data');
  assert(await afterFailedUpdate.photoRepository.cleanupOrphans(['photo-2']) === 1, 'Targeted orphan cleanup did not delete an unreferenced photo');
  assert(await afterFailedUpdate.photoRepository.get('photo-2') === null, 'Orphan photo remains after cleanup');
  const addedPhoto = await afterFailedUpdate.photoRepository.persistBlob(new Blob(['added-photo'], { type: 'image/png' }), { originalWidth: 600, originalHeight: 800 });
  await afterFailedUpdate.mealRepository.updateMeal({ ...preservedMeals[0], photos: [...preservedMeals[0].photos, addedPhoto] });
  const withAddedPhoto = await afterFailedUpdate.mealRepository.listMeals();
  assert(withAddedPhoto[0].photos.length === 2, 'Successful edit did not retain the old photo and add the new photo');
  await afterFailedUpdate.mealRepository.updateMeal({ ...withAddedPhoto[0], photos: [withAddedPhoto[0].photos[1]] });
  await afterFailedUpdate.photoRepository.deletePhoto(withAddedPhoto[0].photos[0].uri);
  assert(await afterFailedUpdate.photoRepository.get('photo-1') === null, 'Photo delete failed');
  assert(await afterFailedUpdate.photoRepository.get('photo-3') !== null, 'Successful delete removed the retained photo');
  assert((await afterFailedUpdate.mealRepository.listMeals())[0].photos.length === 1, 'Meal photo reference was not updated before deletion');
  afterFailedUpdate.close();

  const quotaDatabaseName = `${databaseName}-quota`;
  const quota = createIndexedDbRepositories({
    databaseName: quotaDatabaseName,
    indexedDb,
    beforeCommit: (operation) => {
      if (operation === 'photo-put') throw new DOMException('Storage full', 'QuotaExceededError');
    },
  });
  let quotaRejected = false;
  try { await quota.photoRepository.persistBlob(new Blob(['quota']), { originalWidth: 1, originalHeight: 1 }); } catch (error) {
    quotaRejected = error instanceof WebStorageError && error.code === 'QUOTA_EXCEEDED';
  }
  assert(quotaRejected, 'QuotaExceededError was not converted to a retryable storage error');
  assert((await quota.mealRepository.listMeals()).length === 0, 'Photo Blob failure left a partial Meal');
  quota.close();

  let openRejected = false;
  const unavailable = createIndexedDbRepositories({
    indexedDb: { open() { throw new DOMException('Unavailable', 'InvalidStateError'); } } as unknown as IDBFactory,
  });
  try { await unavailable.mealRepository.initialize(); } catch (error) {
    openRejected = error instanceof WebStorageError && error.code === 'OPEN_FAILED';
  }
  assert(openRejected, 'IndexedDB open failure was not reported');

  assert(WEB_DATABASE_VERSION === 2, 'Unexpected IndexedDB schema version');
}

runWebRepositoryTests(indexedDB).catch((error) => { throw error; });
