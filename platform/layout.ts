import type { ViewStyle } from 'react-native';

export const platformLayout: { page: ViewStyle; dataPage: ViewStyle; nav: ViewStyle; addPage: ViewStyle; composerApp: ViewStyle; brandSplash: ViewStyle; brandIndex: ViewStyle; startupError: ViewStyle; historyDivider: ViewStyle; dataBackupEntry: ViewStyle } = {
  page: {},
  dataPage: {},
  nav: {},
  addPage: {},
  composerApp: {},
  brandSplash: {},
  brandIndex: {},
  startupError: {},
  historyDivider: {},
  dataBackupEntry: {},
};

export const getPhotoContainerWidth = (windowWidth: number) => Math.max(1, windowWidth - 40);
