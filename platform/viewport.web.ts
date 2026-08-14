type EventListener = () => void;

type EventSource = {
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
};

type ViewportSource = EventSource & { height: number };

type WindowSource = EventSource & {
  innerHeight: number;
  requestAnimationFrame: (callback: () => void) => number;
  cancelAnimationFrame: (handle: number) => void;
};

type RootStyle = {
  setProperty: (name: string, value: string) => void;
};

export type ViewportSyncEnvironment = {
  window: WindowSource;
  visualViewport?: ViewportSource;
  focusSource: EventSource;
  isEditableFocused: () => boolean;
  rootStyle: RootStyle;
};

const browserEnvironment = (): ViewportSyncEnvironment | undefined => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  return {
    window,
    visualViewport: window.visualViewport ?? undefined,
    focusSource: document,
    isEditableFocused: () => {
      const activeElement = document.activeElement as HTMLElement | null;
      return activeElement?.tagName === 'INPUT'
        || activeElement?.tagName === 'TEXTAREA'
        || Boolean(activeElement?.isContentEditable);
    },
    rootStyle: document.documentElement.style,
  };
};

export function startViewportSync(
  environment: ViewportSyncEnvironment | undefined = browserEnvironment(),
) {
  if (!environment) return () => undefined;

  const { focusSource, isEditableFocused, rootStyle, visualViewport, window: windowSource } = environment;
  let animationFrame: number | null = null;
  let measuring = false;
  let stableShellHeight = 0;
  let keyboardVisible = false;
  let acceptStartupResize = true;
  let lastObservedHeight = 0;
  let lastAppliedHeight = 0;

  const applyHeight = (height: number) => {
    if (Math.abs(height - lastAppliedHeight) < 0.5) return;
    lastAppliedHeight = height;
    rootStyle.setProperty('--app-viewport-height', `${height}px`);
  };

  const measure = () => {
    animationFrame = null;
    const height = visualViewport?.height ?? windowSource.innerHeight;
    if (!(Number.isFinite(height) && height > 0)) return;
    lastObservedHeight = height;

    const editableFocused = isEditableFocused();
    const viewportIsShorter = stableShellHeight > 0 && height + 1 < stableShellHeight;
    if (editableFocused && viewportIsShorter) keyboardVisible = true;

    if (keyboardVisible) {
      const viewportRecovered = stableShellHeight > 0 && height + 1 >= stableShellHeight;
      if (!editableFocused && viewportRecovered) keyboardVisible = false;
      else {
        applyHeight(stableShellHeight);
        return;
      }
    }

    stableShellHeight = height;
    applyHeight(stableShellHeight);
  };

  const scheduleMeasure = () => {
    if (animationFrame !== null) return;
    animationFrame = windowSource.requestAnimationFrame(measure);
  };

  const handleVisualViewportResize = () => {
    const height = visualViewport?.height ?? 0;
    const keyboardTransition = isEditableFocused() || keyboardVisible;
    if (!acceptStartupResize && !keyboardTransition) return;
    if (Math.abs(height - lastObservedHeight) < 2) return;
    scheduleMeasure();
  };

  const finishStartupSync = () => {
    measure();
    acceptStartupResize = false;
  };

  const handleWindowResize = () => scheduleMeasure();
  const handleOrientationChange = () => {
    acceptStartupResize = true;
    scheduleMeasure();
  };

  const attachMeasurementListeners = () => {
    if (measuring) return;
    measuring = true;
    acceptStartupResize = true;
    visualViewport?.addEventListener('resize', handleVisualViewportResize);
    windowSource.addEventListener('resize', handleWindowResize);
    windowSource.addEventListener('orientationchange', handleOrientationChange);
    focusSource.addEventListener('focusin', scheduleMeasure);
    focusSource.addEventListener('focusout', scheduleMeasure);
    measure();
    animationFrame = windowSource.requestAnimationFrame(finishStartupSync);
  };

  const detachMeasurementListeners = () => {
    if (!measuring) return;
    measuring = false;
    visualViewport?.removeEventListener('resize', handleVisualViewportResize);
    windowSource.removeEventListener('resize', handleWindowResize);
    windowSource.removeEventListener('orientationchange', handleOrientationChange);
    focusSource.removeEventListener('focusin', scheduleMeasure);
    focusSource.removeEventListener('focusout', scheduleMeasure);
    if (animationFrame !== null) {
      windowSource.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };

  const handlePageShow = () => attachMeasurementListeners();
  const handlePageHide = () => detachMeasurementListeners();

  windowSource.addEventListener('pageshow', handlePageShow);
  windowSource.addEventListener('pagehide', handlePageHide);
  attachMeasurementListeners();

  return () => {
    detachMeasurementListeners();
    windowSource.removeEventListener('pageshow', handlePageShow);
    windowSource.removeEventListener('pagehide', handlePageHide);
  };
}
