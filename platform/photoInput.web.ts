import { selectWebPhotos } from './web/photoInput';
import type { WebPhotoInputAsset as PhotoInputAsset } from './web/photoInput';

export type { PhotoInputAsset };

export const photoInputAvailability = {
  enabled: true,
  message: '',
  showCameraAction: false,
  selectPhotos: (limit: number): Promise<PhotoInputAsset[]> => selectWebPhotos('library', limit),
  capturePhoto: (): Promise<PhotoInputAsset[]> => selectWebPhotos('camera', 1),
};
