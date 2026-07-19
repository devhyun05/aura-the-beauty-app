// 실행: scripts/mobile/run-face-geometry-contract.mjs (tsc → node)
// 합성 랜드마크 기지값 검증 — personalColorCore 계약 테스트와 같은 plain-script.
import {
  collectMissingIndices,
  computeFaceGeometryMetrics,
  createUnavailableFaceGeometryMetrics,
  rotatePixelLandmarkMap,
  toPixelLandmarkMap,
  type PixelLandmarkMap,
  type PixelPoint,
} from './faceGeometryMath';
import {
  BROW_CORE_LEFT_INDICES,
  BROW_CORE_RIGHT_INDICES,
  BROW_UPPER_EDGE_LEFT_INDICES,
  BROW_UPPER_EDGE_RIGHT_INDICES,
  CANTHAL_TANGENT_INDICES,
  FACE_GEOMETRY_LANDMARK_INDICES,
  FACE_GEOMETRY_REQUIRED_INDICES,
} from './landmarkIndices';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../types';

const IDX = FACE_GEOMETRY_LANDMARK_INDICES;

function fail(label: string, detail: string): never {
  throw new Error(`${label}: ${detail}`);
}

function expectClose(
  actual: number | null,
  expected: number,
  label: string,
  epsilon = 1e-3,
): void {
  if (actual === null) {
    fail(label, `expected ~${expected}, got null`);
  }
  if (Math.abs(actual - expected) > epsilon) {
    fail(label, `expected ~${expected}, got ${actual}`);
  }
}

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    fail(label, `expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectSameArray(
  actual: readonly unknown[],
  expected: readonly unknown[],
  label: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// 피사체 기준 합성 정면 얼굴(픽셀). subjectRight = 이미지 왼쪽(x 작음).
function buildBaseMap(): PixelLandmarkMap {
  const map: PixelLandmarkMap = new Map<number, PixelPoint>();

  map.set(IDX.faceWidthRight, {x: 300, y: 500});
  map.set(IDX.faceWidthLeft, {x: 700, y: 500});

  map.set(IDX.eyeOuterRight, {x: 380, y: 400});
  map.set(IDX.eyeInnerRight, {x: 460, y: 400});
  map.set(IDX.eyeInnerLeft, {x: 540, y: 400});
  map.set(IDX.eyeOuterLeft, {x: 620, y: 400});

  map.set(IDX.eyeUpperLidRight, {x: 420, y: 390});
  map.set(IDX.eyeLowerLidRight, {x: 420, y: 410});
  map.set(IDX.eyeUpperLidLeft, {x: 580, y: 390});
  map.set(IDX.eyeLowerLidLeft, {x: 580, y: 410});

  // 외안각 상/하 접선점(수렴각용) — 외안각과 상연/하연 점 사이 좁은 눈꼬리 타입.
  map.set(CANTHAL_TANGENT_INDICES.upperRight, {x: 400, y: 393});
  map.set(CANTHAL_TANGENT_INDICES.lowerRight, {x: 400, y: 407});
  map.set(CANTHAL_TANGENT_INDICES.upperLeft, {x: 600, y: 393});
  map.set(CANTHAL_TANGENT_INDICES.lowerLeft, {x: 600, y: 407});

  map.set(IDX.mouthCornerRight, {x: 430, y: 600});
  map.set(IDX.mouthCornerLeft, {x: 570, y: 600});

  map.set(IDX.upperLipOuterTop, {x: 500, y: 580});
  map.set(IDX.upperLipInnerBottom, {x: 500, y: 592});
  map.set(IDX.lowerLipInnerTop, {x: 500, y: 596});
  map.set(IDX.lowerLipOuterBottom, {x: 500, y: 612});

  map.set(IDX.jawRight, {x: 340, y: 650});
  map.set(IDX.jawLeft, {x: 660, y: 650});
  map.set(IDX.lowerJawRight, {x: 420, y: 720});
  map.set(IDX.lowerJawLeft, {x: 580, y: 720});

  // 눈썹 링: 하연 y=360 / 상연 y=340 의 평평한 두 줄 (slope 0).
  const rightXs = [380, 400, 420, 440, 460];
  const leftXs = [540, 560, 580, 600, 620];
  BROW_CORE_RIGHT_INDICES.forEach((index, i) => {
    map.set(index, {x: rightXs[i % 5], y: i < 5 ? 360 : 340});
  });
  BROW_CORE_LEFT_INDICES.forEach((index, i) => {
    map.set(index, {x: leftXs[i % 5], y: i < 5 ? 360 : 340});
  });

  return map;
}

// ── 1. 기지값: 대칭 정면 얼굴 ────────────────────────────────────────────────
{
  const metrics = computeFaceGeometryMetrics({
    map: buildBaseMap(),
    rollCorrectionApplied: true,
  });

  expectClose(metrics.eyeWidthRatioLeft.value, 1.0, 'eyeWidthRatioLeft');
  expectClose(metrics.eyeWidthRatioRight.value, 1.0, 'eyeWidthRatioRight');
  expectClose(metrics.eyeOpennessLeft.value, 0.25, 'eyeOpennessLeft');
  expectClose(metrics.eyeOpennessRight.value, 0.25, 'eyeOpennessRight');
  expectClose(metrics.interCanthalRatio.value, 0.2, 'interCanthalRatio');
  expectClose(metrics.canthalTiltLeftDeg.value, 0, 'canthalTiltLeftDeg');
  expectClose(metrics.canthalTiltRightDeg.value, 0, 'canthalTiltRightDeg');
  expectClose(metrics.browSlopeLeftDeg.value, 0, 'browSlopeLeftDeg');
  expectClose(metrics.browSlopeRightDeg.value, 0, 'browSlopeRightDeg');
  expectClose(metrics.eyeBrowGapLeft.value, 0.375, 'eyeBrowGapLeft');
  expectClose(metrics.eyeBrowGapRight.value, 0.375, 'eyeBrowGapRight');
  expectClose(metrics.mouthWidthRatio.value, 0.35, 'mouthWidthRatio');
  expectClose(metrics.lipThicknessRatio.value, 0.75, 'lipThicknessRatio');
  expectClose(metrics.jawWidthRatio.value, 0.8, 'jawWidthRatio');
  expectClose(metrics.lowerJawWidthRatio.value, 0.4, 'lowerJawWidthRatio');
  expectClose(metrics.mouthCornerAsymmetry.value, 0, 'mouthCornerAsymmetry');

  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    expectSameArray(metrics[key].warnings, [], `warnings(${key})`);
  }
}

// ── 2. canthalTilt 좌우 부호 대칭: 양쪽 눈꼬리를 같은 만큼 올리면 같은 양수 ──
{
  const map = buildBaseMap();
  map.set(IDX.eyeOuterRight, {x: 380, y: 390});
  map.set(IDX.eyeOuterLeft, {x: 620, y: 390});

  const metrics = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});
  const expected = (Math.atan2(10, 80) * 180) / Math.PI; // ≈ 7.13°

  expectClose(metrics.canthalTiltLeftDeg.value, expected, 'canthalTiltLeftDeg(up)', 0.01);
  expectClose(metrics.canthalTiltRightDeg.value, expected, 'canthalTiltRightDeg(up)', 0.01);
  expectEqual(
    metrics.canthalTiltLeftDeg.value,
    metrics.canthalTiltRightDeg.value,
    'canthalTilt L/R equality',
  );
}

// ── 3. browSlope mirror 정규화: 꼬리 쪽으로 올라간 눈썹은 좌우 모두 양수 ──────
{
  const map = buildBaseMap();
  const rightXs = [380, 400, 420, 440, 460];
  const leftXs = [540, 560, 580, 600, 620];
  // 피사체 오른쪽: 꼬리(x=380) y=350 → 내측(x=460) y=370 (b=+0.25)
  BROW_CORE_RIGHT_INDICES.forEach((index, i) => {
    const x = rightXs[i % 5];
    const lowerY = 350 + ((x - 380) / 80) * 20;
    map.set(index, {x, y: i < 5 ? lowerY : lowerY - 20});
  });
  // 피사체 왼쪽: 내측(x=540) y=370 → 꼬리(x=620) y=350 (b=-0.25)
  BROW_CORE_LEFT_INDICES.forEach((index, i) => {
    const x = leftXs[i % 5];
    const lowerY = 370 - ((x - 540) / 80) * 20;
    map.set(index, {x, y: i < 5 ? lowerY : lowerY - 20});
  });

  const metrics = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});
  const expected = (Math.atan(0.25) * 180) / Math.PI; // ≈ 14.04°

  expectClose(metrics.browSlopeLeftDeg.value, expected, 'browSlopeLeftDeg(mirror)', 0.01);
  expectClose(metrics.browSlopeRightDeg.value, expected, 'browSlopeRightDeg(mirror)', 0.01);
}

// ── 4. roll 미보정이면 기울기·수직거리 계열만 null, 나머지는 산출 ────────────
{
  const metrics = computeFaceGeometryMetrics({
    map: buildBaseMap(),
    rollCorrectionApplied: false,
  });

  const rollSensitive = [
    'browSlopeLeftDeg',
    'browSlopeRightDeg',
    'canthalTiltLeftDeg',
    'canthalTiltRightDeg',
    'eyeBrowGapLeft',
    'eyeBrowGapRight',
    'mouthCornerAsymmetry',
  ] as const;

  for (const key of rollSensitive) {
    expectEqual(metrics[key].value, null, `${key} null without roll correction`);
    expectSameArray(
      metrics[key].warnings,
      ['roll_correction_unavailable'],
      `${key} warning`,
    );
  }
  expectClose(metrics.mouthWidthRatio.value, 0.35, 'mouthWidthRatio(no roll)');
  expectClose(metrics.lipThicknessRatio.value, 0.75, 'lipThicknessRatio(no roll)');
}

// ── 5. epsilon 가드: 얼굴 폭 퇴화 시 해당 분모 지표만 null ───────────────────
{
  const map = buildBaseMap();
  map.set(IDX.faceWidthLeft, {x: 300, y: 500}); // faceWidthRight 와 동일점

  const metrics = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});

  for (const key of [
    'interCanthalRatio',
    'jawWidthRatio',
    'lowerJawWidthRatio',
    'mouthWidthRatio',
  ] as const) {
    expectEqual(metrics[key].value, null, `${key} null on degenerate face width`);
    expectSameArray(metrics[key].warnings, ['denominator_degenerate'], `${key} warning`);
  }
  // 분모가 interCanthal 이라 영향 없음
  expectClose(metrics.eyeWidthRatioLeft.value, 1.0, 'eyeWidthRatioLeft(degenerate width)');
}

// ── 6. browSlope x 분산 퇴화 가드 ────────────────────────────────────────────
{
  const map = buildBaseMap();
  BROW_CORE_RIGHT_INDICES.forEach((index, i) => {
    map.set(index, {x: 420, y: i < 5 ? 360 : 340});
  });

  const metrics = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});
  expectEqual(metrics.browSlopeRightDeg.value, null, 'browSlopeRightDeg degenerate');
  expectSameArray(
    metrics.browSlopeRightDeg.warnings,
    ['brow_x_variance_degenerate'],
    'browSlopeRightDeg warning',
  );
}

// ── 7. toPixelLandmarkMap: 복제+픽셀 변환, 원본 불변, 비유한 점 제외 ─────────
{
  const source = [
    {i: 0, x: 0.5, y: 0.58},
    {i: 1, x: Number.NaN, y: 0.2},
    {i: 2, x: 0.1, y: 0.2},
  ];
  const map = toPixelLandmarkMap(source, 1000, 2000);

  expectClose(map.get(0)?.x ?? null, 500, 'pixel x');
  expectClose(map.get(0)?.y ?? null, 1160, 'pixel y');
  expectEqual(map.has(1), false, 'non-finite point skipped');
  expectClose(map.get(2)?.x ?? null, 100, 'pixel x (2)');
  // 원본 오염 금지 — dedup 공유 결과 보호의 핵심 계약.
  expectEqual(source[0].x, 0.5, 'source untouched x');
  expectEqual(source[0].y, 0.58, 'source untouched y');
}

// ── 8. rotatePixelLandmarkMap: 회전 정확성 + 원본 Map 불변 ───────────────────
{
  const map: PixelLandmarkMap = new Map([[7, {x: 600, y: 500}]]);
  const rotated = rotatePixelLandmarkMap(map, 90, {x: 500, y: 500});

  expectClose(rotated.get(7)?.x ?? null, 500, 'rotated x', 1e-9);
  expectClose(rotated.get(7)?.y ?? null, 600, 'rotated y', 1e-9);
  expectClose(map.get(7)?.x ?? null, 600, 'original map untouched', 1e-9);
}

// ── 9. collectMissingIndices / createUnavailableFaceGeometryMetrics ──────────
{
  const map = buildBaseMap();
  expectSameArray(
    collectMissingIndices(map, FACE_GEOMETRY_REQUIRED_INDICES),
    [],
    'no missing indices',
  );

  map.delete(IDX.eyeInnerLeft);
  expectSameArray(
    collectMissingIndices(map, FACE_GEOMETRY_REQUIRED_INDICES),
    [IDX.eyeInnerLeft],
    'missing index detected',
  );

  const unavailableMetrics = createUnavailableFaceGeometryMetrics('not_computed');
  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    expectEqual(unavailableMetrics[key].value, null, `${key} unavailable value`);
    expectSameArray(unavailableMetrics[key].warnings, ['not_computed'], `${key} unavailable warning`);
  }
}

// ── 10. 회전 부호 규약 pin: +90°는 이미지 좌표계 시계방향(오른쪽 점→아래) ────
{
  const center: PixelPoint = {x: 500, y: 500};
  const map: PixelLandmarkMap = new Map([[0, {x: 600, y: 500}]]); // 중심 오른쪽 100px
  const rotated = rotatePixelLandmarkMap(map, 90, center).get(0)!;
  expectClose(rotated.x, 500, 'rot+90 x'); // 오른쪽 점이
  expectClose(rotated.y, 600, 'rot+90 y'); // 아래로 (이미지 y는 아래로 증가)
}

// ── 11. roll 부호 독립 검증: +R 카메라 roll 은 좌우 canthalTilt 를 반대로(우 +R, 좌 −R)
//        벌리고, 서비스 규약 angleDeg=−rollDeg(즉 −R 회전)이 그 왜곡을 0 으로 되돌린다.
//        회전 부호가 뒤집히면 observed 부호가 반대가 되어 여기서 FAIL — 왕복 항등이 아님.
{
  const R = 6;
  const center: PixelPoint = {x: 500, y: 500};
  const observed = rotatePixelLandmarkMap(buildBaseMap(), R, center);
  const obs = computeFaceGeometryMetrics({map: observed, rollCorrectionApplied: true});
  expectClose(obs.canthalTiltRightDeg.value, R, 'observed tilt R = +R after +R roll', 0.1);
  expectClose(obs.canthalTiltLeftDeg.value, -R, 'observed tilt L = -R after +R roll', 0.1);

  const corrected = rotatePixelLandmarkMap(observed, -R, center); // service: angleDeg = -rollDeg
  const cor = computeFaceGeometryMetrics({map: corrected, rollCorrectionApplied: true});
  expectClose(cor.canthalTiltRightDeg.value, 0, 'corrected tilt R ~0 (−rollDeg removes +R roll)', 0.01);
  expectClose(cor.canthalTiltLeftDeg.value, 0, 'corrected tilt L ~0 (−rollDeg removes +R roll)', 0.01);
}

// ── 12. 신규 후보 인덱스: 눈썹 상연 edge 는 좌우 5점, 기존 brow core 부분집합 ──
{
  expectEqual(BROW_UPPER_EDGE_RIGHT_INDICES.length, 5, 'brow upper edge R len');
  expectEqual(BROW_UPPER_EDGE_LEFT_INDICES.length, 5, 'brow upper edge L len');
  for (const i of BROW_UPPER_EDGE_RIGHT_INDICES) {
    expectEqual(BROW_CORE_RIGHT_INDICES.includes(i), true, `R edge ${i} in core`);
  }
  for (const i of BROW_UPPER_EDGE_LEFT_INDICES) {
    expectEqual(BROW_CORE_LEFT_INDICES.includes(i), true, `L edge ${i} in core`);
  }
}

// ── 13. 수렴각: 상/하 접선 사잇각. 대칭 예각/둔각 케이스 + 회전 불변 ───────────
{
  const map = buildBaseMap();
  // 외안각(우) 33=(380,400): 상접선점 161 위-안쪽, 하접선점 163 아래-안쪽 → 90° 코너
  map.set(CANTHAL_TANGENT_INDICES.upperRight, {x: 420, y: 360}); // (+40,-40)
  map.set(CANTHAL_TANGENT_INDICES.lowerRight, {x: 420, y: 440}); // (+40,+40)
  const m = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});
  expectClose(m.outerCanthalAngleRightDeg.value, 90, 'convergence 90deg', 0.01);

  // 회전 불변: 전체를 33° 돌려도 같은 값
  const rotated = rotatePixelLandmarkMap(map, 33, {x: 500, y: 500});
  const m2 = computeFaceGeometryMetrics({map: rotated, rollCorrectionApplied: true});
  expectClose(m2.outerCanthalAngleRightDeg.value, 90, 'convergence rot-invariant', 0.01);

  // roll 미보정에서도 산출됨(회전 불변 → 게이트 무관)
  const m3 = computeFaceGeometryMetrics({map, rollCorrectionApplied: false});
  expectClose(m3.outerCanthalAngleRightDeg.value, 90, 'convergence without roll gate', 0.01);
}

console.log('faceGeometryMath.test.ts passed');
