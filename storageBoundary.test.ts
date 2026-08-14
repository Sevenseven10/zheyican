import type { Meal } from './domain/meal';
import type { MealRepository, PhotoRepository } from './storage/contracts';
import {
  CREATE_MEAL_SQL,
  createNativeMealRepository,
  INITIALIZE_MEALS_SQL,
  LIST_MEALS_SQL,
  UPDATE_MEAL_SQL,
} from './storage/native/mealRepository';
import { createNativePhotoRepository, PHOTO_DIRECTORY_NAME } from './storage/native/photoRepository';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const legacyPhoto = {
  uri: 'file:///documents/meal-photos/1723456789000-abcd1234.jpg',
  originalWidth: 3024,
  originalHeight: 4032,
  scale: 1.75,
  offsetX: -0.25,
  offsetY: 0.4,
};

const meal: Meal = {
  id: '1723456789000-meal123',
  createdAt: '2026-08-12T10:20:30.000Z',
  mealDate: '2026-08-12',
  mealTime: '18:20',
  mealType: '晚餐',
  photos: [legacyPhoto],
  foodText: '番茄鸡蛋面',
  note: null,
};

async function runStorageBoundaryTests() {
  const databaseCalls: Array<{ method: string; source: string; params?: unknown[] }> = [];
  const database = {
    async execAsync(source: string) { databaseCalls.push({ method: 'exec', source }); },
    async getAllAsync<T>(source: string) {
      databaseCalls.push({ method: 'list', source });
      return [{ ...meal, photos: JSON.stringify(meal.photos) }] as T[];
    },
    async runAsync(source: string, ...params: unknown[]) {
      databaseCalls.push({ method: 'run', source, params });
      return {};
    },
  };
  const mealRepository: MealRepository = createNativeMealRepository(Promise.resolve(database));
  await mealRepository.initialize();
  const loaded = await mealRepository.listMeals();
  await mealRepository.createMeal(meal);
  await mealRepository.updateMeal(meal);

  assert(databaseCalls[0].source === INITIALIZE_MEALS_SQL, 'SQLite schema or initialization SQL changed');
  assert(databaseCalls[1].source === LIST_MEALS_SQL, 'Meal SELECT changed');
  assert(databaseCalls[2].source === CREATE_MEAL_SQL, 'Meal INSERT changed');
  assert(databaseCalls[3].source === UPDATE_MEAL_SQL, 'Meal UPDATE changed');
  assert(JSON.stringify(loaded[0]) === JSON.stringify(meal), 'Legacy Meal or photos JSON did not load unchanged');
  assert(JSON.stringify(databaseCalls[2].params) === JSON.stringify([
    meal.id, meal.createdAt, meal.mealDate, meal.mealTime, meal.mealType,
    JSON.stringify(meal.photos), meal.foodText, meal.note,
  ]), 'Meal INSERT serialization or parameter order changed');
  assert(JSON.stringify(databaseCalls[3].params) === JSON.stringify([
    meal.mealType, JSON.stringify(meal.photos), meal.foodText, meal.note, meal.id,
  ]), 'Meal UPDATE fields, serialization, or ID behavior changed');

  const fileCalls: Array<{ method: string; uri?: string; options?: unknown }> = [];
  const fileSystem = {
    documentDirectory: 'file:///documents/',
    async makeDirectoryAsync(uri: string, options: { intermediates: boolean }) { fileCalls.push({ method: 'mkdir', uri, options }); },
    async copyAsync(options: { from: string; to: string }) { fileCalls.push({ method: 'copy', options }); },
    async deleteAsync(uri: string, options: { idempotent: boolean }) { fileCalls.push({ method: 'delete', uri, options }); },
  };
  const photoRepository: PhotoRepository = createNativePhotoRepository(fileSystem, () => 1723456789000, () => 0.123456789);
  await photoRepository.ensurePhotoDirectory();
  const stored = await photoRepository.persistPhoto({ uri: 'file:///picker/source.heic?selection=1', width: 3024, height: 4032 });
  await photoRepository.deletePhoto(stored.uri);

  const expectedRoot = `file:///documents/${PHOTO_DIRECTORY_NAME}`;
  const expectedTarget = `${expectedRoot}1723456789000-${(0.123456789).toString(36).slice(2)}.heic`;
  assert(fileCalls[0].uri === expectedRoot && JSON.stringify(fileCalls[0].options) === JSON.stringify({ intermediates: true }), 'Photo directory path or creation options changed');
  assert(JSON.stringify(fileCalls[1].options) === JSON.stringify({ from: 'file:///picker/source.heic?selection=1', to: expectedTarget }), 'Photo copy path or filename rule changed');
  assert(stored.uri === expectedTarget, 'Persisted photo URI changed');
  assert(stored.originalWidth === 3024 && stored.originalHeight === 4032 && stored.scale === 1 && stored.offsetX === 0 && stored.offsetY === 0, 'Persisted PhotoComposition format changed');
  assert(fileCalls[2].uri === expectedTarget && JSON.stringify(fileCalls[2].options) === JSON.stringify({ idempotent: true }), 'Photo deletion behavior changed');
}

runStorageBoundaryTests().catch((error) => { throw error; });
