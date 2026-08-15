import type { Meal } from '../../domain/meal';
import { parseStoredPhotos } from '../../photoLayout';
import type { MealRepository } from '../contracts';

type StoredMeal = Omit<Meal, 'photos'> & { photos: string };
type Database = {
  execAsync(source: string): Promise<void>;
  getAllAsync<T>(source: string): Promise<T[]>;
  runAsync(source: string, ...params: unknown[]): Promise<unknown>;
};

export const MEALS_DATABASE_NAME = 'meals.db';
export const INITIALIZE_MEALS_SQL = 'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS meals (id TEXT PRIMARY KEY NOT NULL, createdAt TEXT NOT NULL, mealDate TEXT NOT NULL, mealTime TEXT NOT NULL, mealType TEXT NOT NULL, photos TEXT NOT NULL, foodText TEXT NOT NULL, note TEXT);';
export const LIST_MEALS_SQL = 'SELECT * FROM meals ORDER BY mealDate DESC, mealTime DESC';
export const CREATE_MEAL_SQL = 'INSERT INTO meals (id, createdAt, mealDate, mealTime, mealType, photos, foodText, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
export const UPDATE_MEAL_SQL = 'UPDATE meals SET mealType = ?, photos = ?, foodText = ?, note = ? WHERE id = ?';
export const DELETE_MEAL_SQL = 'DELETE FROM meals WHERE id = ?';

export function createNativeMealRepository(databasePromise: Promise<Database>): MealRepository {
  return {
    async initialize() {
      const db = await databasePromise;
      await db.execAsync(INITIALIZE_MEALS_SQL);
    },
    async listMeals() {
      const db = await databasePromise;
      const rows = await db.getAllAsync<StoredMeal>(LIST_MEALS_SQL);
      return rows.map((row) => ({ ...row, photos: parseStoredPhotos(row.photos) }));
    },
    async createMeal(meal) {
      const db = await databasePromise;
      await db.runAsync(CREATE_MEAL_SQL, meal.id, meal.createdAt, meal.mealDate, meal.mealTime, meal.mealType, JSON.stringify(meal.photos), meal.foodText, meal.note);
    },
    async updateMeal(meal) {
      const db = await databasePromise;
      await db.runAsync(
        UPDATE_MEAL_SQL,
        meal.mealType,
        JSON.stringify(meal.photos),
        meal.foodText,
        meal.note,
        meal.id,
      );
    },
    async deleteMeal(id) {
      const db = await databasePromise;
      await db.runAsync(DELETE_MEAL_SQL, id);
    },
  };
}
