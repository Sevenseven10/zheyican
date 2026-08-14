export type GestureComposition = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function classifyWebPhotoTouch(deltaX: number, deltaY: number, threshold = 8) {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < threshold) return 'pending' as const;
  return Math.abs(deltaY) > Math.abs(deltaX) ? 'scroll' as const : 'drag' as const;
}

export function applyWebPhotoDrag(
  start: GestureComposition,
  deltaX: number,
  deltaY: number,
  frameWidth: number,
  frameHeight: number,
): GestureComposition {
  return {
    ...start,
    offsetX: clamp(start.offsetX + deltaX / (Math.max(1, frameWidth) / 2), -1, 1),
    offsetY: clamp(start.offsetY + deltaY / (Math.max(1, frameHeight) / 2), -1, 1),
  };
}

export function applyWebPhotoPinch(
  start: GestureComposition,
  startDistance: number,
  currentDistance: number,
): GestureComposition {
  if (!(startDistance > 0) || !(currentDistance > 0)) return start;
  return {
    ...start,
    scale: clamp(start.scale * currentDistance / startDistance, 1, 4),
  };
}
