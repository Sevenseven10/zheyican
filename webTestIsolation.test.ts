import { indexedDB } from 'fake-indexeddb';
import {
  createIndexedDbRepositories,
  resolveRuntimeWebDatabaseName,
  WEB_DATABASE_NAME,
  WEB_DATABASE_VERSION,
  WEB_VERIFICATION_DATABASE_PREFIX,
  type StoredWebMeal,
  type StoredWebPhoto,
} from './storage/web/indexedDbRepositories';
import {
  LEGACY_VERIFICATION_FOOD_TEXT,
  LEGACY_VERIFICATION_MEAL_ID,
  LEGACY_VERIFICATION_PHOTO_ID,
} from './storage/web/legacyVerificationCleanup';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const knownFixtureMeal = (): StoredWebMeal => ({
  id: LEGACY_VERIFICATION_MEAL_ID,
  createdAt: '2026-08-13T04:34:00.000Z',
  mealDate: '2026-08-13',
  mealTime: '12:34',
  mealType: '午餐',
  foodText: LEGACY_VERIFICATION_FOOD_TEXT,
  note: 'Phase 3 token 5ebf0db0-f628-4e0f-a220-99c399f9a1dc',
  photos: [{
    photoId: LEGACY_VERIFICATION_PHOTO_ID,
    originalWidth: 1200,
    originalHeight: 900,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  }],
});

const knownFixturePhoto = (): StoredWebPhoto => ({
  photoId: LEGACY_VERIFICATION_PHOTO_ID,
  blob: new Blob(['legacy-verification-photo'], { type: 'image/svg+xml' }),
  mimeType: 'image/svg+xml',
  originalWidth: 1200,
  originalHeight: 900,
  size: 25,
  createdAt: '2026-08-13T04:34:00.000Z',
});

const userMeal = (id = 'user-meal', photoId = 'user-photo'): StoredWebMeal => ({
  id,
  createdAt: '2026-08-14T04:34:00.000Z',
  mealDate: '2026-08-14',
  mealTime: '13:00',
  mealType: '午餐',
  foodText: '用户真实记录',
  note: null,
  photos: [{
    photoId,
    originalWidth: 3024,
    originalHeight: 4032,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  }],
});

const userPhoto = (photoId = 'user-photo'): StoredWebPhoto => ({
  photoId,
  blob: new Blob(['user-photo'], { type: 'image/jpeg' }),
  mimeType: 'image/jpeg',
  originalWidth: 3024,
  originalHeight: 4032,
  size: 10,
  createdAt: '2026-08-14T04:34:00.000Z',
});

async function createVersionOneDatabase(
  databaseName: string,
  meals: StoredWebMeal[],
  photos: StoredWebPhoto[],
) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('meals', { keyPath: 'id' });
      request.result.createObjectStore('photos', { keyPath: 'photoId' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['meals', 'photos'], 'readwrite');
      meals.forEach((meal) => transaction.objectStore('meals').put(meal));
      photos.forEach((photo) => transaction.objectStore('photos').put(photo));
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    };
  });
}

async function deleteTestDatabase(databaseName: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Test database remained open: ${databaseName}`));
  });
}

async function runWebTestIsolationTests() {
  assert(resolveRuntimeWebDatabaseName() === WEB_DATABASE_NAME, 'Production runtime database name changed');
  const verificationName = `${WEB_VERIFICATION_DATABASE_PREFIX}${Date.now()}-${Math.random()}`;
  assert(resolveRuntimeWebDatabaseName(verificationName) === verificationName, 'Verification database override was rejected');
  let unsafeOverrideRejected = false;
  try { resolveRuntimeWebDatabaseName(`${WEB_DATABASE_NAME}-test-unsafe`); } catch { unsafeOverrideRejected = true; }
  assert(unsafeOverrideRejected, 'Runtime accepted a non-verification database override');

  const cleanupDatabase = `${WEB_DATABASE_NAME}-test-cleanup-${Date.now()}-${Math.random()}`;
  await createVersionOneDatabase(
    cleanupDatabase,
    [knownFixtureMeal(), userMeal()],
    [knownFixturePhoto(), userPhoto()],
  );
  const cleanup = createIndexedDbRepositories({ databaseName: cleanupDatabase, indexedDb: indexedDB });
  await cleanup.mealRepository.initialize();
  const cleanedMeals = await cleanup.mealRepository.listMeals();
  assert(cleanup.legacyCleanupReport.mealsDeleted === 1, 'Known verification Meal was not deleted exactly once');
  assert(cleanup.legacyCleanupReport.photosDeleted === 1, 'Known orphan verification photo was not deleted exactly once');
  assert(cleanedMeals.length === 1 && cleanedMeals[0].id === 'user-meal', 'User Meal was changed by fixture cleanup');
  assert(await cleanup.photoRepository.get('user-photo') !== null, 'User photo was changed by fixture cleanup');
  assert(await cleanup.photoRepository.get(LEGACY_VERIFICATION_PHOTO_ID) === null, 'Orphan verification photo remains');
  cleanup.close();
  const upgradedDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(cleanupDatabase);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert(upgradedDatabase.version === WEB_DATABASE_VERSION, 'Production-style database was rebuilt instead of upgraded');
  upgradedDatabase.close();
  await deleteTestDatabase(cleanupDatabase);

  const ambiguousDatabase = `${WEB_DATABASE_NAME}-test-ambiguous-${Date.now()}-${Math.random()}`;
  const ambiguousMeal = { ...knownFixtureMeal(), note: 'Phase 3 token not-a-known-verification-token' };
  await createVersionOneDatabase(ambiguousDatabase, [ambiguousMeal], [knownFixturePhoto()]);
  const ambiguous = createIndexedDbRepositories({ databaseName: ambiguousDatabase, indexedDb: indexedDB });
  await ambiguous.mealRepository.initialize();
  assert(ambiguous.legacyCleanupReport.mealsDeleted === 0, 'Ambiguous Meal was incorrectly deleted');
  assert(ambiguous.legacyCleanupReport.photosDeleted === 0, 'Photo belonging to an ambiguous Meal was incorrectly deleted');
  assert((await ambiguous.mealRepository.listMeals())[0]?.id === LEGACY_VERIFICATION_MEAL_ID, 'Ambiguous Meal was not preserved');
  assert(await ambiguous.photoRepository.get(LEGACY_VERIFICATION_PHOTO_ID) !== null, 'Ambiguous photo was not preserved');
  ambiguous.close();
  await deleteTestDatabase(ambiguousDatabase);

  const sharedPhotoDatabase = `${WEB_DATABASE_NAME}-test-shared-photo-${Date.now()}-${Math.random()}`;
  await createVersionOneDatabase(
    sharedPhotoDatabase,
    [knownFixtureMeal(), userMeal('user-meal-with-shared-photo', LEGACY_VERIFICATION_PHOTO_ID)],
    [knownFixturePhoto()],
  );
  const shared = createIndexedDbRepositories({ databaseName: sharedPhotoDatabase, indexedDb: indexedDB });
  await shared.mealRepository.initialize();
  assert(shared.legacyCleanupReport.mealsDeleted === 1, 'Known verification Meal was not removed from shared-photo case');
  assert(shared.legacyCleanupReport.photosDeleted === 0, 'Photo still referenced by a user Meal was deleted');
  const sharedMeals = await shared.mealRepository.listMeals();
  assert(sharedMeals.length === 1 && sharedMeals[0].id === 'user-meal-with-shared-photo', 'User Meal sharing the photo was deleted');
  assert(await shared.photoRepository.get(LEGACY_VERIFICATION_PHOTO_ID) !== null, 'Referenced photo was deleted as an orphan');
  shared.close();
  await deleteTestDatabase(sharedPhotoDatabase);
}

runWebTestIsolationTests().catch((error) => { throw error; });
