import { indexedDB } from 'fake-indexeddb';
import type { Meal } from './domain/meal';
import { getComposedImageLayout, getMealPhotoLayout } from './photoLayout';
import { applyWebPhotoDrag, applyWebPhotoPinch } from './platform/web/photoGesture';
import { createIndexedDbRepositories, WEB_DATABASE_NAME } from './storage/web/indexedDbRepositories';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const closeTo = (actual: number, expected: number, message: string) => {
  assert(Math.abs(actual - expected) < 0.0001, `${message}: expected ${expected}, received ${actual}`);
};

async function deleteTestDatabase(databaseName: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function runPhotoGestureTests() {
  const start = { scale: 1.5, offsetX: 0.1, offsetY: -0.2 };
  const unchangedPinch = applyWebPhotoPinch(start, 100, 100);
  closeTo(unchangedPinch.scale, 1.5, 'Pinch jumped at gesture start');
  const zoomed = applyWebPhotoPinch(start, 100, 200);
  closeTo(zoomed.scale, 3, 'Pinch did not preserve the native scale ratio');
  closeTo(applyWebPhotoPinch(start, 100, 1000).scale, 4, 'Pinch upper boundary changed');
  closeTo(applyWebPhotoPinch(start, 100, 1).scale, 1, 'Pinch lower boundary changed');

  const dragged = applyWebPhotoDrag(start, 50, -100, 200, 400);
  closeTo(dragged.offsetX, 0.6, 'Horizontal drag semantics changed');
  closeTo(dragged.offsetY, -0.7, 'Vertical drag semantics changed');
  const boundedDrag = applyWebPhotoDrag(start, 10000, -10000, 200, 400);
  closeTo(boundedDrag.offsetX, 1, 'Horizontal drag boundary changed');
  closeTo(boundedDrag.offsetY, -1, 'Vertical drag boundary changed');

  const expectedHeights = [266, 203, 252, 274.1, 252, 199.93333333333334];
  for (let count = 1; count <= 6; count += 1) {
    const layout = getMealPhotoLayout(count, 350);
    assert(layout.frames.length === count, `${count}-photo template frame count changed`);
    closeTo(layout.height, expectedHeights[count - 1], `${count}-photo template height changed`);
    layout.frames.forEach((frame) => {
      assert(frame.width > 0 && frame.height > 0, `${count}-photo template contains an empty frame`);
      assert(frame.left >= 0 && frame.top >= 0, `${count}-photo template frame escaped its origin`);
      assert(frame.left + frame.width <= 350.0001, `${count}-photo template frame escaped container width`);
      assert(frame.top + frame.height <= layout.height + 0.0001, `${count}-photo template frame escaped container height`);
    });
  }

  const sources = [
    { width: 4032, height: 3024 },
    { width: 3024, height: 4032 },
    { width: 8000, height: 500 },
    { width: 500, height: 8000 },
  ];
  sources.forEach(({ width, height }, index) => {
    const composed = getComposedImageLayout({
      uri: `source-${index}`,
      originalWidth: width,
      originalHeight: height,
      scale: 2,
      offsetX: 0.5,
      offsetY: -0.5,
    }, 350, 266);
    assert(Object.values(composed).every(Number.isFinite), 'Mixed/extreme photo composition produced a non-finite layout');
    assert(composed.width > 0 && composed.height > 0, 'Mixed/extreme photo composition produced an empty image');
  });

  for (let count = 1; count <= 6; count += 1) {
    const layout = getMealPhotoLayout(count, 350);
    layout.frames.forEach((frame, index) => {
      const dimensions = index % 2 === 0
        ? { originalWidth: 4032, originalHeight: 3024 }
        : { originalWidth: 3024, originalHeight: 4032 };
      const composed = getComposedImageLayout({
        uri: `mobile-${count}-${index}`,
        ...dimensions,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      }, frame.width, frame.height);
      assert(composed.width + 0.0001 >= frame.width, `${count}-photo mobile cover left horizontal whitespace`);
      assert(composed.height + 0.0001 >= frame.height, `${count}-photo mobile cover left vertical whitespace`);
    });
  }

  const databaseName = `${WEB_DATABASE_NAME}-test-gesture-${Date.now()}-${Math.random()}`;
  const first = createIndexedDbRepositories({
    databaseName,
    indexedDb: indexedDB,
    createPhotoId: () => 'gesture-photo',
    createObjectUrl: () => 'blob:gesture-display',
    revokeObjectUrl: () => undefined,
  });
  const storedPhoto = await first.photoRepository.persistBlob(new Blob(['gesture-photo'], { type: 'image/jpeg' }), {
    originalWidth: 4032,
    originalHeight: 3024,
  });
  const composedPhoto = { ...storedPhoto, scale: zoomed.scale, offsetX: dragged.offsetX, offsetY: dragged.offsetY };
  const meal: Meal = {
    id: 'gesture-meal',
    createdAt: '2026-08-14T12:00:00.000Z',
    mealDate: '2026-08-14',
    mealTime: '20:00',
    mealType: '晚餐',
    photos: [composedPhoto],
    foodText: '手势持久化验证',
    note: null,
  };
  await first.mealRepository.createMeal(meal);
  first.close();

  const reopened = createIndexedDbRepositories({
    databaseName,
    indexedDb: indexedDB,
    createObjectUrl: () => 'blob:gesture-display-reopened',
    revokeObjectUrl: () => undefined,
  });
  const persistedPhoto = (await reopened.mealRepository.listMeals())[0]?.photos[0];
  assert(persistedPhoto, 'Offline IndexedDB Meal/photo could not be reopened');
  closeTo(persistedPhoto.scale, 3, 'Gesture scale was not persisted');
  closeTo(persistedPhoto.offsetX, 0.6, 'Gesture offsetX was not persisted');
  closeTo(persistedPhoto.offsetY, -0.7, 'Gesture offsetY was not persisted');
  assert(persistedPhoto.uri === 'blob:gesture-display-reopened', 'Offline photo Blob was not materialized after reopen');
  reopened.close();
  await deleteTestDatabase(databaseName);
}

runPhotoGestureTests().catch((error) => { throw error; });
