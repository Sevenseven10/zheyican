export type WebPhotoInputSource = 'library' | 'camera';

export type WebPhotoInputAsset = {
  blob: Blob;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  name: string;
};

export class WebPhotoInputError extends Error {
  constructor(
    public readonly code: 'UNSUPPORTED_INPUT' | 'DECODE_FAILED' | 'INPUT_UNAVAILABLE',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WebPhotoInputError';
  }
}

type NamedBlob = Blob & { name?: string };
type DimensionReader = (blob: Blob) => Promise<{ width: number; height: number }>;

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
};

export function inferImageMime(blob: NamedBlob) {
  if (blob.type.startsWith('image/')) return blob.type;
  const extension = blob.name?.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME[extension] ?? null;
}

export async function prepareWebPhotoFiles(
  files: ArrayLike<NamedBlob> | null,
  limit: number,
  readDimensions: DimensionReader,
): Promise<WebPhotoInputAsset[]> {
  if (!files || files.length === 0 || limit <= 0) return [];
  const selected = Array.from(files).slice(0, limit);
  return Promise.all(selected.map(async (file) => {
    const mimeType = inferImageMime(file);
    if (!mimeType) {
      throw new WebPhotoInputError('UNSUPPORTED_INPUT', '请选择 JPEG、PNG、HEIC、HEIF 或浏览器支持的图片文件。');
    }
    let dimensions: { width: number; height: number };
    try {
      dimensions = await readDimensions(file);
    } catch (error) {
      throw new WebPhotoInputError(
        'DECODE_FAILED',
        '这张照片暂时无法在浏览器中读取。HEIC / HEIF 支持取决于当前 Safari 与系统版本。',
        error,
      );
    }
    if (!(dimensions.width > 0 && dimensions.height > 0)) {
      throw new WebPhotoInputError('DECODE_FAILED', '无法取得照片尺寸，请换一张照片后重试。');
    }
    return {
      blob: file,
      mimeType,
      originalWidth: dimensions.width,
      originalHeight: dimensions.height,
      name: file.name ?? 'photo',
    };
  }));
}

export async function readBrowserImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('The browser could not decode this image.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function selectWebPhotos(
  source: WebPhotoInputSource,
  limit: number,
  readDimensions: DimensionReader = readBrowserImageDimensions,
): Promise<WebPhotoInputAsset[]> {
  if (typeof document === 'undefined' || !document.body) {
    return Promise.reject(new WebPhotoInputError('INPUT_UNAVAILABLE', '当前浏览器无法打开照片选择器。'));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = source === 'library';
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocus);
      input.remove();
    };
    const finish = (assets: WebPhotoInputAsset[]) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(assets);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onFocus = () => {
      focusTimer = setTimeout(() => {
        if (!input.files?.length) finish([]);
      }, 400);
    };
    window.addEventListener('focus', onFocus);
    input.addEventListener('cancel', () => finish([]), { once: true });
    input.addEventListener('change', () => {
      void prepareWebPhotoFiles(input.files, limit, readDimensions).then(finish, fail);
    }, { once: true });
    input.click();
  });
}
