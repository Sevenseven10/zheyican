import { registerRootComponent } from 'expo';

import App from './App';
import { startPwaRuntime } from './platform/pwaRuntime';
import { startViewportDebug } from './platform/viewportDebug';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately. Start offline preparation before
// React effects so a first successful web launch cannot miss its SW window.
// TEMP OFFLINE BOOT DEBUG: signal that the external bundle executed
if (typeof window !== 'undefined' && (window as any).__TEMP_BOOT_DEBUG) {
  (window as any).__TEMP_BOOT_DEBUG.setStage('APP_BUNDLE_EXECUTING');
}
void startPwaRuntime();
void startViewportDebug();
registerRootComponent(App);
