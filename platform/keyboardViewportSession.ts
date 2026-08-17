export type KeyboardViewportEnvironment = {
  getVisualViewportHeight: () => number;
  getRestingVisualViewportHeight: () => number;
  isEditableActive: () => boolean;
  setKeyboardOpen: () => void;
  clearKeyboardOpen: () => void;
  resetDocumentOffset: () => void;
  addResizeListener: (listener: () => void) => () => void;
  requestAnimationFrame: (callback: () => void) => number;
  cancelAnimationFrame: (id: number) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

export type KeyboardViewportSession = {
  focusIn: () => void;
  focusOut: () => void;
  stop: () => void;
  isActive: () => boolean;
  isKeyboardOpen: () => boolean;
  isKeyboardSeen: () => boolean;
};

export const KEYBOARD_RESTORE_TOLERANCE_PX = 2;
export const KEYBOARD_FALLBACK_MS = 1200;

/**
 * iOS standalone keyboard lifecycle.
 *
 * This controller NEVER changes the Root size. It only:
 *
 *   focus  -> immediately set data-ios-keyboard so bottom chrome (Nav / Add
 *             Action Dock) hides before the keyboard animation starts.
 *   resize -> read the final Visual Viewport height after requestAnimationFrame
 *             (WebKit 254861: the resize event can fire before the height has
 *             updated). A shrink only records keyboardSeen state.
 *   blur   -> re-check document.activeElement after a frame. If an editable
 *             still owns focus (A->B), keep the session and hidden chrome.
 *             If nothing editable is focused, wait for the full restore event
 *             with a short fallback cleanup so listeners can never leak.
 *   restore-> after the Visual Viewport returns to the resting height (within
 *             a tiny tolerance), double-rAF, reset document X/Y, remove
 *             data-ios-keyboard, and end the session.
 *
 * The resting height is only a "keyboard fully closed" detector. It never
 * defines any layout size.
 */
export function createKeyboardViewportSession(env: KeyboardViewportEnvironment): KeyboardViewportSession {
  let active = false;
  let keyboardSeen = false;
  let keyboardOpen = false;
  let removeResize: (() => void) | null = null;
  let restoreTimerId: number | null = null;
  const frameIds = new Set<number>();

  const cancelRestoreFallback = () => {
    if (restoreTimerId === null) return;
    env.clearTimeout(restoreTimerId);
    restoreTimerId = null;
  };

  const armRestoreFallback = () => {
    if (restoreTimerId !== null) return;
    restoreTimerId = env.setTimeout(() => {
      restoreTimerId = null;
      finishSession();
    }, KEYBOARD_FALLBACK_MS);
  };

  const finishSession = () => {
    cancelRestoreFallback();
    for (const id of frameIds) env.cancelAnimationFrame(id);
    frameIds.clear();
    if (keyboardOpen) env.clearKeyboardOpen();
    keyboardOpen = false;
    env.resetDocumentOffset();
    removeResize?.();
    removeResize = null;
    active = false;
    keyboardSeen = false;
  };

  const afterFrame = (callback: () => void) => {
    const id = env.requestAnimationFrame(() => {
      frameIds.delete(id);
      callback();
    });
    frameIds.add(id);
  };

  const readViewport = () => {
    if (!active) return;
    const height = env.getVisualViewportHeight();
    const resting = env.getRestingVisualViewportHeight();
    if (height < resting - KEYBOARD_RESTORE_TOLERANCE_PX) {
      keyboardSeen = true;
      return;
    }
    if (!keyboardSeen) return;
    // The Visual Viewport returned to the resting height: the keyboard is
    // fully closed. Confirm twice more, then restore chrome + offset.
    afterFrame(() => afterFrame(() => {
      if (!active) return;
      const confirmed = env.getVisualViewportHeight();
      if (confirmed < env.getRestingVisualViewportHeight() - KEYBOARD_RESTORE_TOLERANCE_PX) {
        // Keyboard re-appeared mid-confirmation: keep waiting.
        keyboardSeen = true;
        return;
      }
      finishSession();
    }));
  };

  const onResize = () => {
    if (!active) return;
    afterFrame(() => readViewport());
  };

  return {
    focusIn() {
      // Hide bottom chrome immediately, before the keyboard animation.
      env.setKeyboardOpen();
      keyboardOpen = true;
      cancelRestoreFallback();
      // WebKit 254861: re-register the Visual Viewport listener on every
      // focus or it stops firing after one keyboard cycle.
      removeResize?.();
      removeResize = env.addResizeListener(onResize);
      if (!active) {
        active = true;
        keyboardSeen = false;
      }
      afterFrame(() => readViewport());
    },
    focusOut() {
      if (!active) return;
      afterFrame(() => {
        if (!active) return;
        if (env.isEditableActive()) {
          // Focus moved to another editable (A->B): keep the session and the
          // hidden bottom chrome.
          cancelRestoreFallback();
          return;
        }
        if (!keyboardSeen) {
          // The keyboard never visibly shrank this session: nothing to wait
          // for, restore immediately.
          finishSession();
          return;
        }
        // Keyboard was visible and may still be dismissing: wait for the
        // full restore event, with a short fallback cleanup.
        armRestoreFallback();
      });
    },
    stop() {
      finishSession();
    },
    isActive() {
      return active;
    },
    isKeyboardOpen() {
      return keyboardOpen;
    },
    isKeyboardSeen() {
      return keyboardSeen;
    },
  };
}
