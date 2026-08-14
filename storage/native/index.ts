import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { createNativeMealRepository, MEALS_DATABASE_NAME } from './mealRepository';
import { createNativePhotoRepository } from './photoRepository';

const dbPromise = SQLite.openDatabaseAsync(MEALS_DATABASE_NAME);

export const mealRepository = createNativeMealRepository(dbPromise);
export const photoRepository = createNativePhotoRepository(FileSystem);
