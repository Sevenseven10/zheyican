import { BRAND_SUBTITLE, BRAND_TITLE, initializeWithMinimum, remainingSplashTime, SPLASH_FADE_MS, SPLASH_MINIMUM_MS } from './brandSplash';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runBrandSplashTests() {
  assert(BRAND_TITLE === '这一餐', '主标题不正确');
  assert(BRAND_SUBTITLE === '记住这一餐，也记住这一天。', '副标题不正确');
  assert(SPLASH_MINIMUM_MS === 1200, '最短展示时间不是 1200ms');
  assert(SPLASH_FADE_MS === 320, '淡出时间不是 320ms');
  assert(remainingSplashTime(1000, 1200) === 1000, '快速初始化等待时间错误');
  assert(remainingSplashTime(1000, 2300) === 0, '慢初始化不应额外等待');

  const calls: string[] = [];
  const success = await initializeWithMinimum(async () => { calls.push('init'); }, async () => { calls.push('load'); return ['meal']; }, 1000, () => 1200, async (milliseconds) => { calls.push(`wait:${milliseconds}`); });
  assert(success.ok && success.data[0] === 'meal', '成功初始化结果错误');
  assert(calls.join(',') === 'init,load,wait:1000', '初始化顺序错误');

  let errorWait = 0;
  const failure = await initializeWithMinimum(async () => { throw new Error('db'); }, async () => ['unreachable'], 1000, () => 1100, async (milliseconds) => { errorWait = milliseconds; });
  assert(!failure.ok, '初始化异常未进入错误结果');
  assert(errorWait === 1100, '错误状态未遵守最短展示时间');
}

runBrandSplashTests().catch((error) => { throw error; });
