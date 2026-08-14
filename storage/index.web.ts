import type { Meal } from '../domain/meal';
import { createIndexedDbRepositories } from './web/indexedDbRepositories';

const repositories = createIndexedDbRepositories();

export const photoRepository = repositories.photoRepository;

const pageLifecycle = globalThis as typeof globalThis & {
  addEventListener?: (type: string, listener: (event: PageTransitionEvent) => void) => void;
};
pageLifecycle.addEventListener?.('pagehide', (event) => {
  if (!event.persisted) repositories.close();
});

async function seedPersistenceFixture() {
  const now = new Date();
  const verificationToken = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${now.getTime()}-${Math.random().toString(36).slice(2)}`;
  const pad = (value: number) => String(value).padStart(2, '0');
  const mealDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const photo = await photoRepository.persistBlob(
    new Blob([
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#b94f38"/><circle cx="600" cy="450" r="210" fill="#f3f2ed"/></svg>',
    ], { type: 'image/svg+xml' }),
    { photoId: 'phase-3-browser-fixture', originalWidth: 1200, originalHeight: 900 },
  );
  const meal: Meal = {
    id: 'phase-3-browser-meal',
    createdAt: now.toISOString(),
    mealDate,
    mealTime: '12:34',
    mealType: '午餐',
    photos: [photo],
    foodText: 'IndexedDB 持久化验证餐次',
    note: `Phase 3 token ${verificationToken}`,
  };
  await mealRepository.createMeal(meal);
  return meal.id;
}

const shouldSeedBrowserFixture = () => typeof __DEV__ !== 'undefined' && __DEV__;

export const mealRepository = {
  async initialize() {
    await repositories.mealRepository.initialize();
    if (shouldSeedBrowserFixture()) {
      const meals = await repositories.mealRepository.listMeals();
      if (!meals.some((meal) => meal.id === 'phase-3-browser-meal')) await seedPersistenceFixture();
    }
  },
  listMeals: () => repositories.mealRepository.listMeals(),
  createMeal: (meal: Meal) => repositories.mealRepository.createMeal(meal),
  updateMeal: (meal: Meal) => repositories.mealRepository.updateMeal(meal),
};

declare global {
  var __ZHEYICAN_STORAGE_TEST__: undefined | {
    seedPersistenceFixture(): Promise<string>;
    listMeals(): Promise<Meal[]>;
  };
}

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  globalThis.__ZHEYICAN_STORAGE_TEST__ = {
    seedPersistenceFixture,
    listMeals: () => mealRepository.listMeals(),
  };
}
