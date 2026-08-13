export const BRAND_TITLE = '这一餐';
export const BRAND_SUBTITLE = '记住这一餐，也记住这一天。';
export const SPLASH_MINIMUM_MS = 700;
export const SPLASH_FADE_MS = 250;

export const remainingSplashTime = (startedAt: number, now: number) => Math.max(0, SPLASH_MINIMUM_MS - (now - startedAt));

export type InitializationResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

export async function initializeWithMinimum<T>(
  initialize: () => Promise<void>,
  load: () => Promise<T>,
  startedAt = Date.now(),
  now: () => number = Date.now,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<InitializationResult<T>> {
  let result: InitializationResult<T>;
  try {
    await initialize();
    result = { ok: true, data: await load() };
  } catch (error) {
    result = { ok: false, error };
  }
  const remaining = remainingSplashTime(startedAt, now());
  if (remaining > 0) await wait(remaining);
  return result;
}
