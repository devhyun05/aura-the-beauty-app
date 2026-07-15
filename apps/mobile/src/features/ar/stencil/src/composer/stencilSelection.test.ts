import type {StencilParams} from '../bridge/types';
import {enableAllStencilRegions} from './stencilSelection';

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const base: StencilParams = {
  opacity: 0.42,
  lips: false,
  brows: true,
  eyeshadow: false,
  eyeliner: false,
  aegyo: false,
  blush: false,
  highlighter: false,
  contour: false,
  pulse: false,
  dash: true,
};

const selected = enableAllStencilRegions(base);

for (const key of [
  'lips',
  'brows',
  'eyeshadow',
  'eyeliner',
  'aegyo',
  'blush',
  'highlighter',
  'contour',
] as const) {
  expect(selected[key], `전체 가이드는 ${key} 부위를 켜야 한다`);
}

expect(selected.opacity === base.opacity, '전체 선택은 가이드 농도를 보존해야 한다');
expect(selected.pulse === base.pulse, '전체 선택은 호흡 효과를 보존해야 한다');
expect(selected.dash === base.dash, '전체 선택은 점선 효과를 보존해야 한다');

console.log('all stencil region selection passed');
