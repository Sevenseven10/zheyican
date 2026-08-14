import type { ViewStyle } from 'react-native';

export const platformLayout: { page: ViewStyle; dataPage: ViewStyle; nav: ViewStyle; addPage: ViewStyle } = {
  page: {},
  dataPage: {},
  nav: {},
  addPage: {},
};

export const getPhotoContainerWidth = (windowWidth: number) => Math.max(1, windowWidth - 40);
