import type { ViewStyle } from 'react-native';
import { getMealPhotoLayout as getNativeMealPhotoLayout } from '../photoLayout';

const cssDimension = (value: string) => value as unknown as number;

export const platformLayout: { page: ViewStyle; dataPage: ViewStyle; nav: ViewStyle; addPage: ViewStyle; addSave: ViewStyle; addActionDock: ViewStyle; composerApp: ViewStyle; brandSplash: ViewStyle; brandIndex: ViewStyle; startupError: ViewStyle; historyDivider: ViewStyle; dataBackupEntry: ViewStyle } = {
  page: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingTop: cssDimension('max(70px, env(safe-area-inset-top))'), paddingBottom: 110 },
  dataPage: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingTop: cssDimension('max(70px, env(safe-area-inset-top))'), paddingBottom: cssDimension('max(52px, env(safe-area-inset-bottom))') },
  nav: { paddingBottom: cssDimension('max(24px, env(safe-area-inset-bottom))'), height: cssDimension('max(84px, calc(50px + env(safe-area-inset-bottom)))') },
  addPage: { width: '100%', maxWidth: 640, alignSelf: 'center', minHeight: cssDimension('100%'), paddingTop: cssDimension('max(63px, env(safe-area-inset-top))'), paddingBottom: cssDimension('max(42px, env(safe-area-inset-bottom))') },
  addSave: {},
  addActionDock: { paddingBottom: cssDimension('max(14px, env(safe-area-inset-bottom))') },
  composerApp: { paddingTop: cssDimension('max(60px, env(safe-area-inset-top))') },
  brandSplash: {},
  brandIndex: { bottom: 50 },
  startupError: {},
  historyDivider: { display: 'none' },
  dataBackupEntry: { borderTopWidth: 0 },
};

export const getPhotoContainerWidth = (windowWidth: number) => Math.max(1, Math.min(windowWidth - 40, 600));

export const getMealPhotoLayout = (count: number, containerWidth: number) => {
  const nativeLayout = getNativeMealPhotoLayout(count, containerWidth);
  if (count <= 1 || nativeLayout.height <= 0) return nativeLayout;
  const stableHeight = Math.min(300, Math.max(230, containerWidth * 0.66));
  const verticalScale = stableHeight / nativeLayout.height;
  return {
    height: stableHeight,
    frames: nativeLayout.frames.map((frame) => ({
      ...frame,
      top: frame.top * verticalScale,
      height: frame.height * verticalScale,
    })),
  };
};
