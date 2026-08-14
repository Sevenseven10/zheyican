export type PersistentStorageResult = 'already-persistent' | 'granted' | 'denied' | 'unsupported' | 'error';
export type ServiceWorkerResult = 'registered' | 'development' | 'unsupported' | 'error';

type StorageManagerLike = {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
};

type ServiceWorkerContainerLike = {
  register: (scriptURL: string, options?: RegistrationOptions) => Promise<unknown>;
};

export async function requestPersistentStorage(
  storage: StorageManagerLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage,
): Promise<PersistentStorageResult> {
  if (!storage?.persisted || !storage.persist) return 'unsupported';
  try {
    if (await storage.persisted()) return 'already-persistent';
    return await storage.persist() ? 'granted' : 'denied';
  } catch {
    return 'error';
  }
}

export async function registerPwaServiceWorker(
  container: ServiceWorkerContainerLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
  production = process.env.NODE_ENV === 'production',
): Promise<ServiceWorkerResult> {
  if (!production) return 'development';
  if (!container) return 'unsupported';
  try {
    await container.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    return 'registered';
  } catch {
    return 'error';
  }
}

let runtimePromise: Promise<{ serviceWorker: ServiceWorkerResult; persistentStorage: PersistentStorageResult }> | null = null;

export function startPwaRuntime() {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      registerPwaServiceWorker(),
      requestPersistentStorage(),
    ]).then(([serviceWorker, persistentStorage]) => ({ serviceWorker, persistentStorage }));
  }
  return runtimePromise;
}
