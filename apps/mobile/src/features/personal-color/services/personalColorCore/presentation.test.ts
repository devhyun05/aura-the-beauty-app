import {
  getAxisBandPresentation,
  getMeasuredPersonalColorSummary,
  getPaletteRangePresentation,
} from './presentation';
import type {AuraPersonalColorResult, PaletteItem} from './contracts';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const summerTrue = {
  axes: {
    temperature: {value: -0.5},
    value: {value: -0.5},
    chroma: {value: -0.4},
  },
  tone: {top: 'summer_true'},
} as Pick<AuraPersonalColorResult, 'axes' | 'tone'>;

const coolLightClear = {
  family: {
    chromaBand: 'clear',
    undertone: 'cool',
    valueBand: 'light',
  },
} as Pick<PaletteItem, 'family'>;

expectEqual(
  getMeasuredPersonalColorSummary(summerTrue).personalColor,
  '여름 쿨 트루',
  'true label has no parentheses',
);
expectEqual(
  getMeasuredPersonalColorSummary(summerTrue).toneSummary,
  '쿨 · 밝은 색 · 부드러운 색',
  'summary is derived from measured axes',
);
expectEqual(
  getAxisBandPresentation('value', -0.5).labelKo,
  '밝은 색',
  'light value uses explanatory wording',
);
expectEqual(
  getPaletteRangePresentation(coolLightClear).labelKo,
  '쿨 · 밝은 색 · 맑은 색',
  'palette combines independent axis explanations',
);
