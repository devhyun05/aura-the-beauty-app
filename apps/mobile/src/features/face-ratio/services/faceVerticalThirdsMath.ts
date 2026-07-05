import type {
  FaceVerticalThirdsResult,
  VerticalThirdsDisplayRatio,
  VerticalThirdsDominantPart,
  VerticalThirdsKeypointMap,
  VerticalThirdsRatio,
} from '../types';
import {APPLE_HAIRLINE_FULL_CONFIDENCE, HAIRLINE_WARNING} from '../constants';

export const AVERAGE_DISPLAY_RATIO = {
  lower: 0.8,
  middle: 1.0,
  upper: 1.0,
} as const;

const DOMINANCE_THRESHOLD = 0.08;

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}

function getMinConfidence(keypoints: VerticalThirdsKeypointMap) {
  return Math.min(
    keypoints.H?.confidence ?? 0.6,
    keypoints.G?.confidence ?? 0,
    keypoints.Sn?.confidence ?? 0,
    keypoints.Me?.confidence ?? 0,
  );
}

function getHairlineRatioWarnings(keypoints: VerticalThirdsKeypointMap) {
  const hairline = keypoints.H;

  if (!hairline) {
    return [HAIRLINE_WARNING.unavailable];
  }

  if (hairline.provider === 'apple_semantic_matte') {
    return hairline.confidence >= APPLE_HAIRLINE_FULL_CONFIDENCE
      ? []
      : [HAIRLINE_WARNING.appleMatteLowConfidence];
  }

  return [HAIRLINE_WARNING.approximated];
}

export function calculateVerticalThirdsRatio(
  keypoints: VerticalThirdsKeypointMap,
): VerticalThirdsRatio {
  const {G, H, Me, Sn} = keypoints;

  if (!G || !Sn || !Me) {
    throw new Error('G, Sn, and Me keypoints are required for vertical thirds.');
  }

  const middlePx = Sn.y - G.y;
  const lowerPx = Me.y - Sn.y;
  const upperPx = H ? G.y - H.y : null;
  const totalPx = H ? Me.y - H.y : null;
  const displayRatio: VerticalThirdsDisplayRatio = {
    lower: roundRatio(lowerPx / middlePx),
    middle: 1.0,
    upper: upperPx === null ? null : roundRatio(upperPx / middlePx),
  };

  return {
    confidence: getMinConfidence(keypoints),
    displayRatio,
    lowerNormalized: totalPx ? roundRatio(lowerPx / totalPx) : null,
    lowerPx: roundRatio(lowerPx),
    middleNormalized: totalPx ? roundRatio(middlePx / totalPx) : null,
    middlePx: roundRatio(middlePx),
    totalPx: totalPx ? roundRatio(totalPx) : null,
    upperNormalized: totalPx && upperPx !== null ? roundRatio(upperPx / totalPx) : null,
    upperPx: upperPx === null ? null : roundRatio(upperPx),
    warnings: getHairlineRatioWarnings(keypoints),
  };
}

export function getAbnormalDisplayRatioWarnings(
  ratio: VerticalThirdsRatio,
): string[] {
  const values = [
    ratio.displayRatio.upper,
    ratio.displayRatio.middle,
    ratio.displayRatio.lower,
  ].filter((value): value is number => typeof value === 'number');

  return values.some(value => value < 0.5 || value > 1.8)
    ? ['vertical_thirds_ratio_out_of_range']
    : [];
}

type DominanceDelta = {
  delta: number;
  part: 'upper' | 'lower';
};

function getDominanceDeltas(ratio: VerticalThirdsRatio): DominanceDelta[] {
  const deltas: DominanceDelta[] = [];

  if (ratio.displayRatio.upper !== null) {
    deltas.push({
      delta: ratio.displayRatio.upper - AVERAGE_DISPLAY_RATIO.upper,
      part: 'upper',
    });
  }

  deltas.push({
    delta: ratio.displayRatio.lower - AVERAGE_DISPLAY_RATIO.lower,
    part: 'lower',
  });

  return deltas;
}

export function deriveDominantPart(
  ratio?: VerticalThirdsRatio,
): VerticalThirdsDominantPart {
  if (!ratio) {
    return 'unknown';
  }

  // 중안부(middle)가 기준(1.0)이므로 상/하안부의 평균 대비 편차로 판정한다.
  // 가장 큰 편차가 +면 그 부위가 길고, -면 상대적으로 중안부가 길어 보인다.
  const significantDeltas = getDominanceDeltas(ratio).filter(
    ({delta}) => Math.abs(delta) > DOMINANCE_THRESHOLD,
  );

  if (significantDeltas.length === 0) {
    return 'balanced';
  }

  const strongest = significantDeltas.reduce((current, candidate) =>
    Math.abs(candidate.delta) > Math.abs(current.delta) ? candidate : current,
  );

  return strongest.delta > 0 ? strongest.part : 'middle';
}

// 편차 크기를 사람이 읽을 강도 표현으로. 판정 문구를 편차에 따라 세분화한다.
function describeDeltaStrength(absDelta: number): string {
  if (absDelta >= 0.22) {
    return '뚜렷하게';
  }
  if (absDelta >= 0.14) {
    return '다소';
  }
  return '약간';
}

const PART_LABEL: Record<'upper' | 'lower', string> = {
  lower: '하안부(코 아래~턱 끝)',
  upper: '상안부(이마)',
};

function buildSuccessSummary(
  dominantPart: VerticalThirdsDominantPart,
  ratio?: VerticalThirdsRatio,
): string {
  const hasUpper = ratio?.displayRatio.upper !== null && ratio?.displayRatio.upper !== undefined;
  const upperExcludedNote = hasUpper
    ? ''
    : ' 헤어라인을 인식하지 못해 상안부는 판정에서 제외했어요.';
  const deltas = ratio ? getDominanceDeltas(ratio) : [];

  if (dominantPart === 'balanced') {
    return `상·중·하안 비율이 평균 기준에 고르게 가깝게 잡혔어요.${upperExcludedNote}`;
  }

  if (dominantPart === 'upper' || dominantPart === 'lower') {
    const partDelta = deltas.find(({part}) => part === dominantPart);
    const strength = describeDeltaStrength(Math.abs(partDelta?.delta ?? 0));

    return `${PART_LABEL[dominantPart]}가 평균보다 ${strength} 긴 편이에요.${upperExcludedNote}`;
  }

  if (dominantPart === 'middle') {
    const shortDeltas = deltas.filter(({delta}) => delta < -DOMINANCE_THRESHOLD);
    const strongestShort = shortDeltas.reduce<DominanceDelta | null>(
      (current, candidate) =>
        !current || Math.abs(candidate.delta) > Math.abs(current.delta)
          ? candidate
          : current,
      null,
    );
    const shortPartLabel = strongestShort?.part === 'upper' ? '상안부' : '하안부';
    const strength = describeDeltaStrength(Math.abs(strongestShort?.delta ?? 0));

    return `${shortPartLabel}가 평균보다 ${strength} 짧아 중안부가 상대적으로 길어 보여요.${upperExcludedNote}`;
  }

  return `이마 기준선은 근사값으로 표시돼요.${upperExcludedNote}`;
}

export function buildInterpretation(
  status: FaceVerticalThirdsResult['status'],
  ratio?: VerticalThirdsRatio,
) {
  const dominantPart = deriveDominantPart(ratio);

  if (status === 'blocked') {
    return {
      dominantPart: 'unknown' as const,
      summary: '정면 얼굴 기준선을 안정적으로 잡지 못했어요. 다시 촬영해 주세요.',
      title: '얼굴 세로 비율 분석',
    };
  }

  if (status === 'failed') {
    return {
      dominantPart: 'unknown' as const,
      summary: '분석 중 오류가 발생했어요. 다시 촬영해 주세요.',
      title: '얼굴 세로 비율 분석',
    };
  }

  return {
    dominantPart,
    summary: buildSuccessSummary(dominantPart, ratio),
    title: '얼굴 세로 비율 분석',
  };
}
