import { buildCalendarMonth, deriveHistory, monthKey, shiftMonth } from './historyQuery';

type TestMeal = { id: string; mealDate: string; mealTime: string; foodText: string };
const meals: TestMeal[] = [
  { id: '1', mealDate: '2026-08-13', mealTime: '08:00', foodText: '番茄鸡蛋面' },
  { id: '2', mealDate: '2026-08-13', mealTime: '19:00', foodText: 'Grilled Salmon' },
  { id: '3', mealDate: '2025-12-31', mealTime: '12:00', foodText: '跨年饺子' },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ids(items: TestMeal[]) { return items.map((meal) => meal.id).join(','); }

export function runHistoryQueryTests() {
  assert(ids(deriveHistory(meals, '番茄鸡蛋面', null).displayMeals) === '1', '完整 foodText 搜索失败');
  assert(ids(deriveHistory(meals, '鸡蛋', null).displayMeals) === '1', '中文部分搜索失败');
  assert(ids(deriveHistory(meals, '  grilled salmon  ', null).displayMeals) === '2', '英文大小写或 trim 搜索失败');
  assert(deriveHistory(meals, '不存在', null).displayMeals.length === 0, '无结果搜索失败');
  assert(ids(deriveHistory(meals, '', null).displayMeals) === '1,2,3', '清空搜索未恢复全部');
  assert(ids(deriveHistory(meals, '', '2026-08-13').displayMeals) === '1,2', '同日多餐筛选失败');
  assert(ids(deriveHistory(meals, '饺子', '2026-08-13').displayMeals) === '3', '搜索未优先于日期');
  assert(meals[0].mealDate === '2026-08-13', '查询改变了 Meal 日期');

  const dates = deriveHistory(meals, '', null).datesWithMeals;
  const august = buildCalendarMonth(new Date(2026, 7, 1, 12), dates);
  assert(august.length === 42, '月历网格不是 6 周');
  assert(august.some((day) => day.date === '2026-08-13' && day.hasMeals), '有记录日期未标记');
  assert(august.some((day) => day.date === '2026-08-14' && !day.hasMeals), '无记录日期错误标记');
  assert(monthKey(shiftMonth(new Date(2026, 0, 1, 12), -1)) === '2025-12', '向前跨年失败');
  assert(monthKey(shiftMonth(new Date(2025, 11, 1, 12), 1)) === '2026-01', '向后跨年失败');
  assert(monthKey(shiftMonth(new Date(2026, 7, 1, 12), -1)) === '2026-07', '上一个月失败');
  assert(monthKey(shiftMonth(new Date(2026, 7, 1, 12), 1)) === '2026-09', '下一个月失败');
}

runHistoryQueryTests();
