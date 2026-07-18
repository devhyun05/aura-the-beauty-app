import {ALL_COLOR_FAMILIES, buildPalette, getColorFamilyReference} from './palette';
import type {AuraAxis, AxisName} from './contracts';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

expect(ALL_COLOR_FAMILIES.length === 27, 'all 27 color families must exist');

for (const family of ALL_COLOR_FAMILIES) {
  const reference = getColorFamilyReference(family);
  expect(family.exemplars.length === 3, `${family.id} must have three exemplars`);
  expect(reference.exemplars.every(Boolean), `${family.id} exemplar names must not be empty`);
  expect(/^#[0-9A-F]{6}$/i.test(reference.hex), `${family.id} must have a valid reference color`);
}

const axis = (value: number): AuraAxis => ({
  basis: 'within-frame-relative',
  confidence: 1,
  floored: false,
  value,
});
const axes: Record<AxisName, AuraAxis> = {
  temperature: axis(0.7),
  value: axis(-0.7),
  chroma: axis(0.5),
  clarity: axis(0.5),
  contrast: axis(0),
};
const palette = buildPalette(axes);

expect(palette.best.length >= 4, 'best palette must provide at least four choices');
expect(palette.worst.length === 4, 'worst palette must provide four choices');
expect(
  [...palette.best, ...palette.worst].every(item => item.noteKo.trim().length > 0),
  'every palette item must explain how to use the color family',
);
expect(
  [...palette.best, ...palette.worst].every(item => item.reasons.length > 0 && item.reasons.every(reason => reason.noteKo.trim().length > 0)),
  'every palette item must include readable selection reasons',
);
