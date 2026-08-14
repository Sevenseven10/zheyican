import type { ReactNode } from 'react';
import type { GestureResponderHandlers, StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import type { PhotoComposition } from '../domain/meal';

export type PhotoGestureSurfaceProps = {
  children: ReactNode;
  enabled: boolean;
  frameWidth: number;
  frameHeight: number;
  nativeHandlers: GestureResponderHandlers;
  onChange: (photo: PhotoComposition) => void;
  photo: PhotoComposition;
  style: StyleProp<ViewStyle>;
};

export function PhotoGestureSurface({ children, nativeHandlers, style }: PhotoGestureSurfaceProps) {
  return <View {...nativeHandlers} style={style}>{children}</View>;
}
