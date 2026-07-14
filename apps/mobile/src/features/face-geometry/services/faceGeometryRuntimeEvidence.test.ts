// A0 증적 record 스키마 계약. 실행: scripts/mobile/run-face-geometry-contract.mjs
//
// 실기기 파일 방출(jsonl)의 실동작은 W1 세션에서 확인한다. 여기서는 순수 record
// 빌더가 (1) 원시 좌표·로컬 uri 미포함 (2) 16지표 전량 (3) pose/roll/status 보존
// 을 만족함을 코드로 고정한다.

import {
  FACE_GEOMETRY_EVIDENCE_SCHEMA_VERSION,
  buildFaceGeometryEvidenceRecord,
} from './faceGeometryEvidenceRecord';
import {
  FACE_GEOMETRY_METRIC_KEYS,
  type FaceGeometryMetrics,
  type FaceGeometryResult,
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

const ROLL_SENSITIVE_KEYS = new Set([
  'browSlopeLeftDeg',
  'browSlopeRightDeg',
  'canthalTiltLeftDeg',
  'canthalTiltRightDeg',
  'eyeBrowGapLeft',
  'eyeBrowGapRight',
  'mouthCornerAsymmetry',
]);

// full: 16지표 전량 산출. rollGated: roll 게이트 밖 → 각도/수직 7키만 null.
function buildResult(kind: 'full' | 'rollGated'): FaceGeometryResult {
  const metrics = {} as FaceGeometryMetrics;
  FACE_GEOMETRY_METRIC_KEYS.forEach((key, index) => {
    const gated = kind === 'rollGated' && ROLL_SENSITIVE_KEYS.has(key);
    const unit = key.endsWith('Deg') ? ('deg' as const) : ('ratio' as const);
    metrics[key] = gated
      ? {unit, value: null, warnings: ['roll_correction_unavailable']}
      : {unit, value: 0.1 + index * 0.01, warnings: []};
  });

  const rollGated = kind === 'rollGated';
  return {
    captureId: 'cap-a0',
    createdAt: '2026-07-14T00:00:00.000Z',
    metrics,
    pose: {pitchDeg: -4.2, rollDeg: rollGated ? 22.5 : 1.1, yawDeg: 0.8},
    rollCorrection: rollGated
      ? {applied: false, rollCorrectionDeg: null, skippedReason: 'roll_out_of_range'}
      : {applied: true, rollCorrectionDeg: -1.1},
    schemaVersion: 'aura-face-geometry-v1',
    sessionId: 'sess-a0',
    sourceImage: {height: 1920, uri: 'file:///local/secret.jpg', width: 1080},
    status: rollGated ? 'partial_success' : 'full_success',
    statusReason: rollGated ? 'some_metrics_unavailable' : undefined,
  };
}

// ── 1. full_success: 원시 미포함 + 16지표 + 보존 ─────────────────────────────
{
  const record = buildFaceGeometryEvidenceRecord(buildResult('full'));
  const json = JSON.stringify(record);

  expectEqual(record.rawFaceDataIncluded, false, 'rawFaceDataIncluded false');
  expectEqual(
    record.schemaVersion,
    FACE_GEOMETRY_EVIDENCE_SCHEMA_VERSION,
    'schema version',
  );
  expectEqual(json.includes('file://'), false, 'no local file uri leaked');
  expectEqual(json.includes('secret'), false, 'source uri fully stripped');
  expectEqual(json.includes('"uri"'), false, 'no uri key');
  expectEqual(record.sourceImage.width, 1080, 'sourceImage width kept');
  expectEqual(record.sourceImage.height, 1920, 'sourceImage height kept');

  expectEqual(
    Object.keys(record.metrics).length,
    FACE_GEOMETRY_METRIC_KEYS.length,
    'all 16 metric keys present',
  );
  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    expect(record.metrics[key] !== undefined, `metric ${key} present`);
  }

  expectEqual(record.captureId, 'cap-a0', 'captureId preserved');
  expectEqual(record.sessionId, 'sess-a0', 'sessionId preserved');
  expectEqual(record.status, 'full_success', 'status preserved');
  expectEqual(record.statusReason, null, 'undefined statusReason → null');
  expectEqual(record.pose?.pitchDeg, -4.2, 'pitch recorded (not gated, robustness 증적)');
  expectEqual(record.pose?.rollDeg, 1.1, 'roll recorded');
  expectEqual(record.rollCorrection.applied, true, 'rollCorrection applied preserved');
}

// ── 2. partial(roll gated): 7키 null + 사유 보존, 나머지 산출 ─────────────────
{
  const record = buildFaceGeometryEvidenceRecord(buildResult('rollGated'));

  expectEqual(record.status, 'partial_success', 'gated status');
  expectEqual(record.statusReason, 'some_metrics_unavailable', 'gated statusReason');
  expectEqual(record.rollCorrection.applied, false, 'gated rollCorrection not applied');

  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    const metric = record.metrics[key];
    if (ROLL_SENSITIVE_KEYS.has(key)) {
      expectEqual(metric.value, null, `roll-sensitive ${key} null`);
      expect(
        metric.warnings.includes('roll_correction_unavailable'),
        `roll-sensitive ${key} carries reason`,
      );
    } else {
      expect(metric.value !== null, `ratio ${key} still computed`);
    }
  }
}

console.log('faceGeometryRuntimeEvidence.test.ts passed');
