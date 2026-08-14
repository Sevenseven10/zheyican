import { getMealPhotoLayout as getNativeMealPhotoLayout } from './photoLayout';
import { getMealPhotoLayout as getWebMealPhotoLayout } from './platform/layout.web';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const closeTo = (actual: number, expected: number, message: string) => {
  assert(Math.abs(actual - expected) < 0.0001, `${message}: expected ${expected}, received ${actual}`);
};

const width = 350;
const nativeHeights = [266, 203, 252, 274.1, 252, 199.93333333333334];
const webHeights = [266, 231, 231, 231, 231, 231];

for (let count = 1; count <= 6; count += 1) {
  const nativeLayout = getNativeMealPhotoLayout(count, width);
  const webLayout = getWebMealPhotoLayout(count, width);
  closeTo(nativeLayout.height, nativeHeights[count - 1], `${count}-photo Native height changed`);
  closeTo(webLayout.height, webHeights[count - 1], `${count}-photo Web visual weight changed`);
  assert(webLayout.frames.length === count, `${count}-photo Web frame count changed`);
  webLayout.frames.forEach((frame) => {
    assert(frame.left >= 0 && frame.top >= 0, `${count}-photo Web frame escaped its origin`);
    assert(frame.left + frame.width <= width + 0.0001, `${count}-photo Web frame escaped container width`);
    assert(frame.top + frame.height <= webLayout.height + 0.0001, `${count}-photo Web frame escaped container height`);
  });
}

const twoPhotoHeight = getWebMealPhotoLayout(2, width).height;
const threePhotoHeight = getWebMealPhotoLayout(3, width).height;
closeTo(twoPhotoHeight, threePhotoHeight, '2-photo and 3-photo Web blocks no longer carry equal visual weight');

console.log('web photo layout tests passed');
