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

export type FaceLengthBandView =
  | {kind: 'withheld'; label: string}
  | {
      kind: 'band';
      position: number; // 내 위치 0..1
      loFrac: number;    // 밴드 시작 0..1
      hiFrac: number;    // 밴드 끝 0..1
      verdictLabel: string;
      inBand: boolean;
    };

const VERDICT_LABEL: Record<string, string> = {
  wide: '가로 폭이 있는 편',
  borderline_wide: '가로가 경계선',
  average: '평균 범위',
  borderline_long: '세로가 경계선',
  long: '세로로 긴 편',
  indeterminate: '판정 보류',
};

export function resolveFaceLengthBand(input: {
  ratio: number | null;
  band: {lo: number; hi: number} | null;
  verdict: string | null;
  confidence: number | null;
}): FaceLengthBandView {
  const {ratio, band, verdict, confidence} = input;
  const lowConfidence = confidence != null && confidence < 0.5;
  if (
    ratio == null ||
    band == null ||
    verdict == null ||
    verdict === 'indeterminate' ||
    lowConfidence
  ) {
    return {kind: 'withheld', label: VERDICT_LABEL.indeterminate};
  }
  const pad = (band.hi - band.lo) * 0.8 || 0.1;
  const min = band.lo - pad;
  const max = band.hi + pad;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return {
    kind: 'band',
    position: clamp01((ratio - min) / (max - min)),
    loFrac: clamp01((band.lo - min) / (max - min)),
    hiFrac: clamp01((band.hi - min) / (max - min)),
    verdictLabel: VERDICT_LABEL[verdict] ?? verdict,
    inBand: ratio >= band.lo && ratio <= band.hi,
  };
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
