import { startViewportSync, type ViewportSyncEnvironment } from './platform/viewport.web';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeEventSource {
  private listeners = new Map<string, Set<(event?: { persisted?: boolean }) => void>>();

  addEventListener(type: string, listener: (event?: { persisted?: boolean }) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event?: { persisted?: boolean }) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event?: { persisted?: boolean }) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeWindow extends FakeEventSource {
  innerHeight = 844;
  innerWidth = 390;
  private nextFrame = 1;
  private frames = new Map<number, () => void>();

  requestAnimationFrame = (callback: () => void) => {
    const handle = this.nextFrame;
    this.nextFrame += 1;
    this.frames.set(handle, callback);
    return handle;
  };

  cancelAnimationFrame = (handle: number) => {
    this.frames.delete(handle);
  };

  flushFrames() {
    let guard = 0;
    while (this.frames.size) {
      const frames = [...this.frames.values()];
      this.frames.clear();
      frames.forEach((frame) => frame());
      guard += 1;
      if (guard > 20) throw new Error('viewport synchronization created an animation-frame loop');
    }
  }

  pendingFrameCount() {
    return this.frames.size;
  }
}

const fakeWindow = new FakeWindow();
fakeWindow.innerHeight = 700;
const fakeViewport = Object.assign(new FakeEventSource(), { height: 700, offsetTop: 0 });
const fakeFocusSource = new FakeEventSource();
const fakeServiceWorker = new FakeEventSource();
let editableFocused = false;
let online = true;
let visibilityState = 'visible';
let documentClientHeight = 700;
let serviceWorkerControlled = true;
const values = new Map<string, string>();
let viewportWrites = 0;
const diagnostics: Array<{ event: string; online: boolean; visibilityState: string; pageshowPersisted: boolean; stableViewportHeight: number; serviceWorkerControlled: boolean }> = [];
const environment: ViewportSyncEnvironment = {
  window: fakeWindow,
  visualViewport: fakeViewport,
  focusSource: fakeFocusSource,
  serviceWorkerSource: fakeServiceWorker,
  isEditableFocused: () => editableFocused,
  lifecycleState: () => ({ online, visibilityState, documentClientHeight, serviceWorkerControlled }),
  rootStyle: {
    setProperty: (name, value) => { viewportWrites += 1; values.set(name, value); },
    getPropertyValue: (name) => values.get(name) ?? '',
  },
  onDiagnostic: (entry) => diagnostics.push(entry),
};

const stop = startViewportSync(environment);
assert(values.get('--app-viewport-height') === '700px', 'viewport height was not applied before React mount');
assert(fakeWindow.pendingFrameCount() === 1, 'initial viewport stabilization was not scheduled');

fakeViewport.height = 812;
fakeWindow.innerHeight = 812;
documentClientHeight = 812;
fakeViewport.emit('resize');
fakeViewport.emit('resize');
assert(fakeWindow.pendingFrameCount() === 1, 'viewport resize created a reflow loop instead of coalescing');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'stabilized visual viewport height was not applied');

const writesAfterStartup = viewportWrites;
for (let index = 0; index < 120; index += 1) {
  fakeViewport.height = index % 2 === 0 ? 811 : 812;
  fakeViewport.emit('resize');
}
assert(fakeWindow.pendingFrameCount() === 0, 'ordinary scroll-like viewport events scheduled layout work');
assert(viewportWrites === writesAfterStartup, 'ordinary scroll-like viewport events rewrote the root height');

// O2/O3: a network transition may report a transient shorter visual viewport,
// but it must not replace the last reliable keyboard-closed shell height.
online = false;
fakeViewport.height = 760;
fakeWindow.innerHeight = 760;
documentClientHeight = 760;
fakeWindow.emit('offline');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'online-to-offline transition locked a transient short root height');
const writesAfterOffline = viewportWrites;
for (let index = 0; index < 60; index += 1) fakeViewport.emit('resize');
assert(fakeWindow.pendingFrameCount() === 0, 'offline active scroll scheduled viewport layout work');
assert(viewportWrites === writesAfterOffline, 'offline active scroll rewrote the root height');

// O4: BFCache/standalone restore must reattach listeners and recalibrate, while
// retaining the reliable height until the restored viewport has recovered.
fakeWindow.emit('pagehide');
fakeViewport.height = 744;
fakeWindow.innerHeight = 744;
fakeWindow.emit('pageshow', { persisted: true });
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'offline BFCache restore replaced the reliable shell with a transient height');

// O5/O6: reconnect and foreground restoration must run calibration and recover
// without requiring a user scroll.
online = true;
fakeWindow.emit('online');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'offline-to-online transition retained an invalid shell height');
visibilityState = 'hidden';
fakeFocusSource.emit('visibilitychange');
visibilityState = 'visible';
fakeFocusSource.emit('visibilitychange');
fakeWindow.flushFrames();
fakeServiceWorker.emit('controllerchange');
fakeWindow.flushFrames();
assert(diagnostics.some((entry) => entry.event === 'offline:start' && !entry.online), 'offline lifecycle was not measured');
assert(diagnostics.some((entry) => entry.event === 'pageshow:start' && entry.pageshowPersisted), 'BFCache pageshow.persisted was not measured');
assert(diagnostics.some((entry) => entry.event === 'online:start' && entry.online), 'online restoration was not measured');
assert(diagnostics.some((entry) => entry.event === 'serviceworker-controllerchange:start' && entry.serviceWorkerControlled), 'Service Worker controller lifecycle was not measured');

fakeWindow.innerWidth = 844;
fakeViewport.height = 390;
fakeWindow.innerHeight = 390;
fakeWindow.emit('orientationchange');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '390px', 'orientation change did not allow a legitimate shell-height reduction');
fakeWindow.innerWidth = 390;
fakeViewport.height = 812;
fakeWindow.innerHeight = 812;
documentClientHeight = 812;
fakeWindow.emit('orientationchange');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'portrait orientation did not restore the shell height');

editableFocused = true;
fakeFocusSource.emit('focusin');
fakeViewport.height = 468;
fakeViewport.emit('resize');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'keyboard opening incorrectly shrank the app shell');

fakeViewport.height = 452;
fakeViewport.emit('resize');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'keyboard viewport movement displaced the bottom navigation');

editableFocused = false;
fakeFocusSource.emit('focusout');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'focusout restored the shell before the keyboard finished closing');

fakeViewport.height = 812;
fakeViewport.emit('resize');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'keyboard dismiss did not restore the stable shell');

editableFocused = true;
fakeFocusSource.emit('focusin');
fakeViewport.height = 460;
fakeViewport.emit('resize');
fakeWindow.flushFrames();
editableFocused = false;
fakeFocusSource.emit('focusout');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'repeated focus/blur left stale viewport state');

fakeViewport.height = 812;
fakeViewport.emit('resize');
fakeWindow.flushFrames();

fakeWindow.emit('pagehide');
fakeViewport.height = 780;
fakeWindow.innerHeight = 780;
fakeViewport.emit('resize');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'hidden page kept measuring the viewport');

fakeWindow.emit('pageshow', { persisted: true });
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'restored standalone page replaced the reliable viewport with a transient value');

stop();
assert(fakeViewport.listenerCount('resize') === 0, 'visualViewport resize listener was not cleaned up');
assert(fakeWindow.listenerCount('orientationchange') === 0, 'orientation listener was not cleaned up');
assert(fakeWindow.listenerCount('pageshow') === 0, 'page lifecycle listeners were not cleaned up');
assert(fakeWindow.listenerCount('online') === 0, 'online listener was not cleaned up');
assert(fakeWindow.listenerCount('offline') === 0, 'offline listener was not cleaned up');
assert(fakeFocusSource.listenerCount('focusin') === 0, 'focus listener was not cleaned up');
assert(fakeFocusSource.listenerCount('focusout') === 0, 'blur listener was not cleaned up');
assert(fakeFocusSource.listenerCount('visibilitychange') === 0, 'visibility listener was not cleaned up');
assert(fakeServiceWorker.listenerCount('controllerchange') === 0, 'Service Worker lifecycle listener was not cleaned up');

// An offline cold launch may begin with a transient short viewport. A later
// recovery resize must be accepted even after the initial calibration frames.
const offlineWindow = new FakeWindow();
offlineWindow.innerHeight = 744;
const offlineViewport = Object.assign(new FakeEventSource(), { height: 744, offsetTop: 0 });
const offlineFocusSource = new FakeEventSource();
const offlineValues = new Map<string, string>();
const stopOffline = startViewportSync({
  window: offlineWindow,
  visualViewport: offlineViewport,
  focusSource: offlineFocusSource,
  isEditableFocused: () => false,
  lifecycleState: () => ({ online: false, visibilityState: 'visible', documentClientHeight: offlineWindow.innerHeight, serviceWorkerControlled: true }),
  rootStyle: { setProperty: (name, value) => offlineValues.set(name, value) },
});
offlineWindow.flushFrames();
assert(offlineValues.get('--app-viewport-height') === '744px', 'offline cold launch did not initialize a shell height');
offlineViewport.height = 812;
offlineWindow.innerHeight = 812;
offlineViewport.emit('resize');
offlineWindow.flushFrames();
assert(offlineValues.get('--app-viewport-height') === '812px', 'offline cold launch could not recover after the viewport stabilized');
stopOffline();

console.log('web viewport synchronization tests passed');
