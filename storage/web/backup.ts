import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { StoredWebMeal, StoredWebPhoto } from './indexedDbRepositories';

export const TARGET_PART_SIZE = 50 * 1024 * 1024;
export type BackupPartPlan = { mealIds: string[]; estimatedBytes: number };
export type BackupManifest = { format: 'zheyican-backup'; version: 1; backupId: string; exportedAt: string; partIndex: number; partCount: number; meals: StoredWebMeal[]; photos: Array<Pick<StoredWebPhoto, 'photoId' | 'mimeType' | 'originalWidth' | 'originalHeight' | 'size'>> };
export type BackupSource = {
  listStoredMeals(): Promise<StoredWebMeal[]>;
  getStoredPhoto(photoId: string): Promise<StoredWebPhoto | null>;
  importBackupPart(meals: StoredWebMeal[], photos: StoredWebPhoto[]): Promise<RestoreCounts>;
};
export type RestoreCounts = { added: number; skipped: number; conflicts: number; photosAdded: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const photoExt = (mime: string) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }[mime] ?? 'bin');
const photoEntry = (photo: Pick<StoredWebPhoto, 'photoId' | 'mimeType'>) => `photos/${photo.photoId}.${photoExt(photo.mimeType)}`;
const createBackupId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const dateStamp = (value: string) => value.slice(0, 10);

export async function planBackup(source: BackupSource, targetSize = TARGET_PART_SIZE): Promise<{ backupId: string; exportedAt: string; parts: BackupPartPlan[] }> {
  const meals = await source.listStoredMeals();
  const parts: BackupPartPlan[] = [];
  let current: BackupPartPlan = { mealIds: [], estimatedBytes: 2048 };
  for (const meal of meals) {
    let mealBytes = 1024;
    for (const photo of meal.photos) {
      const stored = await source.getStoredPhoto(photo.photoId);
      if (!stored) throw new Error('备份无法继续：有照片已经不存在。');
      mealBytes += stored.size;
    }
    if (current.mealIds.length && current.estimatedBytes + mealBytes > targetSize) { parts.push(current); current = { mealIds: [], estimatedBytes: 2048 }; }
    current.mealIds.push(meal.id); current.estimatedBytes += mealBytes;
  }
  if (current.mealIds.length || meals.length === 0) parts.push(current);
  return { backupId: createBackupId(), exportedAt: new Date().toISOString(), parts };
}

export async function createBackupPart(source: BackupSource, plan: { backupId: string; exportedAt: string; parts: BackupPartPlan[] }, partIndex: number): Promise<{ blob: Blob; file: File; filename: string }> {
  const allMeals = await source.listStoredMeals();
  const wanted = new Set(plan.parts[partIndex].mealIds);
  const meals = allMeals.filter((meal) => wanted.has(meal.id));
  const photoIds = Array.from(new Set(meals.flatMap((meal) => meal.photos.map((photo) => photo.photoId))));
  const photos: StoredWebPhoto[] = [];
  const files: Record<string, Uint8Array> = {};
  for (const photoId of photoIds) {
    const photo = await source.getStoredPhoto(photoId);
    if (!photo) throw new Error('备份无法继续：有照片已经不存在。');
    photos.push(photo);
    files[photoEntry(photo)] = new Uint8Array(await photo.blob.arrayBuffer());
  }
  const manifest: BackupManifest = { format: 'zheyican-backup', version: 1, backupId: plan.backupId, exportedAt: plan.exportedAt, partIndex: partIndex + 1, partCount: plan.parts.length, meals, photos: photos.map(({ photoId, mimeType, originalWidth, originalHeight, size }) => ({ photoId, mimeType, originalWidth, originalHeight, size })) };
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  const bytes = zipSync(files, { level: 0 });
  const filename = `这一餐-备份-${dateStamp(plan.exportedAt)}-${String(partIndex + 1).padStart(3, '0')}-of-${String(plan.parts.length).padStart(3, '0')}.zip`;
  const blob = new Blob([bytes], { type: 'application/zip' });
  return { blob, file: new File([blob], filename, { type: blob.type }), filename };
}

type ValidatedPart = { file: File; manifest: BackupManifest };
const isMeal = (value: unknown): value is StoredWebMeal => !!value && typeof value === 'object' && typeof (value as StoredWebMeal).id === 'string' && Array.isArray((value as StoredWebMeal).photos);

async function readAndValidatePart(file: File): Promise<ValidatedPart> {
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(new Uint8Array(await file.arrayBuffer())); } catch { throw new Error(`无法读取备份包：${file.name}`); }
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new Error(`备份包缺少 manifest：${file.name}`);
  let manifest: BackupManifest;
  try { manifest = JSON.parse(strFromU8(manifestBytes)); } catch { throw new Error(`备份包 manifest 无法读取：${file.name}`); }
  if (manifest.format !== 'zheyican-backup' || manifest.version !== 1 || !manifest.backupId || !Number.isInteger(manifest.partIndex) || !Number.isInteger(manifest.partCount) || manifest.partIndex < 1 || manifest.partIndex > manifest.partCount || !Array.isArray(manifest.meals) || !Array.isArray(manifest.photos) || !manifest.meals.every(isMeal)) throw new Error(`备份包格式不受支持：${file.name}`);
  const metadata = new Map(manifest.photos.map((photo) => [photo.photoId, photo]));
  for (const meal of manifest.meals) for (const photo of meal.photos) {
    const item = metadata.get(photo.photoId);
    if (!item || !item.mimeType || !entries[photoEntry(item)]) throw new Error(`备份包缺少照片：${file.name}`);
  }
  return { file, manifest };
}

export async function validateRestore(files: File[]): Promise<ValidatedPart[]> {
  if (!files.length) throw new Error('请选择完整的备份分卷。');
  const parts: ValidatedPart[] = [];
  for (const file of files) parts.push(await readAndValidatePart(file));
  const first = parts[0].manifest;
  if (parts.some((part) => part.manifest.backupId !== first.backupId || part.manifest.partCount !== first.partCount)) throw new Error('备份分卷不属于同一套备份。');
  const indexes = parts.map((part) => part.manifest.partIndex);
  if (new Set(indexes).size !== indexes.length || indexes.length !== first.partCount || indexes.some((index) => !indexes.includes(index))) throw new Error('备份分卷不完整或有重复。');
  return parts.sort((a, b) => a.manifest.partIndex - b.manifest.partIndex);
}

export async function restoreValidatedParts(source: BackupSource, parts: ValidatedPart[]): Promise<RestoreCounts> {
  const total: RestoreCounts = { added: 0, skipped: 0, conflicts: 0, photosAdded: 0 };
  for (const part of parts) {
    const entries = unzipSync(new Uint8Array(await part.file.arrayBuffer()));
    const photos: StoredWebPhoto[] = [];
    for (const meta of part.manifest.photos) {
      const bytes = entries[photoEntry(meta)];
      if (!bytes) throw new Error(`恢复时找不到照片：${part.file.name}`);
      photos.push({ ...meta, blob: new Blob([bytes], { type: meta.mimeType }), createdAt: new Date().toISOString() });
    }
    const result = await source.importBackupPart(part.manifest.meals, photos);
    total.added += result.added; total.skipped += result.skipped; total.conflicts += result.conflicts; total.photosAdded += result.photosAdded;
  }
  return total;
}

export async function saveBackupPart(file: File) {
  const navigatorWithShare = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
  if (navigatorWithShare.canShare?.({ files: [file] }) && navigatorWithShare.share) { await navigatorWithShare.share({ files: [file], title: file.name }); return; }
  const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}
