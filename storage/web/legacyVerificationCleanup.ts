import type { StoredWebMeal, StoredWebPhoto } from './indexedDbRepositories';

export const LEGACY_VERIFICATION_MEAL_ID = 'phase-3-browser-meal';
export const LEGACY_VERIFICATION_PHOTO_ID = 'phase-3-browser-fixture';
export const LEGACY_VERIFICATION_FOOD_TEXT = 'IndexedDB 持久化验证餐次';

export type LegacyVerificationCleanupReport = {
  mealsDeleted: number;
  photosDeleted: number;
};

const verificationToken = /^Phase 3 token (?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{10,}-[a-z0-9]+)$/i;

export function isKnownLegacyVerificationMeal(value: unknown): value is StoredWebMeal {
  if (!value || typeof value !== 'object') return false;
  const meal = value as Partial<StoredWebMeal>;
  return meal.id === LEGACY_VERIFICATION_MEAL_ID
    && meal.foodText === LEGACY_VERIFICATION_FOOD_TEXT
    && meal.mealTime === '12:34'
    && meal.mealType === '午餐'
    && typeof meal.note === 'string'
    && verificationToken.test(meal.note)
    && Array.isArray(meal.photos)
    && meal.photos.length === 1
    && meal.photos[0]?.photoId === LEGACY_VERIFICATION_PHOTO_ID;
}

export function scheduleLegacyVerificationCleanup(
  transaction: IDBTransaction,
  report: LegacyVerificationCleanupReport,
) {
  const meals = transaction.objectStore('meals');
  const photos = transaction.objectStore('photos');
  const candidateRequest = meals.get(LEGACY_VERIFICATION_MEAL_ID);
  candidateRequest.onsuccess = () => {
    if (!isKnownLegacyVerificationMeal(candidateRequest.result)) return;
    const deleteMealRequest = meals.delete(LEGACY_VERIFICATION_MEAL_ID);
    deleteMealRequest.onsuccess = () => {
      report.mealsDeleted = 1;
      const remainingMealsRequest = meals.getAll();
      remainingMealsRequest.onsuccess = () => {
        const remainingMeals = remainingMealsRequest.result as StoredWebMeal[];
        const stillReferenced = remainingMeals.some((meal) => Array.isArray(meal.photos)
          && meal.photos.some((photo) => photo.photoId === LEGACY_VERIFICATION_PHOTO_ID));
        if (stillReferenced) return;
        const photoRequest = photos.get(LEGACY_VERIFICATION_PHOTO_ID);
        photoRequest.onsuccess = () => {
          const photo = photoRequest.result as StoredWebPhoto | undefined;
          if (!photo || photo.photoId !== LEGACY_VERIFICATION_PHOTO_ID) return;
          const deletePhotoRequest = photos.delete(LEGACY_VERIFICATION_PHOTO_ID);
          deletePhotoRequest.onsuccess = () => { report.photosDeleted = 1; };
        };
      };
    };
  };
}
