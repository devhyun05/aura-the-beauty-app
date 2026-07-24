import {getVerticalThirdsPhotoAspectRatio} from './verticalThirdsDisplayGeometry';

function assert(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${label}`);
  }
}

function assertClose(actual: number, expected: number, label: string): void {
  assert(Math.abs(actual - expected) < Number.EPSILON, label);
}

assertClose(
  getVerticalThirdsPhotoAspectRatio({height: 1440, width: 1080}),
  3 / 4,
  '3:4 capture keeps its source aspect ratio',
);
assertClose(
  getVerticalThirdsPhotoAspectRatio({height: 5, width: 4}),
  4 / 5,
  '4:5 capture keeps its source aspect ratio',
);
assertClose(
  getVerticalThirdsPhotoAspectRatio({height: 16, width: 9}),
  9 / 16,
  '9:16 capture keeps its source aspect ratio',
);

for (const sourceImage of [
  {height: 0, width: 1080},
  {height: 1440, width: 0},
  {height: Number.NaN, width: 1080},
]) {
  let threw = false;
  try {
    getVerticalThirdsPhotoAspectRatio(sourceImage);
  } catch {
    threw = true;
  }
  assert(threw, 'invalid source dimensions must not create a fallback frame');
}

// eslint-disable-next-line no-console
console.log('verticalThirdsDisplayGeometry.test.ts OK');
