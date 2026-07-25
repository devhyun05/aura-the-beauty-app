import type {
  FaceVerticalThirdsResult,
  VerticalThirdsDisplayRatio,
  VerticalThirdsDominantPart,
  VerticalThirdsKeypointMap,
  VerticalThirdsRatio,
} from '../types';
import {APPLE_HAIRLINE_FULL_CONFIDENCE, HAIRLINE_WARNING} from '../constants';

// Phase 0-3 (2026-07-17): 종전 AVERAGE_DISPLAY_RATIO(1:1:0.8) 기준 판정을
// 폐기하고 자기 얼굴 내부 비교(각 부위 vs 중안부=1.0)로 전환했다.
// 0.8은 실측 평균이 아니라 한국 성형광고 파생 관행값으로 확인됨
// (계획 §0-3·§5 D-3: 실측은 하안부/중안부 ≈ 1.0~1.2 — 한국 20대 여성 1.0).
// 기준 인구값 없이 성립하는 부위 간 직접 비교가 글로벌 전제(원칙 5)와 정합.
const DOMINANCE_THRESHOLD = 0.08;
// 부동소수점 방어: 1.08−1.0=0.08000000000000007 > 0.08 이지만
// |0.92−1.0|=0.07999999999999996 < 0.08 — 명목상 같은 경계가 방향에 따라
// 비대칭 처리되는 것을 epsilon으로 대칭화한다(정확히 ±0.08은 both 미유의).
const DOMINANCE_EPSILON = 1e-9;

function isSignificantDelta(delta: number): boolean {
  return Math.abs(delta) > DOMINANCE_THRESHOLD + DOMINANCE_EPSILON;
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}

function getMinConfidence(keypoints: VerticalThirdsKeypointMap) {
  const required = [keypoints.G, keypoints.Sn, keypoints.Me];
  const measured = keypoints.H ? [...required, keypoints.H] : required;

  return Math.min(...measured.map(keypoint => keypoint?.confidence ?? 0));
}

function getHairlineRatioWarnings(keypoints: VerticalThirdsKeypointMap) {
  const hairline = keypoints.H;

  if (!hairline) {
    return [HAIRLINE_WARNING.unavailable];
  }

  if (
    hairline.provider === 'apple_semantic_matte' ||
    hairline.provider === 'mediapipe_hairline_boundary' ||
    hairline.provider === 'face_parsing'
  ) {
    return hairline.confidence >= APPLE_HAIRLINE_FULL_CONFIDENCE
      ? []
      : [HAIRLINE_WARNING.lowConfidence];
  }

  return [HAIRLINE_WARNING.proxyRejected];
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

// 자기내부 비교: displayRatio는 중안부=1.0 정규화이므로, 각 부위의
// (비율 − 1.0)이 곧 "중안부 대비 얼마나 긴가"다. 인구 기준 불요.
function getDominanceDeltas(ratio: VerticalThirdsRatio): DominanceDelta[] {
  const deltas: DominanceDelta[] = [];

  if (ratio.displayRatio.upper !== null) {
    deltas.push({
      delta: ratio.displayRatio.upper - 1.0,
      part: 'upper',
    });
  }

  deltas.push({
    delta: ratio.displayRatio.lower - 1.0,
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

  // H가 없는 결과는 중안부:하안부 2구간 측정이다. 상안부를 추론하지 않고
  // 두 실측 구간 사이의 상대 길이만 판정한다.
  if (ratio.displayRatio.upper === null) {
    const lowerDelta = ratio.displayRatio.lower - ratio.displayRatio.middle;
    if (!isSignificantDelta(lowerDelta)) {
      return 'balanced';
    }
    return lowerDelta > 0 ? 'lower' : 'middle';
  }

  // 중안부(1.0)를 기준으로 상/하안부와 직접 비교한다(자기내부 서술).
  // 가장 큰 편차가 +면 그 부위가 길고, -면 상대적으로 중안부가 길어 보인다.
  const significantDeltas = getDominanceDeltas(ratio).filter(({delta}) =>
    isSignificantDelta(delta),
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

  if (!hasUpper && ratio) {
    const lowerToMiddle = ratio.displayRatio.lower;

    if (lowerToMiddle > 1.08) {
      return '하안부가 중안부보다 긴 편으로 측정됐어요. 헤어라인이 충분히 확인되지 않아 상안부는 반영하지 않았어요.';
    }

    if (lowerToMiddle < 0.92) {
      return '중안부가 하안부보다 긴 편으로 측정됐어요. 헤어라인이 충분히 확인되지 않아 상안부는 반영하지 않았어요.';
    }

    return '중안부와 하안부 길이가 비슷하게 측정됐어요. 헤어라인이 충분히 확인되지 않아 상안부는 반영하지 않았어요.';
  }

  const deltas = ratio ? getDominanceDeltas(ratio) : [];

  if (dominantPart === 'balanced') {
    return '상·중·하안부 길이가 서로 비슷하게 잡혔어요.';
  }

  if (dominantPart === 'upper' || dominantPart === 'lower') {
    const partDelta = deltas.find(({part}) => part === dominantPart);
    const strength = describeDeltaStrength(Math.abs(partDelta?.delta ?? 0));

    return `${PART_LABEL[dominantPart]}가 중안부보다 ${strength} 긴 편이에요.`;
  }

  if (dominantPart === 'middle') {
    const shortDeltas = deltas.filter(
      ({delta}) => delta < 0 && isSignificantDelta(delta),
    );
    const strongestShort = shortDeltas.reduce<DominanceDelta | null>(
      (current, candidate) =>
        !current || Math.abs(candidate.delta) > Math.abs(current.delta)
          ? candidate
          : current,
      null,
    );
    if (!strongestShort) {
      return '중안부가 상대적으로 길어 보여요.';
    }

    const shortPartLabel = strongestShort.part === 'upper' ? '상안부' : '하안부';
    const strength = describeDeltaStrength(Math.abs(strongestShort.delta));

    return `${shortPartLabel}가 중안부보다 ${strength} 짧아 중안부가 상대적으로 길어 보여요.`;
  }

  return '중안부와 하안부만 비교했어요.';
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
