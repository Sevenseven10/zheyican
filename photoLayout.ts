export type PhotoDimensions = { width: number; height: number };

export type PhotoComposition = {
  uri: string;
  originalWidth: number;
  originalHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type PhotoFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type MealPhotoLayout = {
  height: number;
  frames: PhotoFrame[];
};

export type ComposedImageLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const GAP = 5;
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const positive = (value: unknown, fallback: number) => { const next = finite(value, fallback); return next > 0 ? next : fallback; };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, finite(value, min)));

export function hasIntrinsicDimensions(value: { width?: unknown; height?: unknown; originalWidth?: unknown; originalHeight?: unknown }): boolean {
  const width = value.width ?? value.originalWidth;
  const height = value.height ?? value.originalHeight;
  return typeof width === 'number' && Number.isFinite(width) && width > 0
    && typeof height === 'number' && Number.isFinite(height) && height > 0;
}

export function normalizePhoto(value: unknown): PhotoComposition {
  if (typeof value === 'string') {
    return { uri: value.trim(), originalWidth: 0, originalHeight: 0, scale: 1, offsetX: 0, offsetY: 0 };
  }
  const photo = value && typeof value === 'object' ? value as Partial<PhotoComposition> : {};
  return {
    uri: typeof photo.uri === 'string' ? photo.uri.trim() : '',
    originalWidth: positive(photo.originalWidth, 0),
    originalHeight: positive(photo.originalHeight, 0),
    scale: clamp(photo.scale ?? 1, 1, 4),
    offsetX: clamp(photo.offsetX ?? 0, -1, 1),
    offsetY: clamp(photo.offsetY ?? 0, -1, 1),
  };
}

export function getComposedImageLayout(
  photo: PhotoComposition,
  frameWidth: number,
  frameHeight: number,
): ComposedImageLayout {
  const safeFrameWidth = positive(frameWidth, 1);
  const safeFrameHeight = positive(frameHeight, 1);
  if (!hasIntrinsicDimensions(photo)) {
    return { left: 0, top: 0, width: safeFrameWidth, height: safeFrameHeight };
  }
  const sourceWidth = photo.originalWidth;
  const sourceHeight = photo.originalHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const frameRatio = positive(safeFrameWidth / safeFrameHeight, 1);
  const useContain = sourceRatio > 3.2 || sourceRatio < 0.32;
  const baseWidth = useContain
    ? (sourceRatio > frameRatio ? safeFrameWidth : safeFrameHeight * sourceRatio)
    : (sourceRatio > frameRatio ? safeFrameHeight * sourceRatio : safeFrameWidth);
  const baseHeight = useContain
    ? (sourceRatio > frameRatio ? safeFrameWidth / sourceRatio : safeFrameHeight)
    : (sourceRatio > frameRatio ? safeFrameHeight : safeFrameWidth / sourceRatio);
  const scale = clamp(photo.scale, 1, 4);
  const width = positive(baseWidth * scale, safeFrameWidth);
  const height = positive(baseHeight * scale, safeFrameHeight);
  const maxX = Math.max(0, (width - safeFrameWidth) / 2);
  const maxY = Math.max(0, (height - safeFrameHeight) / 2);
  return {
    width,
    height,
    left: (safeFrameWidth - width) / 2 + clamp(photo.offsetX, -1, 1) * maxX,
    top: (safeFrameHeight - height) / 2 + clamp(photo.offsetY, -1, 1) * maxY,
  };
}

export function getMealPhotoLayout(count: number, containerWidth: number): MealPhotoLayout {
  const width = Math.max(1, containerWidth);
  if (count <= 0) return { height: 0, frames: [] };

  if (count === 1) {
    const height = clamp(width * 0.76, 240, 320);
    return { height, frames: [{ left: 0, top: 0, width, height }] };
  }

  if (count === 2) {
    const itemWidth = (width - GAP) / 2;
    const height = clamp(width * 0.58, 190, 250);
    return { height, frames: [
      { left: 0, top: 0, width: itemWidth, height },
      { left: itemWidth + GAP, top: 0, width: itemWidth, height },
    ] };
  }

  if (count === 3) {
    const height = clamp(width * 0.72, 240, 310);
    const mainWidth = (width - GAP) * 0.66;
    const sideWidth = width - GAP - mainWidth;
    const sideHeight = (height - GAP) / 2;
    return { height, frames: [
      { left: 0, top: 0, width: mainWidth, height },
      { left: mainWidth + GAP, top: 0, width: sideWidth, height: sideHeight },
      { left: mainWidth + GAP, top: sideHeight + GAP, width: sideWidth, height: sideHeight },
    ] };
  }

  if (count === 4) {
    const cellWidth = (width - GAP) / 2;
    const cellHeight = cellWidth * 0.78;
    return { height: cellHeight * 2 + GAP, frames: Array.from({ length: 4 }, (_, index) => ({
      left: (index % 2) * (cellWidth + GAP),
      top: Math.floor(index / 2) * (cellHeight + GAP),
      width: cellWidth,
      height: cellHeight,
    })) };
  }

  if (count === 5) {
    const height = clamp(width * 0.72, 240, 310);
    const mainWidth = (width - GAP) / 2;
    const smallWidth = (width - mainWidth - GAP * 2) / 2;
    const smallHeight = (height - GAP) / 2;
    return { height, frames: [
      { left: 0, top: 0, width: mainWidth, height },
      ...Array.from({ length: 4 }, (_, index) => ({
        left: mainWidth + GAP + (index % 2) * (smallWidth + GAP),
        top: Math.floor(index / 2) * (smallHeight + GAP),
        width: smallWidth,
        height: smallHeight,
      })),
    ] };
  }

  const visibleCount = Math.min(count, 6);
  const cellWidth = (width - GAP * 2) / 3;
  const cellHeight = cellWidth * 0.86;
  return { height: cellHeight * 2 + GAP, frames: Array.from({ length: visibleCount }, (_, index) => ({
    left: (index % 3) * (cellWidth + GAP),
    top: Math.floor(index / 3) * (cellHeight + GAP),
    width: cellWidth,
    height: cellHeight,
  })) };
}
