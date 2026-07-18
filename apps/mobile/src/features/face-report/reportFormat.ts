// 표시용 순수 함수 — RN·토큰 무의존(계약 러너가 plain node로 실행).
// 정직성: 세로 3분할 기준은 '이상 1:1:1'(측정 평균 아님), 길이비만 측정된 평균 밴드.

export interface ThirdsRatioView {
  upperLabel: string;
  middleLabel: string;
  lowerLabel: string;
  // 정직화: '이상 기준'이 아니라 '고전 미학 캔온일 뿐'이라는 교육 맥락 라벨.
  contextLabel: string;
}

function num2(n: number | null): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(2);
}

export function formatThirdsRatio(r: {
  upper: number | null;
  middle: number;
  lower: number;
}): ThirdsRatioView {
  return {
    upperLabel: num2(r.upper),
    middleLabel: num2(r.middle),
    lowerLabel: num2(r.lower),
    // 정직성: 균등 1:1:1은 다빈치 신고전 미학 캔온이지 실측 평균/이상이 아니다
    // (실제 얼굴 대부분이 벗어남). 목표 프레임을 교육 맥락으로 전환.
    contextLabel: '1:1:1은 고전 미학 기준일 뿐, 실제 얼굴 대부분은 벗어나요',
  };
}

// 세로 3분할을 자기 내부 비교(중안부=1.0 기준)로 서술한다. 외부 '이상치' 없이
// 가장 두드러진 편차 부위를 한 문장으로 — faceVerticalThirdsMath가 이미 채택한
// self-comparison 철학과 정합. 모두 임계(8%) 이내면 균형으로 서술한다.
export function describeThirdsInternally(r: {
  upper: number | null;
  middle: number;
  lower: number;
}): string {
  const TH = 0.08;
  const m = r.middle > 0 ? r.middle : 1;
  const rel = (v: number) => v / m - 1;
  const cands: {part: string; region: string; d: number}[] = [];
  if (r.upper != null && Number.isFinite(r.upper)) {
    cands.push({part: '상안부', region: '이마·눈', d: rel(r.upper)});
  }
  if (Number.isFinite(r.lower)) {
    cands.push({part: '하안부', region: '입·턱', d: rel(r.lower)});
  }
  const top = cands
    .filter(c => Math.abs(c.d) > TH)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  if (!top) {
    return '세 구획이 고르게 나뉘어 균형 잡힌 편이에요';
  }
  const pct = Math.round(Math.abs(top.d) * 100);
  const shorter = top.d < 0;
  return `${top.part}가 중안부보다 ${pct}% ${shorter ? '짧아' : '길어'}, ${top.region} 구간이 상대적으로 ${shorter ? '짧게' : '길게'} 보여요`;
}

// 길이비 표현 — 게이지(가짜 '평균') 폐기, 성별 문헌 참고선 기준 방향 카테고리.
export type FaceShapeGender = 'men' | 'women' | 'neutral';

// 세로:가로 참고선 — 성형외과 문헌 이상형(남 ≈1.35 / 여 ≈1.31). 절대 기준이 아니라
// 방향 카테고리의 '균형 중심'으로만 쓴다(중립=중간값). 황금비 1.6은 신화라 미채택.
const FACE_SHAPE_CENTER: Record<FaceShapeGender, number> = {men: 1.35, women: 1.31, neutral: 1.33};
const FACE_SHAPE_BAND = 0.07; // 중심 ± 이 안이면 '균형'

export interface FaceShapeView {
  categoryLabel: string; // 가로형 / 균형 / 세로형
  position: number;      // 0..1 방향 스케일 위치(0=가로, 1=세로)
  sentence: string;      // 맞춤 한 문장(스타일링 힌트 포함)
  referenceNote: string; // 성별 참고선·황금비 신화·절대기준 아님 고지
}

// 측정된 세로:가로 비율을 성별 참고선 기준으로 방향 카테고리화한다. 모집단 '평균'을
// 참칭하지 않고(밴드=참고 중심±), 사용자 원측정 숫자도 노출하지 않는다(카테고리만).
export function describeFaceLength(
  ratio: number | null,
  gender: FaceShapeGender,
): FaceShapeView | null {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) {
    return null;
  }
  const center = FACE_SHAPE_CENTER[gender];
  const lo = center - FACE_SHAPE_BAND;
  const hi = center + FACE_SHAPE_BAND;
  const span = FACE_SHAPE_BAND * 3;
  const position = Math.max(0, Math.min(1, (ratio - (center - span)) / (2 * span)));
  const genderKo = gender === 'men' ? '남성' : gender === 'women' ? '여성' : '일반';
  let categoryLabel: string;
  let sentence: string;
  if (ratio < lo) {
    categoryLabel = '가로형에 가까운 얼굴';
    sentence = `${genderKo} 얼굴 참고형보다 가로가 넓은 편이라 부드럽고 안정적인 인상이에요. 세로 라인(긴 앞머리·세로 눈썹)이 균형을 더해줘요.`;
  } else if (ratio > hi) {
    categoryLabel = '세로로 긴 얼굴';
    sentence = `${genderKo} 얼굴 참고형보다 세로가 긴 편이라 갸름하고 시원한 인상이에요. 가로 볼륨(사이드 헤어·수평 눈썹)이 균형을 더해줘요.`;
  } else {
    categoryLabel = '세로·가로가 균형';
    sentence = `${genderKo} 얼굴 참고형에 가까워 세로·가로가 고르게 균형 잡힌 편이에요. 대부분의 헤어·메이크업 방향이 무난하게 어울려요.`;
  }
  const referenceNote = `기준: ${genderKo} 얼굴 참고선(성형외과 문헌) · 흔히 말하는 황금비(1.6)는 실제 얼굴 대부분이 못 미쳐 절대 기준이 아니에요`;
  return {categoryLabel, position, sentence, referenceNote};
}

export interface SeasonConfidenceView {
  percentLabel: string;
  gapLabel: string | null;
}

export function formatSeasonConfidence(input: {
  topLabel: string;
  secondaryLabel: string | null;
  typeScore: number;
}): SeasonConfidenceView {
  const clamped = Math.max(0, Math.min(1, input.typeScore));
  const pct = Math.round(clamped * 100);
  return {
    percentLabel: `${input.topLabel} ${pct}%`,
    gapLabel: input.secondaryLabel ? `2순위 ${input.secondaryLabel}` : null,
  };
}
