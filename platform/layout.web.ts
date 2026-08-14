import type { ViewStyle } from 'react-native';

const cssDimension = (value: string) => value as unknown as number;

export const platformLayout: { page: ViewStyle; dataPage: ViewStyle; nav: ViewStyle; addPage: ViewStyle } = {
  page: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingTop: cssDimension('max(44px, env(safe-area-inset-top))') },
  dataPage: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingTop: cssDimension('max(44px, env(safe-area-inset-top))') },
  nav: { paddingBottom: cssDimension('max(10px, env(safe-area-inset-bottom))'), height: cssDimension('calc(70px + env(safe-area-inset-bottom))') },
  addPage: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingTop: cssDimension('max(38px, env(safe-area-inset-top))') },
};

export const getPhotoContainerWidth = (windowWidth: number) => Math.max(1, Math.min(windowWidth - 40, 600));
