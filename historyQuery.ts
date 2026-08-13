export type HistoryMeal = {
  id: string;
  mealDate: string;
  mealTime: string;
  foodText: string;
};

export type CalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
  hasMeals: boolean;
};

export type HistoryQueryResult<T extends HistoryMeal> = {
  searchResults: T[];
  selectedDateResults: T[];
  datesWithMeals: Set<string>;
  displayMeals: T[];
  mode: 'timeline' | 'search' | 'date';
};

const pad = (value: number) => String(value).padStart(2, '0');
export const monthKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
export const dateKeyFromParts = (year: number, monthIndex: number, day: number) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`;

export function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
}

export function deriveHistory<T extends HistoryMeal>(meals: T[], searchQuery: string, selectedDate: string | null): HistoryQueryResult<T> {
  const query = searchQuery.trim().toLocaleLowerCase();
  const searchResults = query ? meals.filter((meal) => meal.foodText.toLocaleLowerCase().includes(query)) : meals;
  const selectedDateResults = selectedDate ? meals.filter((meal) => meal.mealDate === selectedDate) : [];
  const datesWithMeals = new Set(meals.map((meal) => meal.mealDate));
  const mode = query ? 'search' as const : selectedDate ? 'date' as const : 'timeline' as const;
  return { searchResults, selectedDateResults, datesWithMeals, displayMeals: mode === 'search' ? searchResults : mode === 'date' ? selectedDateResults : meals, mode };
}

export function buildCalendarMonth(month: Date, datesWithMeals: Set<string>): CalendarDay[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1, 12).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0, 12).getDate();
  return Array.from({ length: 42 }, (_, index) => {
    const dayOffset = index - firstWeekday + 1;
    const date = new Date(year, monthIndex, dayOffset, 12);
    const dateKey = dateKeyFromParts(date.getFullYear(), date.getMonth(), date.getDate());
    return { date: dateKey, day: date.getDate(), inMonth: dayOffset >= 1 && dayOffset <= daysInMonth, hasMeals: datesWithMeals.has(dateKey) };
  });
}
