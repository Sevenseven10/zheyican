import type { Meal } from './domain/meal';
import { mealRepository, photoRepository } from './storage/index.web';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runWebBaselineTests() {
  await mealRepository.initialize();
  const initial = await mealRepository.listMeals();
  assert(initial.length === 2, 'Web development repository fixtures are unavailable');
  const created: Meal = {
    ...initial[0],
    id: 'web-session-created',
    foodText: '本次会话新增',
  };
  await mealRepository.createMeal(created);
  assert((await mealRepository.listMeals()).some((meal) => meal.id === created.id), 'Web development repository did not retain a session Meal');
  await mealRepository.updateMeal({ ...created, foodText: '本次会话修改' });
  assert((await mealRepository.listMeals()).find((meal) => meal.id === created.id)?.foodText === '本次会话修改', 'Web development repository did not update by Meal ID');

  let rejected = false;
  try { await photoRepository.ensurePhotoDirectory(); } catch { rejected = true; }
  assert(rejected, 'Web photo persistence must remain unavailable in Phase 2');
}

runWebBaselineTests().catch((error) => { throw error; });
