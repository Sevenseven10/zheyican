export type MealType = '早餐' | '午餐' | '晚餐' | '加餐';

export type PhotoDimensions = { width: number; height: number };

export type PhotoComposition = {
  uri: string;
  originalWidth: number;
  originalHeight: number;
  rotation?: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type Meal = {
  id: string;
  createdAt: string;
  mealDate: string;
  mealTime: string;
  mealType: MealType;
  photos: PhotoComposition[];
  foodText: string;
  note: string | null;
};
