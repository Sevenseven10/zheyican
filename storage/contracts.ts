import type { Meal, PhotoComposition } from '../domain/meal';

export type TemporaryPhoto = { uri: string; width?: number; height?: number };

export interface MealRepository {
  initialize(): Promise<void>;
  listMeals(): Promise<Meal[]>;
  createMeal(meal: Meal): Promise<void>;
  updateMeal(meal: Meal): Promise<void>;
}

export interface PhotoRepository {
  ensurePhotoDirectory(): Promise<void>;
  persistPhoto(photo: TemporaryPhoto): Promise<PhotoComposition>;
  deletePhoto(uri: string): Promise<void>;
}
