import {TYPE_LABEL_KO} from './constants';
import type {
  AuraPersonalColorResult,
  AxisName,
  PaletteItem,
} from './contracts';

export type AxisBandPresentation = {
  end: number;
  key: 'low' | 'mid' | 'high';
  labelKo: string;
  start: number;
};

const AXIS_BANDS: Record<AxisName, readonly AxisBandPresentation[]> = {
  temperature: [
    {key: 'low', labelKo: '쿨', start: -1, end: -1 / 3},
    {key: 'mid', labelKo: '뉴트럴', start: -1 / 3, end: 1 / 3},
    {key: 'high', labelKo: '웜', start: 1 / 3, end: 1},
  ],
  value: [
    {key: 'low', labelKo: '밝은 색', start: -1, end: -1 / 3},
    {key: 'mid', labelKo: '중간 밝기', start: -1 / 3, end: 1 / 3},
    {key: 'high', labelKo: '깊은 색', start: 1 / 3, end: 1},
  ],
  chroma: [
    {key: 'low', labelKo: '부드러운 색', start: -1, end: -1 / 3},
    {key: 'mid', labelKo: '맑은 색', start: -1 / 3, end: 1 / 3},
    {key: 'high', labelKo: '선명한 색', start: 1 / 3, end: 1},
  ],
  clarity: [
    {key: 'low', labelKo: '소프트', start: -1, end: -1 / 3},
    {key: 'mid', labelKo: '균형', start: -1 / 3, end: 1 / 3},
    {key: 'high', labelKo: '클리어', start: 1 / 3, end: 1},
  ],
  contrast: [
    {key: 'low', labelKo: '저대비', start: -1, end: -1 / 3},
    {key: 'mid', labelKo: '균형', start: -1 / 3, end: 1 / 3},
    {key: 'high', labelKo: '고대비', start: 1 / 3, end: 1},
  ],
};

const PALETTE_LABELS = {
  chroma: {clear: '맑은 색', soft: '부드러운 색', vivid: '선명한 색'},
  undertone: {cool: '쿨', neutral: '뉴트럴', warm: '웜'},
  value: {deep: '깊은 색', light: '밝은 색', mid: '중간 밝기'},
} as const;

export function getAxisBandPresentation(
  axis: AxisName,
  value: number | null,
): AxisBandPresentation {
  const [low, mid, high] = AXIS_BANDS[axis];

  if (value === null || value >= mid.start && value <= mid.end) {
    return mid;
  }

  return value < mid.start ? low : high;
}

export function getMeasuredPersonalColorSummary(
  result: Pick<AuraPersonalColorResult, 'axes' | 'tone'>,
) {
  const tone = result.tone;

  if (!tone) {
    return {personalColor: '측정하지 못했어요', toneSummary: '측정하지 못했어요'};
  }

  return {
    personalColor: TYPE_LABEL_KO[tone.top],
    toneSummary: [
      getAxisBandPresentation('temperature', result.axes.temperature.value).labelKo,
      getAxisBandPresentation('value', result.axes.value.value).labelKo,
      getAxisBandPresentation('chroma', result.axes.chroma.value).labelKo,
    ].join(' · '),
  };
}

export function getPaletteRangePresentation(item: Pick<PaletteItem, 'family'>) {
  const {family} = item;

  return {
    examples: family.exemplars ?? [],
    labelKo: [
      PALETTE_LABELS.undertone[family.undertone],
      PALETTE_LABELS.value[family.valueBand],
      PALETTE_LABELS.chroma[family.chromaBand],
    ].join(' · '),
  };
}
