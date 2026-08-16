import { createKeyboardViewportSession, type KeyboardViewportEnvironment } from './keyboardViewportSession';

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

function isEditableElement(target: Element | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches(EDITABLE_SELECTOR);
}

/**
 * iOS standalone keyboard UI lifecycle.
 *
 * NO-OP for:
 *   - normal Web (no data-ios-standalone)
 *   - Android standalone PWA (never tagged data-ios-standalone)
 *   - non-standalone iOS Safari (no data-ios-standalone)
 *
 * Active ONLY when documentElement has data-ios-standalone="true".
 *
 * This module NEVER mutates html/body/#root height/min-height. The Root size
 * is owned by CSS alone and stays 100vh for the whole app lifetime. The
 * keyboard lifecycle only toggles data-ios-keyboard, which hides the bottom
 * Nav / Add Action Dock via CSS (visibility, no layout reflow).
 */
export function startKeyboardViewportSync(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined;
  if (document.documentElement.getAttribute('data-ios-standalone') !== 'true') return () => undefined;
  const visualViewport = window.visualViewport;
  if (!visualViewport || typeof visualViewport.height !== 'number') return () => undefined;

  const documentElement = document.documentElement;
  let restingVisualViewportHeight = visualViewport.height > 0 ? visualViewport.height : 0;

  const captureRestingHeight = () => {
    if (restingVisualViewportHeight <= 0 && visualViewport.height > 0) {
      restingVisualViewportHeight = visualViewport.height;
    }
  };
  captureRestingHeight();
  if (restingVisualViewportHeight <= 0) {
    requestAnimationFrame(captureRestingHeight);
  }

  const env: KeyboardViewportEnvironment = {
    getVisualViewportHeight: () => visualViewport.height,
    getRestingVisualViewportHeight: () => restingVisualViewportHeight,
    isEditableActive: () => isEditableElement(document.activeElement),
    setKeyboardOpen: () => documentElement.setAttribute('data-ios-keyboard', 'true'),
    clearKeyboardOpen: () => documentElement.removeAttribute('data-ios-keyboard'),
    resetDocumentOffset: () => {
      documentElement.scrollTop = 0;
      documentElement.scrollLeft = 0;
      document.body.scrollTop = 0;
      document.body.scrollLeft = 0;
      window.scrollTo(0, 0);
    },
    addResizeListener: (listener) => {
      visualViewport.addEventListener('resize', listener);
      return () => visualViewport.removeEventListener('resize', listener);
    },
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (id) => window.clearTimeout(id),
  };

  const session = createKeyboardViewportSession(env);

  const onFocusIn = (event: FocusEvent) => {
    if (isEditableElement(event.target as Element | null)) session.focusIn();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (isEditableElement(event.target as Element | null)) session.focusOut();
  };

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);

  return () => {
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    session.stop();
  };
}
