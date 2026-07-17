// 표시용 순수 함수 — RN·토큰 무의존(계약 러너가 plain node로 실행).
// 정직성: 세로 3분할 기준은 '이상 1:1:1'(측정 평균 아님), 길이비만 측정된 평균 밴드.

export interface ThirdsRatioView {
  upperLabel: string;
  middleLabel: string;
  lowerLabel: string;
  idealLabel: string;
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
    idealLabel: '이상 기준 1 : 1 : 1',
  };
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
