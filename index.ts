import { registerRootComponent } from 'expo';

import App from './App';
import { startKeyboardViewportSync } from './platform/keyboardViewport';
import { startPwaRuntime } from './platform/pwaRuntime';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately. Start offline preparation before
// React effects so a first successful web launch cannot miss its SW window.
//
// Web startup order:
//   1. startKeyboardViewportSync() — iOS standalone keyboard UI lifecycle
//      (hides bottom chrome while the keyboard is up; never resizes the Root).
//      Platform resolution keeps the native implementation a no-op.
//   2. startPwaRuntime() — SW registration + persistent storage.
//   3. registerRootComponent(App).
void startKeyboardViewportSync();
void startPwaRuntime();
registerRootComponent(App);
