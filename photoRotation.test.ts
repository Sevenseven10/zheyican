import { indexedDB } from 'fake-indexeddb';
import type { Meal } from './domain/meal';
import { getComposedImageLayout, getMealPhotoLayout, normalizePhoto, normalizeRotation } from './photoLayout';
import { createBackupPart, planBackup, restoreValidatedParts, validateRestore } from './storage/web/backup';
import type { StoredWebMeal } from './storage/web/indexedDbRepositories';
import { createIndexedDbRepositories, WEB_DATABASE_NAME } from './storage/web/indexedDbRepositories';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const closeTo = (actual: number, expected: number, message: string) => {
  assert(Math.abs(actual - expected) < 0.0001, `${message}: expected ${expected}, received ${actual}`);
};

const frame = (photo: ReturnType<typeof getComposedImageLayout>, frameWidth: number, frameHeight: number) => {
  assert(Number.isFinite(photo.left) && Number.isFinite(photo.top) && Number.isFinite(photo.width) && Number.isFinite(photo.height), 'Rotated layout produced a non-finite value');
  assert(photo.width > 0 && photo.height > 0, 'Rotated layout produced an empty image');
  assert(photo.width + 0.0001 >= frameWidth, 'Rotated layout left horizontal whitespace');
  assert(photo.height + 0.0001 >= frameHeight, 'Rotated layout left vertical whitespace');
};

const base = { uri: 'source', originalWidth: 4032, originalHeight: 3024, scale: 1, offsetX: 0, offsetY: 0 };

async function run() {
  assert(normalizeRotation(undefined) === 0, 'Legacy photo without rotation must default to 0');
  assert(normalizeRotation(5) === 1, 'Rotation must wrap modulo 4');
  assert(normalizeRotation(-1) === 3, 'Rotation must wrap negative modulo 4');
  assert(normalizeRotation(3.7) === 0, 'Rotation must round before wrapping');

  const legacy = normalizePhoto({ ...base });
  closeTo(legacy.rotation ?? 0, 0, 'normalizePhoto lost legacy rotation default');
  const explicit = normalizePhoto({ ...base, rotation: 3 });
  closeTo(explicit.rotation ?? 0, 3, 'normalizePhoto dropped explicit rotation');
  const wrapped = normalizePhoto({ ...base, rotation: 4 });
  closeTo(wrapped.rotation ?? 0, 0, 'normalizePhoto failed to wrap rotation 4');

  const portraitFrameWidth = 350;
  const portraitFrameHeight = 266;
  const unrotated = getComposedImageLayout(base, portraitFrameWidth, portraitFrameHeight);
  const once = getComposedImageLayout({ ...base, rotation: 1 }, portraitFrameWidth, portraitFrameHeight);
  const twice = getComposedImageLayout({ ...base, rotation: 2 }, portraitFrameWidth, portraitFrameHeight);
  const thrice = getComposedImageLayout({ ...base, rotation: 3 }, portraitFrameWidth, portraitFrameHeight);
  const four = getComposedImageLayout({ ...base, rotation: 4 }, portraitFrameWidth, portraitFrameHeight);
  frame(unrotated, portraitFrameWidth, portraitFrameHeight);
  frame(once, portraitFrameWidth, portraitFrameHeight);
  frame(twice, portraitFrameWidth, portraitFrameHeight);
  frame(thrice, portraitFrameWidth, portraitFrameHeight);
  closeTo(unrotated.width, four.width, 'Four rotations did not return to the original width');
  closeTo(unrotated.height, four.height, 'Four rotations did not return to the original height');
  assert(Math.abs(once.width - unrotated.width) > 0.0001 || Math.abs(once.height - unrotated.height) > 0.0001, '90° rotation did not change the composed footprint');
  closeTo(twice.width, unrotated.width, '180° rotation changed the composed width');
  closeTo(twice.height, unrotated.height, '180° rotation changed the composed height');

  const pannedRotated = getComposedImageLayout({ ...base, rotation: 1, scale: 2, offsetX: 1, offsetY: 1 }, portraitFrameWidth, portraitFrameHeight);
  frame(pannedRotated, portraitFrameWidth, portraitFrameHeight);
  closeTo(pannedRotated.left, 0, 'Rotated offsetX=+1 did not clamp to the frame edge');
  closeTo(pannedRotated.top, 0, 'Rotated offsetY=+1 did not clamp to the frame edge');
  const pannedNegative = getComposedImageLayout({ ...base, rotation: 1, scale: 2, offsetX: -1, offsetY: -1 }, portraitFrameWidth, portraitFrameHeight);
  closeTo(pannedNegative.left + pannedNegative.width, portraitFrameWidth, 'Rotated offsetX=-1 overflowed the frame edge');
  closeTo(pannedNegative.top + pannedNegative.height, portraitFrameHeight, 'Rotated offsetY=-1 overflowed the frame edge');

  const landscapeFrameWidth = 500;
  const landscapeFrameHeight = 280;
  frame(getComposedImageLayout({ ...base, rotation: 1 }, landscapeFrameWidth, landscapeFrameHeight), landscapeFrameWidth, landscapeFrameHeight);

  const gridLayout = getMealPhotoLayout(2, 350);
  gridLayout.frames.forEach((cell, index) => {
    const dimensions = index % 2 === 0
      ? { originalWidth: 4032, originalHeight: 3024, rotation: 1 }
      : { originalWidth: 3024, originalHeight: 4032, rotation: 3 };
    frame(getComposedImageLayout({ uri: `cell-${index}`, ...dimensions, scale: 1, offsetX: 0, offsetY: 0 }, cell.width, cell.height), cell.width, cell.height);
  });

  const databaseName = `${WEB_DATABASE_NAME}-test-rotation-${Date.now()}-${Math.random()}`;
  const first = createIndexedDbRepositories({
    databaseName,
    indexedDb: indexedDB,
    createPhotoId: () => 'rotation-photo',
    createObjectUrl: () => 'blob:rotation-display',
    revokeObjectUrl: () => undefined,
  });
  const storedPhoto = await first.photoRepository.persistBlob(new Blob(['rotation-photo'], { type: 'image/jpeg' }), {
    originalWidth: 4032,
    originalHeight: 3024,
  });
  const composedPhoto = { ...storedPhoto, rotation: 1, scale: 1.5, offsetX: 0.4, offsetY: -0.3 };
  const meal: Meal = {
    id: 'rotation-meal',
    createdAt: '2026-08-15T12:00:00.000Z',
    mealDate: '2026-08-15',
    mealTime: '20:00',
    mealType: '晚餐',
    photos: [composedPhoto],
    foodText: '旋转持久化验证',
    note: null,
  };
  await first.mealRepository.createMeal(meal);
  first.close();

  const reopened = createIndexedDbRepositories({
    databaseName,
    indexedDb: indexedDB,
    createPhotoId: () => 'rotation-photo',
    createObjectUrl: () => 'blob:rotation-display-reopened',
    revokeObjectUrl: () => undefined,
  });
  const persistedPhoto = (await reopened.mealRepository.listMeals())[0]?.photos[0];
  assert(persistedPhoto, 'Offline IndexedDB Meal/photo could not be reopened');
  closeTo(normalizePhoto(persistedPhoto).rotation ?? 0, 1, 'Rotation was not persisted');
  closeTo(persistedPhoto.scale, 1.5, 'Rotation persistence disturbed scale');
  closeTo(persistedPhoto.offsetX, 0.4, 'Rotation persistence disturbed offsetX');
  closeTo(persistedPhoto.offsetY, -0.3, 'Rotation persistence disturbed offsetY');
  const legacyStored = normalizePhoto({ ...persistedPhoto, rotation: undefined });
  closeTo(legacyStored.rotation ?? 0, 0, 'Legacy stored photo without rotation defaulted incorrectly');
  reopened.close();

  const backupSource = createIndexedDbRepositories({
    databaseName,
    indexedDb: indexedDB,
    createPhotoId: () => 'rotation-photo',
    createObjectUrl: () => 'blob:rotation-display',
    revokeObjectUrl: () => undefined,
  });
  const backupPlan = await planBackup(backupSource.backupSource);
  const part = await createBackupPart(backupSource.backupSource, backupPlan, 0);
  const file = new File([part.blob], part.filename, { type: 'application/zip' });
  const valid = await validateRestore([file]);
  assert(valid.length === 1, 'Rotation backup did not prevalidate');
  const restored = createIndexedDbRepositories({
    databaseName: `${databaseName}-restored`,
    indexedDb: indexedDB,
    createPhotoId: () => 'rotation-photo',
    createObjectUrl: () => 'blob:rotation-display-restored',
    revokeObjectUrl: () => undefined,
  });
  const result = await restoreValidatedParts(restored.backupSource, valid);
  assert(result.added === 1, 'Rotation backup restore did not add the Meal');
  const restoredMeals = await restored.backupSource.listStoredMeals();
  const restoredPhoto = (restoredMeals[0] as StoredWebMeal).photos[0];
  closeTo(normalizePhoto(restoredPhoto).rotation ?? 0, 1, 'Rotation was lost through backup/restore');
  closeTo(normalizePhoto(restoredPhoto).scale, 1.5, 'Backup/restore disturbed scale');
  closeTo(normalizePhoto(restoredPhoto).offsetX, 0.4, 'Backup/restore disturbed offsetX');
  closeTo(normalizePhoto(restoredPhoto).offsetY, -0.3, 'Backup/restore disturbed offsetY');
  restored.close();
  backupSource.close();

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(`${databaseName}-restored`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

run().catch((error) => { throw error; });
