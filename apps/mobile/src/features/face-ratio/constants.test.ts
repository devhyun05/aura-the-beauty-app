import {
  FACE_LENGTH_GAUGE,
  FACE_LENGTH_REFERENCE,
  FACE_RATIO_JUDGMENT_VERSION,
  getFaceLengthTitle,
  getGaugeMarkerPercent,
  judgeFaceLength,
} from './constants';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function near(actual: number, expected: number, tolerance = 1e-9) {
  return Math.abs(actual - expected) <= tolerance;
}

export function runFaceRatioConstantsTests() {
  // ── 파생 불변식: 게이지 3등분 경계 == 판정 경계 (4중 하드코딩 재발 방지) ──
  expect(
    near(getGaugeMarkerPercent(FACE_LENGTH_REFERENCE.wide), 100 / 3, 1e-6),
    'Gauge segment boundary must coincide with the wide judgment bound at 1/3.',
  );
  expect(
    near(getGaugeMarkerPercent(FACE_LENGTH_REFERENCE.long), 200 / 3, 1e-6),
    'Gauge segment boundary must coincide with the long judgment bound at 2/3.',
  );
  expect(
    getGaugeMarkerPercent(FACE_LENGTH_GAUGE.min) === 0 &&
      getGaugeMarkerPercent(FACE_LENGTH_GAUGE.max) === 100,
    'Gauge scale endpoints must map to 0%/100%.',
  );
  expect(
    getGaugeMarkerPercent(FACE_LENGTH_GAUGE.min - 1) === 0 &&
      getGaugeMarkerPercent(FACE_LENGTH_GAUGE.max + 1) === 100,
    'Out-of-scale ratios must clamp to the gauge ends.',
  );

  // ── 동적 유보 구간: 정면 촬영은 단정, 경계 근처 + pose는 유보 ──
  const frontalWide = judgeFaceLength(1.3, 0, 0);
  expect(frontalWide.verdict === 'wide', 'Frontal 1.30 must judge wide.');
  expect(
    near(frontalWide.band.lo, 1.3) && near(frontalWide.band.hi, 1.3),
    'Frontal shot must collapse the band to the measured ratio.',
  );
  expect(
    judgeFaceLength(FACE_LENGTH_REFERENCE.average, 0, 0).verdict === 'average',
    'Frontal reference-average must judge average.',
  );
  expect(judgeFaceLength(1.52, 0, 0).verdict === 'long', 'Frontal 1.52 must judge long.');

  // pitch는 세로 압축 → 참값 상한 = m/cos(pitch): 1.50이 pitch 12°면 long 경계를 걸침
  const pitchBorder = judgeFaceLength(1.5, 12, 0);
  expect(
    pitchBorder.verdict === 'borderline_long',
    'Ratio 1.50 at pitch 12deg must be borderline_long (band crosses 1.506).',
  );
  expect(
    pitchBorder.band.hi > FACE_LENGTH_REFERENCE.long &&
      pitchBorder.band.lo < FACE_LENGTH_REFERENCE.long,
    'Borderline band must straddle the long bound.',
  );

  // yaw는 가로 압축 → 참값 하한 = m×cos(yaw): 1.355가 yaw 8°면 wide 경계를 걸침
  expect(
    judgeFaceLength(1.355, 0, 8).verdict === 'borderline_wide',
    'Ratio 1.355 at yaw 8deg must be borderline_wide (band crosses 1.351).',
  );

  // 게이트 최악(pitch 12/yaw 8)에서도 중앙값은 단정 유지 (usability 회귀 방지)
  expect(
    judgeFaceLength(FACE_LENGTH_REFERENCE.average, 12, 8).verdict === 'average',
    'Reference average must stay a confident verdict even at worst gated pose.',
  );

  // pose 결측/비유한값은 정면 취급 (fail-open 아님 — 구간이 0으로 수렴할 뿐)
  expect(
    judgeFaceLength(1.3, undefined, Number.NaN).verdict === 'wide',
    'Missing/non-finite pose must fall back to a zero-width band.',
  );

  // ── 제목 매핑: 유보 2종 포함 전 verdict 커버 ──
  expect(
    getFaceLengthTitle('wide') === '가로형 얼굴' &&
      getFaceLengthTitle('borderline_wide') === '가로형과 평균 사이' &&
      getFaceLengthTitle('average') === '평균에 가까운 얼굴' &&
      getFaceLengthTitle('borderline_long') === '평균과 세로형 사이' &&
      getFaceLengthTitle('long') === '세로로 긴 얼굴',
    'Every verdict must map to its title, including the two borderline forms.',
  );

  // ── 판정 버전: 상수 개정 감지용 스냅샷 문자열 존재 ──
  expect(
    FACE_RATIO_JUDGMENT_VERSION.length > 0 &&
      FACE_RATIO_JUDGMENT_VERSION.includes('face-length-judgment'),
    'Judgment version tag must exist for result snapshotting.',
  );
}

runFaceRatioConstantsTests();
console.log('constants.test.ts passed');
