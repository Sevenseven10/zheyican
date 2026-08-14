import type { Meal, PhotoComposition } from '../../domain/meal';
import { normalizePhoto } from '../../photoLayout';
import type { MealRepository, PhotoRepository, TemporaryPhoto } from '../contracts';
import { scheduleLegacyVerificationCleanup } from './legacyVerificationCleanup';
import type { LegacyVerificationCleanupReport } from './legacyVerificationCleanup';

export const WEB_DATABASE_NAME = 'zheyican-web-storage';
export const WEB_DATABASE_VERSION = 2;
export const WEB_VERIFICATION_DATABASE_PREFIX = `${WEB_DATABASE_NAME}-verification-`;
export const MEALS_STORE_NAME = 'meals';
export const PHOTOS_STORE_NAME = 'photos';
export const WEB_PHOTO_REFERENCE_PREFIX = 'zheyican-photo:';

export type StoredWebPhoto = {
  photoId: string;
  blob: Blob;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  size: number;
  createdAt: string;
};

export type StoredWebPhotoComposition = Omit<PhotoComposition, 'uri'> & {
  photoId: string;
};

export type StoredWebMeal = Omit<Meal, 'photos'> & {
  photos: StoredWebPhotoComposition[];
};

export type WebStorageErrorCode =
  | 'OPEN_FAILED'
  | 'UPGRADE_BLOCKED'
  | 'TRANSACTION_FAILED'
  | 'QUOTA_EXCEEDED'
  | 'PHOTO_NOT_FOUND'
  | 'PHOTO_READ_FAILED';

export class WebStorageError extends Error {
  constructor(
    public readonly code: WebStorageErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WebStorageError';
  }
}

type Operation = 'photo-put' | 'meal-create' | 'meal-update';

export type IndexedDbRepositoryOptions = {
  databaseName?: string;
  indexedDb?: IDBFactory;
  fetchBlob?: (uri: string) => Promise<Blob>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  createPhotoId?: () => string;
  now?: () => Date;
  /** Test-only failure injection. It is never configured by the application. */
  beforeCommit?: (operation: Operation) => void;
};

export type WebPhotoRepository = PhotoRepository & {
  persistBlob(blob: Blob, metadata: { originalWidth: number; originalHeight: number; mimeType?: string; photoId?: string }): Promise<PhotoComposition>;
  get(photoId: string): Promise<StoredWebPhoto | null>;
  cleanupOrphans(candidatePhotoIds: string[]): Promise<number>;
  revokeAllObjectUrls(): void;
};

export type IndexedDbRepositories = {
  mealRepository: MealRepository;
  photoRepository: WebPhotoRepository;
  legacyCleanupReport: LegacyVerificationCleanupReport;
  close(): void;
};

export function resolveRuntimeWebDatabaseName(configuredName?: string) {
  if (!configuredName) return WEB_DATABASE_NAME;
  if (!configuredName.startsWith(WEB_VERIFICATION_DATABASE_PREFIX) || configuredName === WEB_VERIFICATION_DATABASE_PREFIX) {
    throw new Error(`Browser verification databases must use the ${WEB_VERIFICATION_DATABASE_PREFIX}* prefix.`);
  }
  return configuredName;
}

const stablePhotoId = (uri: string) => uri.startsWith(WEB_PHOTO_REFERENCE_PREFIX)
  ? uri.slice(WEB_PHOTO_REFERENCE_PREFIX.length)
  : null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => { /* onabort provides the final transaction error. */ };
  });
}

function storageError(error: unknown, fallback: WebStorageErrorCode = 'TRANSACTION_FAILED'): WebStorageError {
  if (error instanceof WebStorageError) return error;
  const name = error instanceof DOMException ? error.name : (error as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') {
    return new WebStorageError('QUOTA_EXCEEDED', '浏览器存储空间不足，请释放空间后重试。', error);
  }
  return new WebStorageError(fallback, '本地数据暂时无法写入，请重试。', error);
}

async function runTransaction<T>(
  database: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const transaction = database.transaction(stores, mode);
  const completion = transactionCompletion(transaction);
  try {
    const result = await operation(transaction);
    await completion;
    return result;
  } catch (error) {
    try { transaction.abort(); } catch { /* The browser may already have aborted it. */ }
    try { await completion; } catch { /* Preserve the more useful operation error. */ }
    throw storageError(error);
  }
}

function defaultPhotoId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createIndexedDbRepositories(options: IndexedDbRepositoryOptions = {}): IndexedDbRepositories {
  const indexedDb = options.indexedDb ?? globalThis.indexedDB;
  const databaseName = options.databaseName ?? WEB_DATABASE_NAME;
  const fetchBlob = options.fetchBlob ?? (async (uri: string) => {
    const response = await fetch(uri);
    if (!response.ok) throw new WebStorageError('PHOTO_READ_FAILED', '无法读取待保存的照片。');
    return response.blob();
  });
  const createObjectUrl = options.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = options.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const createPhotoId = options.createPhotoId ?? defaultPhotoId;
  const now = options.now ?? (() => new Date());
  const legacyCleanupReport: LegacyVerificationCleanupReport = { mealsDeleted: 0, photosDeleted: 0 };

  let databasePromise: Promise<IDBDatabase> | null = null;
  const objectUrlsByPhotoId = new Map<string, string>();
  const photoIdsByObjectUrl = new Map<string, string>();

  const revokePhotoUrl = (photoId: string) => {
    const current = objectUrlsByPhotoId.get(photoId);
    if (!current) return;
    revokeObjectUrl(current);
    objectUrlsByPhotoId.delete(photoId);
    photoIdsByObjectUrl.delete(current);
  };

  const revokeAllObjectUrls = () => {
    Array.from(objectUrlsByPhotoId.keys()).forEach(revokePhotoUrl);
  };

  const displayUrl = (photo: StoredWebPhoto) => {
    const existing = objectUrlsByPhotoId.get(photo.photoId);
    if (existing) return existing;
    const url = createObjectUrl(photo.blob);
    objectUrlsByPhotoId.set(photo.photoId, url);
    photoIdsByObjectUrl.set(url, photo.photoId);
    return url;
  };

  const photoIdFromUri = (uri: string) => stablePhotoId(uri) ?? photoIdsByObjectUrl.get(uri) ?? null;

  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDb.open(databaseName, WEB_DATABASE_VERSION);
      } catch (error) {
        reject(storageError(error, 'OPEN_FAILED'));
        return;
      }
      request.onupgradeneeded = (event) => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MEALS_STORE_NAME)) {
          database.createObjectStore(MEALS_STORE_NAME, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(PHOTOS_STORE_NAME)) {
          database.createObjectStore(PHOTOS_STORE_NAME, { keyPath: 'photoId' });
        }
        if (event.oldVersion === 1 && request.transaction) {
          scheduleLegacyVerificationCleanup(request.transaction, legacyCleanupReport);
        }
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(new WebStorageError('UPGRADE_BLOCKED', '请关闭其他已打开的「这一餐」页面后重试。'));
      };
      request.onerror = () => {
        databasePromise = null;
        reject(storageError(request.error, 'OPEN_FAILED'));
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
    });
    return databasePromise;
  };

  const getStoredPhoto = async (photoId: string) => {
    const database = await openDatabase();
    return runTransaction(database, [PHOTOS_STORE_NAME], 'readonly', async (transaction) => {
      const result = await requestResult(transaction.objectStore(PHOTOS_STORE_NAME).get(photoId));
      return (result as StoredWebPhoto | undefined) ?? null;
    });
  };

  const materializePhoto = async (photo: StoredWebPhotoComposition): Promise<PhotoComposition> => {
    const stored = await getStoredPhoto(photo.photoId);
    if (!stored) throw new WebStorageError('PHOTO_NOT_FOUND', '用餐记录引用的照片不存在。');
    const { photoId: _photoId, ...composition } = photo;
    return { ...composition, uri: displayUrl(stored) };
  };

  const persistableMeal = (meal: Meal): StoredWebMeal => ({
    ...meal,
    photos: meal.photos.map((photo) => {
      const photoId = photoIdFromUri(photo.uri);
      if (!photoId) throw new WebStorageError('PHOTO_NOT_FOUND', '照片尚未保存，无法保存这一餐。');
      const { uri: _uri, ...composition } = photo;
      return { ...composition, photoId };
    }),
  });

  const validatePhotoReferences = async (transaction: IDBTransaction, meal: StoredWebMeal) => {
    const photoStore = transaction.objectStore(PHOTOS_STORE_NAME);
    await Promise.all(meal.photos.map(async (photo) => {
      if (!await requestResult(photoStore.get(photo.photoId))) {
        throw new WebStorageError('PHOTO_NOT_FOUND', '照片尚未保存，无法保存这一餐。');
      }
    }));
  };

  const writeMeal = async (meal: Meal, operation: 'meal-create' | 'meal-update') => {
    const storedMeal = persistableMeal(meal);
    const database = await openDatabase();
    await runTransaction(database, [MEALS_STORE_NAME, PHOTOS_STORE_NAME], 'readwrite', async (transaction) => {
      await validatePhotoReferences(transaction, storedMeal);
      options.beforeCommit?.(operation);
      await requestResult(transaction.objectStore(MEALS_STORE_NAME).put(storedMeal));
    });
  };

  const photoRepository: WebPhotoRepository = {
    async ensurePhotoDirectory() { await openDatabase(); },
    async persistPhoto(photo: TemporaryPhoto) {
      let blob: Blob;
      try { blob = await fetchBlob(photo.uri); } catch (error) {
        throw error instanceof WebStorageError ? error : new WebStorageError('PHOTO_READ_FAILED', '无法读取待保存的照片。', error);
      }
      return this.persistBlob(blob, { originalWidth: photo.width ?? 0, originalHeight: photo.height ?? 0 });
    },
    async persistBlob(blob, metadata) {
      const photoId = metadata.photoId ?? createPhotoId();
      const stored: StoredWebPhoto = {
        photoId,
        blob,
        mimeType: metadata.mimeType || blob.type || 'application/octet-stream',
        originalWidth: metadata.originalWidth,
        originalHeight: metadata.originalHeight,
        size: blob.size,
        createdAt: now().toISOString(),
      };
      const database = await openDatabase();
      await runTransaction(database, [PHOTOS_STORE_NAME], 'readwrite', async (transaction) => {
        options.beforeCommit?.('photo-put');
        await requestResult(transaction.objectStore(PHOTOS_STORE_NAME).put(stored));
      });
      revokePhotoUrl(photoId);
      return normalizePhoto({
        uri: displayUrl(stored),
        originalWidth: stored.originalWidth,
        originalHeight: stored.originalHeight,
      });
    },
    async get(photoId) { return getStoredPhoto(photoId); },
    async deletePhoto(uri) {
      const photoId = photoIdFromUri(uri);
      if (!photoId) return;
      const database = await openDatabase();
      await runTransaction(database, [PHOTOS_STORE_NAME], 'readwrite', async (transaction) => {
        await requestResult(transaction.objectStore(PHOTOS_STORE_NAME).delete(photoId));
      });
      revokePhotoUrl(photoId);
    },
    async cleanupOrphans(candidatePhotoIds) {
      if (candidatePhotoIds.length === 0) return 0;
      const database = await openDatabase();
      const deleted = await runTransaction(database, [MEALS_STORE_NAME, PHOTOS_STORE_NAME], 'readwrite', async (transaction) => {
        const meals = await requestResult(transaction.objectStore(MEALS_STORE_NAME).getAll()) as StoredWebMeal[];
        const referenced = new Set(meals.flatMap((meal) => meal.photos.map((photo) => photo.photoId)));
        const orphanIds = Array.from(new Set(candidatePhotoIds)).filter((photoId) => !referenced.has(photoId));
        await Promise.all(orphanIds.map((photoId) => requestResult(transaction.objectStore(PHOTOS_STORE_NAME).delete(photoId))));
        return orphanIds;
      });
      deleted.forEach(revokePhotoUrl);
      return deleted.length;
    },
    revokeAllObjectUrls,
  };

  const mealRepository: MealRepository = {
    async initialize() { await openDatabase(); },
    async listMeals() {
      const database = await openDatabase();
      const stored = await runTransaction(database, [MEALS_STORE_NAME], 'readonly', async (transaction) => (
        requestResult(transaction.objectStore(MEALS_STORE_NAME).getAll()) as Promise<StoredWebMeal[]>
      ));
      stored.sort((left, right) => right.mealDate.localeCompare(left.mealDate) || right.mealTime.localeCompare(left.mealTime));
      return Promise.all(stored.map(async (meal) => ({
        ...meal,
        photos: await Promise.all(meal.photos.map(materializePhoto)),
      })));
    },
    async createMeal(meal) { await writeMeal(meal, 'meal-create'); },
    async updateMeal(meal) { await writeMeal(meal, 'meal-update'); },
  };

  const close = () => {
    revokeAllObjectUrls();
    if (databasePromise) void databasePromise.then((database) => database.close()).catch(() => {});
    databasePromise = null;
  };

  return { mealRepository, photoRepository, legacyCleanupReport, close };
}
