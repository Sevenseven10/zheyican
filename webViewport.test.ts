import { startViewportSync, type ViewportSyncEnvironment } from './platform/viewport.web';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeEventSource {
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeWindow extends FakeEventSource {
  innerHeight = 844;
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
    const frames = [...this.frames.values()];
    this.frames.clear();
    frames.forEach((frame) => frame());
  }

  pendingFrameCount() {
    return this.frames.size;
  }
}

const fakeWindow = new FakeWindow();
const fakeViewport = Object.assign(new FakeEventSource(), { height: 700 });
const fakeFocusSource = new FakeEventSource();
let editableFocused = false;
const values = new Map<string, string>();
let viewportWrites = 0;
const environment: ViewportSyncEnvironment = {
  window: fakeWindow,
  visualViewport: fakeViewport,
  focusSource: fakeFocusSource,
  isEditableFocused: () => editableFocused,
  rootStyle: { setProperty: (name, value) => { viewportWrites += 1; values.set(name, value); } },
};

const stop = startViewportSync(environment);
assert(values.get('--app-viewport-height') === '700px', 'viewport height was not applied before React mount');
assert(fakeWindow.pendingFrameCount() === 1, 'initial viewport stabilization was not scheduled');

fakeViewport.height = 812;
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
fakeViewport.emit('resize');
fakeWindow.flushFrames();
assert(values.get('--app-viewport-height') === '812px', 'hidden page kept measuring the viewport');

fakeWindow.emit('pageshow');
assert(values.get('--app-viewport-height') === '780px', 'restored standalone page did not resynchronize before layout');

stop();
assert(fakeViewport.listenerCount('resize') === 0, 'visualViewport resize listener was not cleaned up');
assert(fakeWindow.listenerCount('orientationchange') === 0, 'orientation listener was not cleaned up');
assert(fakeWindow.listenerCount('pageshow') === 0, 'page lifecycle listeners were not cleaned up');
assert(fakeFocusSource.listenerCount('focusin') === 0, 'focus listener was not cleaned up');
assert(fakeFocusSource.listenerCount('focusout') === 0, 'blur listener was not cleaned up');

console.log('web viewport synchronization tests passed');
