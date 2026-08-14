import { hasIntrinsicDimensions, normalizePhoto } from '../../photoLayout';
import type { PhotoRepository } from '../contracts';

type NativeFileSystem = {
  documentDirectory: string | null;
  makeDirectoryAsync(uri: string, options: { intermediates: boolean }): Promise<void>;
  copyAsync(options: { from: string; to: string }): Promise<void>;
  deleteAsync(uri: string, options: { idempotent: boolean }): Promise<void>;
};

export const PHOTO_DIRECTORY_NAME = 'meal-photos/';

export function createNativePhotoRepository(
  fileSystem: NativeFileSystem,
  now: () => number = Date.now,
  random: () => number = Math.random,
): PhotoRepository {
  const root = fileSystem.documentDirectory + PHOTO_DIRECTORY_NAME;
  return {
    async ensurePhotoDirectory() {
      await fileSystem.makeDirectoryAsync(root, { intermediates: true });
    },
    async persistPhoto(asset) {
      const uri = asset.uri;
      const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';
      const target = `${root}${now()}-${random().toString(36).slice(2)}.${ext}`;
      await fileSystem.copyAsync({ from: uri, to: target });
      const suppliedDimensions = { width: asset.width ?? 0, height: asset.height ?? 0 };
      const dimensions = hasIntrinsicDimensions(suppliedDimensions) ? suppliedDimensions : { width: 0, height: 0 };
      return normalizePhoto({ uri: target, originalWidth: dimensions.width, originalHeight: dimensions.height });
    },
    async deletePhoto(uri) {
      await fileSystem.deleteAsync(uri, { idempotent: true });
    },
  };
}
