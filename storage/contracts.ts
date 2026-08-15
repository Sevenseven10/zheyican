import type { Meal, PhotoComposition } from '../domain/meal';

export type TemporaryPhoto = { uri: string; width?: number; height?: number };

export interface MealRepository {
  initialize(): Promise<void>;
  listMeals(): Promise<Meal[]>;
  createMeal(meal: Meal): Promise<void>;
  updateMeal(meal: Meal): Promise<void>;
  deleteMeal(id: string): Promise<void>;
}

export interface PhotoRepository {
  ensurePhotoDirectory(): Promise<void>;
  persistPhoto(photo: TemporaryPhoto): Promise<PhotoComposition>;
  persistBlob?(blob: Blob, metadata: { originalWidth: number; originalHeight: number; mimeType?: string; photoId?: string }): Promise<PhotoComposition>;
  deletePhoto(uri: string): Promise<void>;
  /** Web storage resolves stable IndexedDB photo references only when an image is rendered. */
  resolvePhoto?(uri: string): Promise<string | null>;
  /** Snapshot candidates before the first interactive screen, then sweep them at idle time. */
  getStartupOrphanCandidatePhotoIds?(): Promise<string[]>;
  cleanupOrphans?(candidatePhotoIds: string[]): Promise<number>;
}
