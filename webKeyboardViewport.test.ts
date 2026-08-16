import { readFileSync } from 'node:fs';
import { createKeyboardViewportSession, KEYBOARD_FALLBACK_MS, KEYBOARD_RESTORE_TOLERANCE_PX, type KeyboardViewportEnvironment } from './platform/keyboardViewportSession';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeFrameScheduler {
  private callbacks = new Map<number, () => void>();
  private nextFrameId = 1;
  runAll(): void {
    while (this.callbacks.size) {
      const pending = Array.from(this.callbacks.entries());
      this.callbacks.clear();
      for (const [id, callback] of pending) {
        this.callbacks.delete(id);
        callback();
      }
    }
  }
  requestAnimationFrame = (callback: () => void): number => {
    const id = this.nextFrameId++;
    this.callbacks.set(id, callback);
    return id;
  };
  cancelAnimationFrame = (id: number): void => {
    this.callbacks.delete(id);
  };
}

class FakeTimerScheduler {
  private timers = new Map<number, () => void>();
  private nextTimerId = 1;
  firedIds: number[] = [];
  fireAll(): void {
    const pending = Array.from(this.timers.entries());
    this.timers.clear();
    for (const [id, callback] of pending) {
      this.firedIds.push(id);
      callback();
    }
  }
  setTimeout = (callback: () => void, _ms: number): number => {
    const id = this.nextTimerId++;
    this.timers.set(id, callback);
    return id;
  };
  clearTimeout = (id: number): void => {
    this.timers.delete(id);
  };
}

function createHarness(restingHeight = 800) {
  const frames = new FakeFrameScheduler();
  const timers = new FakeTimerScheduler();
  const resizeListeners = new Set<() => void>();
  const state = { restingHeight, visualHeight: restingHeight, editableActive: false };
  const calls: string[] = [];
  let keyboardOpen = false;

  const env: KeyboardViewportEnvironment = {
    getVisualViewportHeight: () => state.visualHeight,
    getRestingVisualViewportHeight: () => state.restingHeight,
    isEditableActive: () => state.editableActive,
    setKeyboardOpen: () => {
      calls.push('set-open');
      keyboardOpen = true;
    },
    clearKeyboardOpen: () => {
      calls.push('clear-open');
      keyboardOpen = false;
    },
    resetDocumentOffset: () => {
      calls.push('offset-reset');
    },
    addResizeListener: (listener) => {
      resizeListeners.add(listener);
      return () => resizeListeners.delete(listener);
    },
    requestAnimationFrame: frames.requestAnimationFrame,
    cancelAnimationFrame: frames.cancelAnimationFrame,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  };

  const fireResize = () => { for (const listener of [...resizeListeners]) listener(); };
  const setVisualHeight = (height: number) => { state.visualHeight = height; };
  const setEditableActive = (active: boolean) => { state.editableActive = active; };

  return {
    env,
    frames,
    timers,
    fireResize,
    setVisualHeight,
    setEditableActive,
    calls,
    keyboardOpen: () => keyboardOpen,
    resizeListenerCount: () => resizeListeners.size,
  };
}

function runIosKeyboardLifecycleTests() {
  // A. focus editable -> data-ios-keyboard set immediately.
  const h = createHarness(800);
  const session = createKeyboardViewportSession(h.env);
  session.focusIn();
  assert(h.keyboardOpen(), 'focus did not set the keyboard-open state immediately');
  assert(h.resizeListenerCount() === 1, 'focus did not attach the Visual Viewport resize listener');
  assert(session.isActive(), 'session is not active after focus');

  // E. keyboard visible -> Root height mutation calls = 0, document scroll reset = 0.
  h.setVisualHeight(450);
  h.fireResize();
  h.frames.runAll();
  assert(h.calls.includes('offset-reset') === false, 'keyboard visible must not reset document scroll');
  assert(session.isKeyboardSeen(), 'keyboard shrink was not recorded');
  assert(h.calls.every((call) => !call.includes('height')), 'keyboard lifecycle must never mutate Root height');

  // B/C. normal Web / Android: the controller itself is inert without focus.
  const inert = createHarness(800);
  const inertSession = createKeyboardViewportSession(inert.env);
  inert.frames.runAll();
  assert(!inertSession.isActive(), 'no focus must not start a keyboard session');
  assert(inert.calls.length === 0, 'no focus must not produce any keyboard state calls');

  // F. keyboard restore -> resize -> rAF -> height restored -> double rAF -> reset -> removed.
  const restore = createHarness(800);
  const restoreSession = createKeyboardViewportSession(restore.env);
  restoreSession.focusIn();
  restore.frames.runAll();
  restore.setVisualHeight(450);
  restore.fireResize();
  restore.frames.runAll();
  restore.setVisualHeight(800);
  restore.fireResize();
  restore.frames.runAll();
  assert(!restoreSession.isActive(), 'restore did not end the keyboard session');
  assert(restore.calls.includes('offset-reset'), 'restore did not reset document X/Y');
  assert(!restore.keyboardOpen(), 'restore did not remove the keyboard-open state');
  assert(restore.resizeListenerCount() === 0, 'restore did not remove session listeners');

  // G. focus A -> B: bottom chrome must stay hidden, session must survive.
  const ab = createHarness(800);
  const abSession = createKeyboardViewportSession(ab.env);
  abSession.focusIn();
  ab.frames.runAll();
  ab.setVisualHeight(450);
  ab.fireResize();
  ab.frames.runAll();
  ab.setEditableActive(true); // focus B (still editable) during focusout of A
  abSession.focusOut();
  ab.frames.runAll();
  assert(abSession.isActive(), 'A->B focus wrongly ended the session');
  assert(ab.keyboardOpen(), 'A->B focus restored the bottom chrome too early');
  assert(ab.resizeListenerCount() === 1, 'A->B focus removed the session listener');

  // H. keyboard dismissed by gesture while the input still owns focus:
  // viewport restore alone must recover the chrome.
  const gesture = createHarness(800);
  const gestureSession = createKeyboardViewportSession(gesture.env);
  gestureSession.focusIn();
  gesture.frames.runAll();
  gesture.setVisualHeight(450);
  gesture.fireResize();
  gesture.frames.runAll();
  gesture.setEditableActive(true); // input still focused
  gesture.setVisualHeight(800);
  gesture.fireResize();
  gesture.frames.runAll();
  assert(!gestureSession.isActive(), 'gesture dismissal did not end the session');
  assert(!gesture.keyboardOpen(), 'gesture dismissal did not restore the bottom chrome');

  // J. blur with no final restore event -> fallback cleanup removes listeners.
  const stuck = createHarness(800);
  const stuckSession = createKeyboardViewportSession(stuck.env);
  stuckSession.focusIn();
  stuck.frames.runAll();
  stuck.setVisualHeight(500);
  stuck.fireResize();
  stuck.frames.runAll();
  stuckSession.focusOut();
  stuck.frames.runAll();
  assert(stuck.resizeListenerCount() === 1, 'blur lost listeners before fallback cleanup');
  stuck.timers.fireAll();
  const stuckCount = stuck.resizeListenerCount();
  assert(stuckCount === 0, 'fallback cleanup did not remove listeners');
  assert(!stuck.keyboardOpen(), 'fallback cleanup did not clear the keyboard-open state');
  assert(stuck.calls.includes('offset-reset'), 'fallback cleanup did not reset document X/Y');
  assert(!stuckSession.isActive(), 'fallback cleanup left the session active');

  // I. stop() must clean up listeners immediately.
  const stop = createHarness(800);
  const stopSession = createKeyboardViewportSession(stop.env);
  stopSession.focusIn();
  stop.frames.runAll();
  stopSession.stop();
  assert(stop.resizeListenerCount() === 0, 'stop() did not remove listeners');
  assert(!stop.keyboardOpen(), 'stop() did not clear the keyboard-open state');

  assert(KEYBOARD_RESTORE_TOLERANCE_PX > 0 && KEYBOARD_RESTORE_TOLERANCE_PX <= 2, 'restore tolerance must be at most 2 CSS px');
  assert(KEYBOARD_FALLBACK_MS > 0, 'fallback cleanup must be a short positive delay');
}

function runPlatformIsolationTests() {
  const keyboardWeb = readFileSync('platform/keyboardViewport.web.ts', 'utf8');
  const keyboardNative = readFileSync('platform/keyboardViewport.ts', 'utf8');
  const html = readFileSync('public/index.html', 'utf8');
  const entry = readFileSync('index.ts', 'utf8');

  // A. iOS standalone detection bootstrap.
  assert(html.includes('navigator.standalone === true'), 'iOS standalone detection must gate on navigator.standalone');
  assert(html.includes("setAttribute('data-ios-standalone', 'true')"), 'iOS standalone bootstrap must tag the document element');
  assert(html.includes('/iPhone|iPod|iPad/i'), 'iOS standalone detection must require an Apple UA');

  // B/C. Platform isolation: the Web workaround gates on the iOS tag.
  assert(keyboardWeb.includes("getAttribute('data-ios-standalone') !== 'true'"), 'Web keyboard workaround must gate on the iOS standalone tag');
  assert(keyboardNative.includes('return () => undefined'), 'Native keyboard viewport must stay a no-op');
  assert(!keyboardNative.includes('visualViewport'), 'Native keyboard viewport must not own Web viewport state');
  assert(entry.includes("import { startKeyboardViewportSync } from './platform/keyboardViewport'"), 'Web entry must resolve the keyboard module through platform resolution');

  // K. Root height mutation must be absent from the keyboard logic.
  assert(!keyboardWeb.includes('style.height'), 'Web keyboard logic must never set Root height');
  assert(!keyboardWeb.includes('.minHeight'), 'Web keyboard logic must never set Root min-height');
  assert(!keyboardSessionSourceHasHeightMutation(), 'Keyboard session controller must never own Root height');

  // L. R2 formula must not exist.
  assert(!html.includes('calc(100dvh + env(safe-area-inset-top))'), 'R2 safe-area-in-root height formula must not exist');

  // M. black-translucent exists.
  assert(html.includes('apple-mobile-web-app-status-bar-style" content="black-translucent"'), 'Standalone status bar must be black-translucent');

  // N. iOS standalone stable 100vh exists.
  assert(html.includes('html[data-ios-standalone="true"]'), 'iOS standalone stable root must exist');

  // O. normal Web 100dvh exists.
  assert(html.includes('@supports (height: 100dvh)'), 'Normal Web 100dvh enhancement must exist');
}

function keyboardSessionSourceHasHeightMutation(): boolean {
  const session = readFileSync('platform/keyboardViewportSession.ts', 'utf8');
  return /applyKeyboardShellHeight|setShellHeight|\.style\.height|\.style\.minHeight/.test(session);
}

runIosKeyboardLifecycleTests();
runPlatformIsolationTests();
console.log('web keyboard viewport tests passed');
