// 2층 시각 무게 지도 → S6 인상 섹션 프레젠테이션. 순수함수, RN·토큰 무의존
// (계약 러너가 plain node로 실행).
//
// 근거 부족(insufficient/coverage 0)이면 null을 반환해 섹션이 이 블록을 숨긴다 —
// 조용한 생성 금지: 근거 없이 "무게가 쏠렸다"를 지어내지 않는다.
// contrast→인상 매핑은 리서치 W-2(대비가 인상을 인과적으로 바꾼다) 근거.

import type {
  VisualWeightMap,
  VisualWeightRegion,
} from '../../shared/contracts/visualWeightMap';

// 프레젠테이션 타입은 여기(순수 파일)에 둔다 — reportTypes.ts가 이걸 import한다.
// 반대로 하면 reportTypes의 RN(React) 전이 의존이 계약 러너로 새어 들어온다.
export interface VisualWeightPresentationRegion {
  label: string;
  percent: number;
  dominant: boolean;
}
export interface VisualWeightPresentation {
  headline: string;
  contrastLine: string | null;
  regions: VisualWeightPresentationRegion[];
}

const REGION_LABEL: Record<VisualWeightRegion, string> = {
  brow: '눈썹',
  eye: '눈매',
  cheek: '볼',
  lip: '입술',
};

const REGION_ORDER: readonly VisualWeightRegion[] = ['eye', 'brow', 'cheek', 'lip'];

function contrastLine(level: VisualWeightMap['contrastLevel']): string | null {
  switch (level) {
    case 'high':
      return '이목구비 대비가 뚜렷해 또렷한 인상으로 읽혀요.';
    case 'low':
      return '이목구비 대비가 은은해 부드러운 인상으로 읽혀요.';
    case 'medium':
      return '이목구비 대비가 중간이라 균형 잡힌 인상이에요.';
    default:
      return null;
  }
}

export function buildVisualWeightPresentation(
  map: VisualWeightMap,
): VisualWeightPresentation | null {
  // 근거 부족이면 표시하지 않는다(over-claim 방지).
  if (map.coverage === 0 || map.dominantRegion === 'insufficient') {
    return null;
  }

  const regions = REGION_ORDER.filter(region => map.weights[region] != null)
    .map(region => ({
      label: REGION_LABEL[region],
      percent: Math.round((map.weights[region] ?? 0) * 100),
      dominant: map.dominantRegion === region,
    }))
    .sort((a, b) => b.percent - a.percent);

  const headline =
    map.dominantRegion === 'balanced'
      ? '이목구비에 시각 무게가 고르게 분포해요.'
      : `${REGION_LABEL[map.dominantRegion]}에 시각 무게가 실려 있어요.`;

  return {
    headline,
    contrastLine: contrastLine(map.contrastLevel),
    regions,
  };
}
