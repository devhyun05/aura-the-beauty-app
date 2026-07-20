import type {
  MakeupReportProductCategory,
  MakeupReportRecommendationTarget,
} from './makeupReportProductRecommendationTypes';

export type MakeupReportTargetSwatch = {
  hex: string;
  label?: string;
};

export type MakeupReportTargetPresentation = {
  label: string;
  detailLabel?: string;
  swatches: MakeupReportTargetSwatch[];
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const TARGET_TERM_LABELS: Record<string, string> = {
  balm: '밤',
  cream: '크림',
  gel: '젤',
  glow: '글로우',
  liquid: '리퀴드',
  matte: '매트',
  natural: '내추럴',
  pencil: '펜슬',
  powder: '파우더',
  satin: '새틴',
  sheer: '시어',
  shimmer: '쉬머',
  stick: '스틱',
  velvet: '벨벳',
};

function targetTermLabel(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return TARGET_TERM_LABELS[normalized.toLowerCase()] ?? normalized;
}

function uniqueText(values: Array<string | undefined>): string[] {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function buildMakeupReportTargetPresentation(
  category: MakeupReportProductCategory,
  target?: MakeupReportRecommendationTarget,
): MakeupReportTargetPresentation {
  const detailLabel = uniqueText([
    targetTermLabel(target?.finish),
    targetTermLabel(target?.texture),
  ]).join(' · ') || undefined;

  if (category === 'base') {
    return {
      label: '피니시·제형 기준',
      detailLabel,
      swatches: [],
    };
  }

  const rawColors = target?.colors?.length
    ? target.colors
    : target?.colorHex
      ? [{hex: target.colorHex, name: target.colorName}]
      : [];
  const seenHexes = new Set<string>();
  const swatches = rawColors.flatMap(color => {
    const normalizedHex = color.hex?.trim().toUpperCase();
    if (!normalizedHex || !HEX_COLOR_PATTERN.test(normalizedHex) || seenHexes.has(normalizedHex)) {
      return [];
    }
    seenHexes.add(normalizedHex);
    return [{hex: normalizedHex, label: color.name?.trim() || undefined}];
  });
  const colorLabels = uniqueText([
    ...swatches.map(color => color.label),
    target?.colorName,
  ]);

  return {
    label: colorLabels.slice(0, 3).join(' · ') || '보고서 추천 색상',
    detailLabel,
    swatches,
  };
}
