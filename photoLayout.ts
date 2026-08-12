export type PhotoDimensions = { width: number; height: number };

export type PhotoFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  resizeMode: 'cover' | 'contain';
};

export type MealPhotoLayout = {
  height: number;
  frames: PhotoFrame[];
};

const GAP = 5;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validRatio = (dimensions?: PhotoDimensions) => {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return 1;
  return dimensions.width / dimensions.height;
};

export function getMealPhotoLayout(
  count: number,
  containerWidth: number,
  dimensions: Array<PhotoDimensions | undefined> = [],
): MealPhotoLayout {
  const width = Math.max(1, containerWidth);
  if (count <= 0) return { height: 0, frames: [] };

  if (count === 1) {
    const ratio = validRatio(dimensions[0]);
    const displayRatio = clamp(ratio, 0.72, 1.8);
    return {
      height: width / displayRatio,
      frames: [{
        left: 0,
        top: 0,
        width,
        height: width / displayRatio,
        resizeMode: ratio === displayRatio ? 'cover' : 'contain',
      }],
    };
  }

  if (count === 2) {
    const availableWidth = width - GAP;
    const ratios = [validRatio(dimensions[0]), validRatio(dimensions[1])];
    const allocationRatios = ratios.map((ratio) => clamp(ratio, 0.68, 1.8));
    const idealFirstShare = allocationRatios[0] / (allocationRatios[0] + allocationRatios[1]);
    const firstShare = clamp(idealFirstShare, 0.36, 0.64);
    const widths = [availableWidth * firstShare, availableWidth * (1 - firstShare)];
    const naturalHeights = widths.map((itemWidth, index) => itemWidth / ratios[index]);
    const height = clamp((naturalHeights[0] + naturalHeights[1]) / 2, 140, 280);
    const frames = widths.map((itemWidth, index) => {
      const frameRatio = itemWidth / height;
      const ratioDifference = Math.abs(frameRatio - ratios[index]) / ratios[index];
      return {
        left: index === 0 ? 0 : widths[0] + GAP,
        top: 0,
        width: itemWidth,
        height,
        resizeMode: ratioDifference <= 0.12 ? 'cover' as const : 'contain' as const,
      };
    });
    return { height, frames };
  }

  if (count === 3) {
    const height = clamp(width * 0.72, 240, 310);
    const mainWidth = (width - GAP) * 0.66;
    const sideWidth = width - GAP - mainWidth;
    const sideHeight = (height - GAP) / 2;
    return { height, frames: [
      { left: 0, top: 0, width: mainWidth, height, resizeMode: 'cover' },
      { left: mainWidth + GAP, top: 0, width: sideWidth, height: sideHeight, resizeMode: 'cover' },
      { left: mainWidth + GAP, top: sideHeight + GAP, width: sideWidth, height: sideHeight, resizeMode: 'cover' },
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
      resizeMode: 'cover' as const,
    })) };
  }

  const visibleCount = Math.min(count, 6);
  const cellWidth = (width - GAP * 2) / 3;
  const cellHeight = cellWidth * 0.86;
  return { height: cellHeight * 2 + GAP, frames: Array.from({ length: visibleCount }, (_, index) => ({
    left: (index % 3) * (cellWidth + GAP),
    top: Math.floor(index / 3) * (cellHeight + GAP),
    width: cellWidth,
    height: cellHeight,
    resizeMode: 'cover' as const,
  })) };
}
