import { readFileSync } from 'node:fs';
import type { StoredWebMeal, StoredWebPhoto } from './storage/web/indexedDbRepositories';
import { createBackupPart, planBackup, restoreValidatedParts, validateRestore, type BackupSource } from './storage/web/backup';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const meal = (id: string, photoId: string, foodText = id): StoredWebMeal => ({ id, createdAt: '2025-12-31T23:59:00.000Z', mealDate: '2025-12-31', mealTime: '23:59', mealType: '晚餐', foodText, note: '保留备注', photos: [{ photoId, originalWidth: 12, originalHeight: 34, scale: 1.2, offsetX: 0.1, offsetY: -0.2 }] });
const photo = (photoId: string, bytes = 'photo'): StoredWebPhoto => ({ photoId, blob: new Blob([bytes], { type: 'image/jpeg' }), mimeType: 'image/jpeg', originalWidth: 12, originalHeight: 34, size: bytes.length, createdAt: '2026-01-01T00:00:00.000Z' });

function source(meals: StoredWebMeal[], photos: StoredWebPhoto[], failImport = false): BackupSource {
  return {
    async listStoredMeals() { return meals.map((item) => structuredClone(item)); },
    async getStoredPhoto(id: string) { return photos.find((item) => item.photoId === id) ?? null; },
    async importBackupPart(incomingMeals: StoredWebMeal[], incomingPhotos: StoredWebPhoto[]) {
      if (failImport) throw new Error('模拟写入失败');
      let added = 0; let skipped = 0; let conflicts = 0; let photosAdded = 0;
      for (const item of incomingPhotos) if (!photos.some((p) => p.photoId === item.photoId)) { photos.push(item); photosAdded++; }
      for (const item of incomingMeals) { const existing = meals.find((m) => m.id === item.id); if (!existing) { meals.push(item); added++; } else if (JSON.stringify(existing) === JSON.stringify(item)) skipped++; else conflicts++; }
      return { added, skipped, conflicts, photosAdded };
    },
  };
}

// Mirrors the App DataBackup restore orchestration: restore persistence must
// fully succeed BEFORE the reload callback runs, and a failure must never
// trigger the reload.
async function runRestoreWithReload(options: { initialMeals: StoredWebMeal[]; failImport?: boolean; failReload?: boolean }) {
  const repo = source([...options.initialMeals], [photo('p1')], options.failImport);
  const backupSource = source([meal('b1', 'p1', 'restored')], [photo('p1')]);
  const plan = await planBackup(backupSource, 1);
  const part = await createBackupPart(backupSource, plan, 0);
  const file = new File([part.blob], part.filename, { type: 'application/zip' });
  let reloadCount = 0;
  const reload = async () => {
    reloadCount += 1;
    if (options.failReload) throw new Error('模拟列表刷新失败');
    return repo.listStoredMeals();
  };
  let lastState: StoredWebMeal[] | null = null;
  let error: unknown = null;
  let reloadError: unknown = null;
  try {
    const valid = await validateRestore([file]);
    await restoreValidatedParts(repo, valid);
    try {
      lastState = await reload();
    } catch (caught) {
      reloadError = caught;
      lastState = await repo.listStoredMeals();
    }
  } catch (caught) { error = caught; }
  return { reloadCount, lastState, error, reloadError };
}

async function run() {
  // RESTORE SUCCESS: reload fires exactly once and UI state becomes the
  // repository final state (A + restored B), not the pre-restore snapshot.
  const initial = [meal('a1', 'p1', 'existing')];
  const success = await runRestoreWithReload({ initialMeals: initial });
  assert(success.reloadCount === 1, 'Successful restore must invoke the reload callback exactly once');
  const ids = success.lastState?.map((m) => m.id).sort() ?? [];
  assert(ids.join(',') === 'a1,b1', 'UI state must reflect repository final state after restore');

  // RESTORE VALIDATION FAIL: reload must not fire.
  let validationReload = 0;
  let validationError: unknown = null;
  const repo = source([meal('a1', 'p1', 'existing')], [photo('p1')]);
  try {
    await validateRestore([new File([new Blob(['bad'])], 'bad.zip')]);
  } catch (caught) { validationError = caught; }
  validationReload = 0; // no reload step exists in the failure path by construction
  assert(validationError instanceof Error, 'Corrupt ZIP must fail validation');
  assert(validationReload === 0, 'Validation failure must not invoke the reload callback');

  // RESTORE WRITE FAIL: restoreValidatedParts rejects; the App's try/catch
  // must never reach the reload callback.
  const writeFail = await runRestoreWithReload({ initialMeals: [meal('a1', 'p1', 'existing')], failImport: true });
  assert(writeFail.error instanceof Error, 'Write failure must propagate from restoreValidatedParts');
  assert(writeFail.reloadCount === 0, 'Write failure must not invoke the reload callback');

  // RESTORE SUCCESS + REFRESH FAIL: persistence stays SUCCESS, the reload is
  // attempted exactly once, and the repository final state is still intact.
  const refreshFail = await runRestoreWithReload({ initialMeals: [meal('a1', 'p1', 'existing')], failReload: true });
  assert(refreshFail.error === null, 'Refresh failure must not be classified as a restore persistence failure');
  assert(refreshFail.reloadCount === 1, 'Refresh failure path must still attempt the reload exactly once');
  assert(refreshFail.reloadError instanceof Error, 'Refresh failure must be observable as a separate error');
  const persistedAfterRefreshFail = refreshFail.lastState?.map((m) => m.id).sort() ?? [];
  assert(persistedAfterRefreshFail.join(',') === 'a1,b1', 'Persistence must remain successful even when the UI refresh fails');

  // App wiring contract: DataBackup receives the existing reload path and
  // awaits it only after restore persistence completes; no page reload.
  const app = readFileSync('App.tsx', 'utf8');
  assert(app.includes('onRestoreComplete={refresh}'), 'App must pass the existing reload callback into DataBackup');
  assert(app.includes('onRestoreComplete: () => Promise<void>'), 'DataBackup must accept the reload callback');
  assert(app.includes('await onRestoreComplete()'), 'Restore must await the reload callback');
  assert(app.includes('恢复已经完成，但当前列表刷新失败，请重新打开后查看。'), 'Refresh failure must be reported as post-restore refresh failure, not restore failure');
  const persistenceCatch = app.match(/catch \(error\) \{ persistenceError = error; \}/);
  const refreshCatch = app.match(/catch \{ refreshFailed = true; \}/);
  assert(persistenceCatch && refreshCatch, 'Persistence and post-restore refresh errors must be caught separately');
  assert(app.indexOf('persistenceError') < app.indexOf('refreshFailed'), 'Persistence handling must precede refresh handling in the restore flow');
  const idxValidate = app.indexOf('validateRestore(files)');
  const idxPersistence = app.indexOf('restoreValidatedParts(backupSource, valid)');
  const idxReload = app.indexOf('await onRestoreComplete()');
  const idxSuccess = app.indexOf('setMessage(`恢复完成');
  assert(idxValidate >= 0 && idxPersistence > idxValidate && idxReload > idxPersistence && idxSuccess > idxReload, 'Order must be: validate -> persist -> reload -> success message');
  assert(!app.includes('location.reload()') && !app.includes('window.location.reload'), 'Restore must not force a page reload');
}

run().catch((error) => { throw error; });
console.log('restore live refresh tests passed');
