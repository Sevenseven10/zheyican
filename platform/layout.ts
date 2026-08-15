import type { ViewStyle } from 'react-native';
import { getMealPhotoLayout } from '../photoLayout';

export { getMealPhotoLayout };

export const platformLayout: { page: ViewStyle; dataPage: ViewStyle; nav: ViewStyle; addPage: ViewStyle; addSave: ViewStyle; addActionDock: ViewStyle; composerApp: ViewStyle; brandSplash: ViewStyle; brandIndex: ViewStyle; startupError: ViewStyle; historyDivider: ViewStyle; dataBackupEntry: ViewStyle } = {
  page: {},
  dataPage: {},
  nav: {},
  addPage: {},
  addSave: {},
  addActionDock: {},
  composerApp: {},
  brandSplash: {},
  brandIndex: {},
  startupError: {},
  historyDivider: {},
  dataBackupEntry: {},
};

export const getPhotoContainerWidth = (windowWidth: number) => Math.max(1, windowWidth - 40);
