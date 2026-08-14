import type { ViewStyle } from 'react-native';

const cssDimension = (value: string) => value as unknown as number;

export const platformLayout: { page: ViewStyle; dataPage: ViewStyle; nav: ViewStyle; addPage: ViewStyle; composerApp: ViewStyle; brandSplash: ViewStyle; brandIndex: ViewStyle; startupError: ViewStyle } = {
  page: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingTop: cssDimension('max(44px, env(safe-area-inset-top))'), paddingBottom: cssDimension('calc(110px + env(safe-area-inset-bottom))') },
  dataPage: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingTop: cssDimension('max(44px, env(safe-area-inset-top))'), paddingBottom: cssDimension('calc(52px + env(safe-area-inset-bottom))') },
  nav: { paddingBottom: cssDimension('max(10px, env(safe-area-inset-bottom))'), height: cssDimension('calc(70px + env(safe-area-inset-bottom))') },
  addPage: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingTop: cssDimension('max(38px, env(safe-area-inset-top))'), paddingBottom: cssDimension('calc(42px + env(safe-area-inset-bottom))') },
  composerApp: { paddingTop: cssDimension('max(36px, env(safe-area-inset-top))'), paddingBottom: cssDimension('env(safe-area-inset-bottom)') },
  brandSplash: { paddingTop: cssDimension('env(safe-area-inset-top)'), paddingBottom: cssDimension('env(safe-area-inset-bottom)') },
  brandIndex: { bottom: cssDimension('calc(32px + env(safe-area-inset-bottom))') },
  startupError: { paddingTop: cssDimension('env(safe-area-inset-top)'), paddingBottom: cssDimension('env(safe-area-inset-bottom)') },
};

export const getPhotoContainerWidth = (windowWidth: number) => Math.max(1, Math.min(windowWidth - 40, 600));
