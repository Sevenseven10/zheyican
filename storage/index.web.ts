import {
  createIndexedDbRepositories,
  resolveRuntimeWebDatabaseName,
} from './web/indexedDbRepositories';

const databaseName = resolveRuntimeWebDatabaseName(process.env.EXPO_PUBLIC_ZHEYICAN_WEB_DATABASE_NAME);
const repositories = createIndexedDbRepositories({ databaseName });

export const mealRepository = repositories.mealRepository;
export const photoRepository = repositories.photoRepository;

const pageLifecycle = globalThis as typeof globalThis & {
  addEventListener?: (type: string, listener: (event: PageTransitionEvent) => void) => void;
};
pageLifecycle.addEventListener?.('pagehide', (event) => {
  if (!event.persisted) repositories.close();
});
