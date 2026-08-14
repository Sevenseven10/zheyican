export type PhotoInputAsset = {
  blob: Blob;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  name: string;
};

export const photoInputAvailability: {
  enabled: boolean;
  message: string;
  showCameraAction: boolean;
  selectPhotos?: (limit: number) => Promise<PhotoInputAsset[]>;
  capturePhoto?: () => Promise<PhotoInputAsset[]>;
} = { enabled: true, message: '', showCameraAction: true };
