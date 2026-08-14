import type { Meal } from '../domain/meal';
import type { MealRepository, PhotoRepository } from './contracts';

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const emptyPhoto = { uri: '', originalWidth: 0, originalHeight: 0, scale: 1, offsetX: 0, offsetY: 0 };

function createDevelopmentMeals(): Meal[] {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  return [
    {
      id: 'web-development-today',
      createdAt: now.toISOString(),
      mealDate: dateKey(now),
      mealTime: '12:30',
      mealType: '午餐',
      photos: [{ ...emptyPhoto }],
      foodText: 'Web 界面预览餐次',
      note: '仅保留在本次浏览器会话中',
    },
    {
      id: 'web-development-history',
      createdAt: previous.toISOString(),
      mealDate: dateKey(previous),
      mealTime: '19:10',
      mealType: '晚餐',
      photos: [{ ...emptyPhoto }],
      foodText: '历史页面预览餐次',
      note: null,
    },
  ];
}

let meals = createDevelopmentMeals();

export const mealRepository: MealRepository = {
  async initialize() {},
  async listMeals() { return meals.map((meal) => ({ ...meal, photos: meal.photos.map((photo) => ({ ...photo })) })); },
  async createMeal(meal) { meals = [...meals, meal]; },
  async updateMeal(meal) { meals = meals.map((current) => current.id === meal.id ? meal : current); },
};

const unavailable = async (): Promise<never> => { throw new Error('Web photo persistence is not available in Phase 2.'); };

export const photoRepository: PhotoRepository = {
  ensurePhotoDirectory: unavailable,
  persistPhoto: unavailable,
  deletePhoto: unavailable,
};
