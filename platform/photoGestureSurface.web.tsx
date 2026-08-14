import { useEffect, useRef } from 'react';
import type { ViewStyle } from 'react-native';
import { View } from 'react-native';
import type { PhotoComposition } from '../domain/meal';
import type { PhotoGestureSurfaceProps } from './photoGestureSurface';
import { applyWebPhotoDrag, applyWebPhotoPinch, classifyWebPhotoTouch } from './web/photoGesture';

type ActiveGesture = {
  mode: 'pending' | 'drag' | 'scroll' | 'pinch';
  startPhoto: PhotoComposition;
  startX: number;
  startY: number;
  startDistance: number;
};

const webGestureStyle = {
  touchAction: 'pan-y',
} as unknown as ViewStyle;

const touchDistance = (touches: TouchList) => {
  if (touches.length < 2) return 0;
  const deltaX = touches[0].pageX - touches[1].pageX;
  const deltaY = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
};

export function PhotoGestureSurface({
  children,
  enabled,
  frameHeight,
  frameWidth,
  onChange,
  photo,
  style,
}: PhotoGestureSurfaceProps) {
  const viewRef = useRef<View>(null);
  const photoRef = useRef(photo);
  const onChangeRef = useRef(onChange);
  const gestureRef = useRef<ActiveGesture | null>(null);
  photoRef.current = photo;
  onChangeRef.current = onChange;

  useEffect(() => {
    const element = viewRef.current as unknown as HTMLElement | null;
    if (!element || !enabled) return;

    const begin = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        gestureRef.current = {
          mode: 'pinch',
          startPhoto: photoRef.current,
          startX: 0,
          startY: 0,
          startDistance: touchDistance(event.touches),
        };
        return;
      }
      if (event.touches.length === 1) {
        gestureRef.current = {
          mode: 'pending',
          startPhoto: photoRef.current,
          startX: event.touches[0].pageX,
          startY: event.touches[0].pageY,
          startDistance: 0,
        };
      }
    };
    const move = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        const distance = touchDistance(event.touches);
        if (gestureRef.current?.mode !== 'pinch') {
          gestureRef.current = { mode: 'pinch', startPhoto: photoRef.current, startX: 0, startY: 0, startDistance: distance };
          return;
        }
        const next = applyWebPhotoPinch(gestureRef.current.startPhoto, gestureRef.current.startDistance, distance);
        onChangeRef.current({ ...gestureRef.current.startPhoto, ...next });
        return;
      }
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        const gesture = gestureRef.current;
        if (!gesture || gesture.mode === 'pinch') {
          gestureRef.current = { mode: 'pending', startPhoto: photoRef.current, startX: touch.pageX, startY: touch.pageY, startDistance: 0 };
          return;
        }
        const deltaX = touch.pageX - gesture.startX;
        const deltaY = touch.pageY - gesture.startY;
        if (gesture.mode === 'pending') {
          gesture.mode = classifyWebPhotoTouch(deltaX, deltaY);
          if (gesture.mode === 'pending') return;
        }
        if (gesture.mode === 'scroll') return;
        const next = applyWebPhotoDrag(
          gesture.startPhoto,
          deltaX,
          deltaY,
          frameWidth,
          frameHeight,
        );
        onChangeRef.current({ ...gesture.startPhoto, ...next });
      }
    };
    const end = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        gestureRef.current = { mode: 'pending', startPhoto: photoRef.current, startX: touch.pageX, startY: touch.pageY, startDistance: 0 };
      } else {
        gestureRef.current = null;
      }
    };

    element.addEventListener('touchstart', begin, { passive: true });
    element.addEventListener('touchmove', move, { passive: true });
    element.addEventListener('touchend', end, { passive: true });
    element.addEventListener('touchcancel', end, { passive: true });
    return () => {
      element.removeEventListener('touchstart', begin);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', end);
      gestureRef.current = null;
    };
  }, [enabled, frameHeight, frameWidth]);

  return <View ref={viewRef} style={[style, webGestureStyle]}>{children}</View>;
}
