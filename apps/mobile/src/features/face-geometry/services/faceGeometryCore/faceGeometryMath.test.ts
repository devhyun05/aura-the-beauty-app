// 실행: scripts/mobile/run-face-geometry-contract.mjs (tsc → node)
// 합성 랜드마크 기지값 검증 — personalColorCore 계약 테스트와 같은 plain-script.
import {
  collectFaceGeometryDebugAnchors,
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
    'browApexRatioLeft',
    'browApexRatioRight',
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

// ── 13. 눈꼬리 위쪽 각도: 윗꺼풀선(상접선점→외안각)이 수평보다 아래로 떨어진 각. roll 게이트 안. ──
{
  const map = buildBaseMap();
  // 외안각(우) 33=(380,400), 상접선점 161=(420,360): 외안각이 상접선보다 +40 아래,
  //   가로 40 → atan2(40,40)=45° (양수=아래로 처짐)
  map.set(IDX.eyeOuterRight, {x: 380, y: 400});
  map.set(CANTHAL_TANGENT_INDICES.upperRight, {x: 420, y: 360});
  const m = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});
  expectClose(m.eyeTailUpperAngleRightDeg.value, 45, 'eye-tail upper 45deg', 0.01);

  // roll 미보정이면 null(수평 대비라 roll 민감)
  const m2 = computeFaceGeometryMetrics({map, rollCorrectionApplied: false});
  expectEqual(m2.eyeTailUpperAngleRightDeg.value, null, 'eye-tail upper null without roll');
}

// ── 14. 눈썹 봉우리 비율: 중앙(3/5 지점)이 최고점이면 호길이 비율 0.5 ───────────
{
  const map = buildBaseMap();
  // 상연 edge medial→lateral 5점을 등간격 x + 가운데가 최고(min y)로 세팅
  // 우: medial 107 x=460 → lateral 70 x=380 (medial x 큼). 가운데(105)만 y 낮게.
  const edgeR = BROW_UPPER_EDGE_RIGHT_INDICES; // [107,66,105,63,70]
  const xsR = [460, 440, 420, 400, 380];       // medial→lateral 등간격 20px
  const ysR = [360, 355, 340, 355, 360];       // 가운데 최고점
  edgeR.forEach((idx, i) => map.set(idx, {x: xsR[i], y: ysR[i]}));
  const m = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});
  // 등간격이므로 가운데(index 2)의 호길이 비율 = 2/4 = 0.5 (y 편차는 x 간격 대비 작아 근사)
  expectClose(m.browApexRatioRight.value, 0.5, 'brow apex ratio center', 0.02);

  // roll 미보정이면 null
  const m2 = computeFaceGeometryMetrics({map, rollCorrectionApplied: false});
  expectEqual(m2.browApexRatioRight.value, null, 'brow apex null without roll');
}

// ── 15. debugAnchors: tilt/수렴각 앵커가 정규화 좌표로 담긴다 ────────────────
{
  const anchors = collectFaceGeometryDebugAnchors(buildBaseMap(), 1000, 1000);
  const tiltR = anchors.find(a => a.label === 'canthalTiltRight');
  if (!tiltR) fail('debugAnchors', 'canthalTiltRight anchor missing');
  expectEqual(tiltR.kind, 'segment', 'tilt kind');
  // seg(label, IDX.eyeInnerRight, IDX.eyeOuterRight) → points[0]=내안각(460,400),
  // points[1]=외안각(380,400) → 정규화(1000×1000).
  expectClose(tiltR.points[0].x, 0.46, 'tilt p0 x (inner)');
  expectClose(tiltR.points[0].y, 0.40, 'tilt p0 y');
  expectClose(tiltR.points[1].x, 0.38, 'tilt p1 x (outer)');
  expectClose(tiltR.points[1].y, 0.40, 'tilt p1 y');
}

// ── 16. 눈썹 봉우리 sub-sample: 이웃 y 비대칭이면 최고점 샘플에서 그쪽으로 이동 ──
{
  const map = buildBaseMap();
  const edgeR = BROW_UPPER_EDGE_RIGHT_INDICES;
  const xsR = [460, 440, 420, 400, 380]; // medial→lateral
  const ysR = [360, 352, 340, 344, 360]; // 최고점 idx2, 오른(lateral) 이웃이 더 높음(y=344)
  edgeR.forEach((idx, i) => map.set(idx, {x: xsR[i], y: ysR[i]}));
  const m = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});
  const v = m.browApexRatioRight.value;
  if (v === null) {
    fail('brow apex subsample', 'expected value, got null');
  }
  // 정점이 중앙(0.5)에서 lateral(arc 증가) 쪽으로 이동: 0.5 < v < 0.65
  if (!(v > 0.5)) {
    fail('brow apex subsample', `expected >0.5, got ${v}`);
  }
  if (!(v < 0.65)) {
    fail('brow apex subsample', `expected <0.65, got ${v}`);
  }
}

console.log('faceGeometryMath.test.ts passed');
