type LifecycleEvent = { persisted?: boolean };
type EventListener = (event?: LifecycleEvent) => void;

type EventSource = {
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
};

type ViewportSource = EventSource & { height: number; offsetTop?: number };

type WindowSource = EventSource & {
  innerHeight: number;
  innerWidth: number;
  requestAnimationFrame: (callback: () => void) => number;
  cancelAnimationFrame: (handle: number) => void;
};

type RootStyle = {
  setProperty: (name: string, value: string) => void;
  getPropertyValue?: (name: string) => string;
};

export type ViewportLifecycleState = {
  online: boolean;
  visibilityState: string;
  documentClientHeight: number;
  serviceWorkerControlled: boolean;
};

export type ViewportDiagnostic = ViewportLifecycleState & {
  event: string;
  pageshowPersisted: boolean;
  windowInnerHeight: number;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
  cssViewportHeight: string;
  stableViewportHeight: number;
  keyboardVisible: boolean;
};

export type ViewportSyncEnvironment = {
  window: WindowSource;
  visualViewport?: ViewportSource;
  focusSource: EventSource;
  serviceWorkerSource?: EventSource;
  isEditableFocused: () => boolean;
  lifecycleState: () => ViewportLifecycleState;
  rootStyle: RootStyle;
  onDiagnostic?: (diagnostic: ViewportDiagnostic) => void;
};

type DiagnosticWindow = Window & { __ZHEYICAN_VIEWPORT_DIAGNOSTICS__?: ViewportDiagnostic[] };

const browserEnvironment = (): ViewportSyncEnvironment | undefined => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  const diagnosticWindow = window as DiagnosticWindow;
  return {
    window,
    visualViewport: window.visualViewport ?? undefined,
    focusSource: document,
    serviceWorkerSource: navigator.serviceWorker,
    isEditableFocused: () => {
      const activeElement = document.activeElement as HTMLElement | null;
      return activeElement?.tagName === 'INPUT'
        || activeElement?.tagName === 'TEXTAREA'
        || Boolean(activeElement?.isContentEditable);
    },
    lifecycleState: () => ({
      online: navigator.onLine,
      visibilityState: document.visibilityState,
      documentClientHeight: document.documentElement.clientHeight,
      serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    }),
    rootStyle: document.documentElement.style,
    onDiagnostic: (diagnostic) => {
      const entries = diagnosticWindow.__ZHEYICAN_VIEWPORT_DIAGNOSTICS__ ?? [];
      entries.push(diagnostic);
      diagnosticWindow.__ZHEYICAN_VIEWPORT_DIAGNOSTICS__ = entries.slice(-48);
    },
  };
};

const CALIBRATION_FRAMES = 3;
const HEIGHT_EPSILON = 1;
const WIDTH_CHANGE_THRESHOLD = 8;

export function startViewportSync(
  environment: ViewportSyncEnvironment | undefined = browserEnvironment(),
) {
  if (!environment) return () => undefined;

  const {
    focusSource,
    isEditableFocused,
    lifecycleState,
    onDiagnostic,
    rootStyle,
    serviceWorkerSource,
    visualViewport,
    window: windowSource,
  } = environment;
  let animationFrame: number | null = null;
  let measuring = false;
  let stableShellHeight = 0;
  let stableViewportWidth = 0;
  let keyboardVisible = false;
  let calibrationFrames = 0;
  let calibrationEvent = 'cold-mount';
  let pageshowPersisted = false;
  let lastAppliedHeight = 0;

  const record = (event: string) => {
    if (!onDiagnostic) return;
    const state = lifecycleState();
    onDiagnostic({
      ...state,
      event,
      pageshowPersisted,
      windowInnerHeight: windowSource.innerHeight,
      visualViewportHeight: visualViewport?.height ?? 0,
      visualViewportOffsetTop: visualViewport?.offsetTop ?? 0,
      cssViewportHeight: rootStyle.getPropertyValue?.('--app-viewport-height') ?? `${lastAppliedHeight}px`,
      stableViewportHeight: stableShellHeight,
      keyboardVisible,
    });
  };

  const applyHeight = (height: number) => {
    if (Math.abs(height - lastAppliedHeight) < 0.5) return;
    lastAppliedHeight = height;
    rootStyle.setProperty('--app-viewport-height', `${height}px`);
  };

  const scheduleMeasure = () => {
    if (animationFrame !== null) return;
    animationFrame = windowSource.requestAnimationFrame(measure);
  };

  const continueCalibration = () => {
    if (calibrationFrames <= 0) return;
    calibrationFrames -= 1;
    if (calibrationFrames > 0) scheduleMeasure();
  };

  const measure = () => {
    animationFrame = null;
    const visualHeight = visualViewport?.height ?? windowSource.innerHeight;
    const innerHeight = windowSource.innerHeight;
    if (!(Number.isFinite(visualHeight) && visualHeight > 0 && Number.isFinite(innerHeight) && innerHeight > 0)) {
      continueCalibration();
      return;
    }

    const editableFocused = isEditableFocused();
    const visualViewportIsShorter = stableShellHeight > 0 && visualHeight + HEIGHT_EPSILON < stableShellHeight;
    if (editableFocused && visualViewportIsShorter) keyboardVisible = true;

    if (keyboardVisible) {
      const viewportRecovered = stableShellHeight > 0 && visualHeight + HEIGHT_EPSILON >= stableShellHeight;
      if (!editableFocused && viewportRecovered) keyboardVisible = false;
      else {
        applyHeight(stableShellHeight);
        record(`${calibrationEvent}:keyboard-held`);
        continueCalibration();
        return;
      }
    }

    const widthChanged = stableViewportWidth > 0
      && Math.abs(windowSource.innerWidth - stableViewportWidth) >= WIDTH_CHANGE_THRESHOLD;
    const candidateHeight = Math.max(visualHeight, innerHeight);
    if (stableShellHeight <= 0 || widthChanged || candidateHeight + HEIGHT_EPSILON >= stableShellHeight) {
      stableShellHeight = candidateHeight;
      stableViewportWidth = windowSource.innerWidth;
    }
    applyHeight(stableShellHeight);
    record(calibrationEvent);
    continueCalibration();
  };

  const startCalibration = (event: string, persisted = false) => {
    calibrationEvent = event;
    pageshowPersisted = persisted;
    calibrationFrames = CALIBRATION_FRAMES;
    record(`${event}:start`);
    scheduleMeasure();
  };

  const handleVisualViewportResize = () => {
    const candidateHeight = Math.max(visualViewport?.height ?? 0, windowSource.innerHeight);
    const recoversShortShell = stableShellHeight > 0 && candidateHeight > stableShellHeight + HEIGHT_EPSILON;
    if (calibrationFrames <= 0 && !isEditableFocused() && !keyboardVisible && !recoversShortShell) return;
    scheduleMeasure();
  };

  const handleWindowResize = () => {
    const widthChanged = stableViewportWidth > 0
      && Math.abs(windowSource.innerWidth - stableViewportWidth) >= WIDTH_CHANGE_THRESHOLD;
    const recoversShortShell = stableShellHeight > 0 && windowSource.innerHeight > stableShellHeight + HEIGHT_EPSILON;
    if (calibrationFrames > 0 || widthChanged || recoversShortShell || isEditableFocused() || keyboardVisible) scheduleMeasure();
  };
  const handleOrientationChange = () => startCalibration('orientationchange');
  const handleOnline = () => startCalibration('online');
  const handleOffline = () => startCalibration('offline');
  const handleControllerChange = () => startCalibration('serviceworker-controllerchange');
  const handleVisibilityChange = () => {
    const { visibilityState } = lifecycleState();
    record(`visibilitychange:${visibilityState}`);
    if (visibilityState === 'visible') startCalibration('visibilitychange:visible');
  };

  const attachMeasurementListeners = () => {
    if (measuring) return;
    measuring = true;
    visualViewport?.addEventListener('resize', handleVisualViewportResize);
    windowSource.addEventListener('resize', handleWindowResize);
    windowSource.addEventListener('orientationchange', handleOrientationChange);
    windowSource.addEventListener('online', handleOnline);
    windowSource.addEventListener('offline', handleOffline);
    focusSource.addEventListener('focusin', scheduleMeasure);
    focusSource.addEventListener('focusout', scheduleMeasure);
    focusSource.addEventListener('visibilitychange', handleVisibilityChange);
    serviceWorkerSource?.addEventListener('controllerchange', handleControllerChange);
  };

  const detachMeasurementListeners = () => {
    if (!measuring) return;
    measuring = false;
    visualViewport?.removeEventListener('resize', handleVisualViewportResize);
    windowSource.removeEventListener('resize', handleWindowResize);
    windowSource.removeEventListener('orientationchange', handleOrientationChange);
    windowSource.removeEventListener('online', handleOnline);
    windowSource.removeEventListener('offline', handleOffline);
    focusSource.removeEventListener('focusin', scheduleMeasure);
    focusSource.removeEventListener('focusout', scheduleMeasure);
    focusSource.removeEventListener('visibilitychange', handleVisibilityChange);
    serviceWorkerSource?.removeEventListener('controllerchange', handleControllerChange);
    if (animationFrame !== null) {
      windowSource.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    calibrationFrames = 0;
  };

  const handlePageShow = (event?: LifecycleEvent) => {
    attachMeasurementListeners();
    startCalibration('pageshow', Boolean(event?.persisted));
  };
  const handlePageHide = () => {
    record('pagehide');
    detachMeasurementListeners();
  };

  windowSource.addEventListener('pageshow', handlePageShow);
  windowSource.addEventListener('pagehide', handlePageHide);
  attachMeasurementListeners();
  measure();
  startCalibration('cold-mount');

  return () => {
    detachMeasurementListeners();
    windowSource.removeEventListener('pageshow', handlePageShow);
    windowSource.removeEventListener('pagehide', handlePageHide);
  };
}
