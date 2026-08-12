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
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizePhoto(value: string | Partial<PhotoComposition>): PhotoComposition {
  if (typeof value === 'string') {
    return { uri: value, originalWidth: 0, originalHeight: 0, scale: 1, offsetX: 0, offsetY: 0 };
  }
  return {
    uri: value.uri ?? '',
    originalWidth: value.originalWidth ?? 0,
    originalHeight: value.originalHeight ?? 0,
    scale: clamp(value.scale ?? 1, 1, 4),
    offsetX: clamp(value.offsetX ?? 0, -1, 1),
    offsetY: clamp(value.offsetY ?? 0, -1, 1),
  };
}

export function getComposedImageLayout(
  photo: PhotoComposition,
  frameWidth: number,
  frameHeight: number,
  measured?: PhotoDimensions,
): ComposedImageLayout {
  const sourceWidth = photo.originalWidth > 0 ? photo.originalWidth : measured?.width ?? 1;
  const sourceHeight = photo.originalHeight > 0 ? photo.originalHeight : measured?.height ?? 1;
  const sourceRatio = sourceWidth / sourceHeight;
  const frameRatio = frameWidth / frameHeight;
  const useContain = sourceRatio > 3.2 || sourceRatio < 0.32;
  const baseWidth = useContain
    ? (sourceRatio > frameRatio ? frameWidth : frameHeight * sourceRatio)
    : (sourceRatio > frameRatio ? frameHeight * sourceRatio : frameWidth);
  const baseHeight = useContain
    ? (sourceRatio > frameRatio ? frameWidth / sourceRatio : frameHeight)
    : (sourceRatio > frameRatio ? frameHeight : frameWidth / sourceRatio);
  const width = baseWidth * photo.scale;
  const height = baseHeight * photo.scale;
  const maxX = Math.max(0, (width - frameWidth) / 2);
  const maxY = Math.max(0, (height - frameHeight) / 2);
  return {
    width,
    height,
    left: (frameWidth - width) / 2 + photo.offsetX * maxX,
    top: (frameHeight - height) / 2 + photo.offsetY * maxY,
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
