// Tier-2 pass-through 불변식 (P0-2, docs/face3d/TIER2_METRIC_CONTRACT.md §3)
//
// 계약: Tier-2 6키는 값이 있으면 AI 입력·DB 저장에 "키 필터 없이" 그대로 흐르고
// (faceCaptureUploadContract.buildFaceAnalysisRequestPayload / faceAnalysisMeasurements.
// buildFaceAnalysisMeasurementsPayload 는 face3d 프로필 전체를 스프레드한다), 승인된
// G2 프로필에서는 보고서 그리드에도 6키가 모두 노출된다.
//
// 화면 실렌더와 같은 선택 술어(EXPOSED ∩ 프로필 존재 키)를 데이터 레벨로 검증한다.

import {
  buildFaceAnalysisMeasurementsPayload,
  parseFaceAnalysisMeasurements,
} from '../../face-analysis/services/faceAnalysisMeasurements';
import {buildFaceAnalysisRequestPayload} from '../../face-capture/services/faceCaptureUploadContract';
import {
  FACE_3D_EXPOSED_METRIC_KEYS,
  FACE_3D_OPTIONAL_METRIC_KEYS,
  FACE_3D_REQUIRED_METRIC_KEYS,
  type Face3DMetric,
  type Face3DMetricKey,
  type Face3DProfile,
} from '../types';

function expect(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(label);
  }
}

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const EXPECTED_TIER2_KEYS: Face3DMetricKey[] = [
  'noseLength',
  'nasalBridgeStraightness',
  'nasalAxisDeviation',
  'alarWidth',
  'malarProjectionLeft',
  'malarProjectionRight',
];

function metric(value: number): Face3DMetric {
  return {confidence: 0.8, mad: 0.002, unit: 'normalized', validFrameCount: 27, value};
}

// 필수 5키 + Tier-2 6키를 모두 채운 G2 프로필.
function createFullProfile(): Face3DProfile {
  const metrics = Object.fromEntries(
    [...FACE_3D_REQUIRED_METRIC_KEYS, ...FACE_3D_OPTIONAL_METRIC_KEYS].map((key, index) => [
      key,
      metric(0.1 + index * 0.01),
    ]),
  ) as Face3DProfile['metrics'];

  return {
    gateVersion: 'face3d-gate-v1',
    metrics,
    schemaVersion: 'aura.face3d-profile.v1',
    source: 'arkit_face_mesh',
    targetFrameCount: 30,
    topologyFingerprint: 'synthetic-v8-i12-uv8-a1b2c3d4',
    validFrameCount: 27,
    warnings: [],
  };
}

// ── 1. 키 리스트 계약: drift 방지 ────────────────────────────────────────────
expectEqual(
  FACE_3D_OPTIONAL_METRIC_KEYS.length,
  EXPECTED_TIER2_KEYS.length,
  'optional key count',
);
for (const key of EXPECTED_TIER2_KEYS) {
  expect(
    (FACE_3D_OPTIONAL_METRIC_KEYS as readonly Face3DMetricKey[]).includes(key),
    `optional keys include ${key}`,
  );
}

// 승인된 G2 보고서는 Tier-2 6키를 모두 노출해야 한다.
for (const key of EXPECTED_TIER2_KEYS) {
  expect(
    FACE_3D_EXPOSED_METRIC_KEYS.includes(key),
    `exposed keys include tier-2 key ${key}`,
  );
}
expectEqual(FACE_3D_EXPOSED_METRIC_KEYS.length, 11, 'all 11 Face3D metrics exposed');

const profile = createFullProfile();

// 전제: 프로필에는 6키가 모두 실재한다(게이트 배제가 "값 부재" 때문이 아님).
for (const key of EXPECTED_TIER2_KEYS) {
  expect(profile.metrics[key] != null, `profile actually contains tier-2 key ${key}`);
}

// ── 2. AI 입력: 6키가 그대로 흐른다 ──────────────────────────────────────────
const requestPayload = buildFaceAnalysisRequestPayload(
  {bucket: 'b', objectKey: 'k'},
  undefined,
  profile,
);
expectEqual(
  (requestPayload as {face3d?: Face3DProfile}).face3d,
  profile,
  'AI payload carries the whole face3d profile (no key filter)',
);

// ── 3. DB 저장: 6키가 그대로 흐른다 ──────────────────────────────────────────
const measurementsPayload = buildFaceAnalysisMeasurementsPayload({
  captureId: 'cap-tier2',
  face3d: profile,
  faceGeometry2d: null,
  faceVerticalThirds: null,
  personalColor: null,
});
expect(measurementsPayload !== undefined, 'measurements payload built');
expectEqual(
  (measurementsPayload as {face3d?: Face3DProfile}).face3d,
  profile,
  'DB payload stores the whole face3d profile (no key filter)',
);

// ── 4. DB → 복원 왕복: 6키 보존 ──────────────────────────────────────────────
const restored = parseFaceAnalysisMeasurements(measurementsPayload, {imageUrl: ''});
expect(restored?.face3d != null, 'restored measurements contain face3d');
for (const key of EXPECTED_TIER2_KEYS) {
  expect(
    restored?.face3d?.metrics[key] != null,
    `restored profile preserves tier-2 key ${key}`,
  );
}
expectEqual(
  restored?.face3d?.metrics.noseLength?.value,
  profile.metrics.noseLength?.value,
  'restored tier-2 value equals original',
);

// ── 5. 화면 게이트: G2 프로필의 11지표를 전부 선택 ──────────────────────────
// Face3DMetricGrid 은 FACE_3D_EXPOSED_METRIC_KEYS 를 순회하고 프로필에 없는 키만
// 조용히 건너뛴다. 그 선택 결과를 데이터 레벨로 재현한다.
const shownKeys = FACE_3D_EXPOSED_METRIC_KEYS.filter(key => profile.metrics[key] != null);
for (const key of EXPECTED_TIER2_KEYS) {
  expect(
    shownKeys.includes(key),
    `grid shows tier-2 key ${key}`,
  );
}
// 필수 5키는 값이 있으니 전부 노출된다(회귀 안전망).
for (const key of FACE_3D_REQUIRED_METRIC_KEYS) {
  expect(shownKeys.includes(key), `grid shows required key ${key}`);
}

console.log('Face3D Tier-2 pass-through invariant test passed.');
