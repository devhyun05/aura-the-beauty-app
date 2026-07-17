// 실행: scripts/mobile/run-face-analysis-measurements-contract.mjs (tsc → node)
import {
  buildFaceAnalysisMeasurementsPayload,
  buildMeasuredPersonalColorAiPayload,
  derivePersonalColorCorrectionStatus,
  parseFaceAnalysisMeasurements,
  shouldUseSessionMeasurements,
  toBackendCamelKey,
  type PersonalColorMeasurementInput,
} from './faceAnalysisMeasurements';
import {buildFaceAnalysisRequestPayload} from '../../face-capture/services/faceCaptureUploadContract';
import type {Face3DProfile} from '../../face-3d/types';
import type {FaceGeometryResult} from '../../face-geometry/types';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../face-geometry/types';
import type {FaceVerticalThirdsResult} from '../../face-ratio/types';
import type {
  AuraPersonalColorResult,
  PersonalColor12Type,
} from '../../personal-color/services/personalColorCore/contracts';
import type {IlluminationCorrectionReport} from '../../personal-color/services/personalColorCore/illuminationCorrection';

function fail(label: string, detail: string): never {
  throw new Error(`${label}: ${detail}`);
}

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    fail(label, `expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectDefined<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    fail(label, 'expected defined value');
  }
  return value;
}

// 백엔드 응답 경로 재현: casing.py camelize 와 동일하게 "키"만 재귀 변환.
function simulateBackendCamelize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(simulateBackendCamelize);
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[toBackendCamelKey(key)] = simulateBackendCamelize(item);
    }
    return result;
  }

  return value;
}

// ── 픽스처 ───────────────────────────────────────────────────────────────────

function buildThirdsFixture(): FaceVerticalThirdsResult {
  return {
    artifacts: {logJsonlUri: 'file:///tmp/log.jsonl', sourceImageUri: 'file:///tmp/src.jpg'},
    captureId: 'cap-1',
    createdAt: '2026-07-13T00:00:00.000Z',
    faceLength: {heightPx: 975, ratio: 1.383, widthPx: 705},
    faceLengthJudgment: {band: {hi: 1.412, lo: 1.376}, verdict: 'borderline_wide'},
    hairlineAnalysis: {
      analysisEligible: true,
      confidence: 0.8,
      outcome: 'detected_high_confidence',
      provider: 'apple_semantic_matte',
    },
    interpretation: {dominantPart: 'middle', summary: '중안부가 긴 편', title: '중안부 우세'},
    judgmentVersion:
      'face-length-judgment/v3-pose-normalization-validation-20260717',
    keypoints: {
      G: {confidence: 0.9, method: 'mediapipe', provider: 'mediapipe', x: 500, y: 400},
      H: {confidence: 0.8, method: 'matte', provider: 'apple_semantic_matte', x: 500, y: 120},
      Me: {confidence: 0.95, method: 'mediapipe', provider: 'mediapipe', x: 500, y: 1095},
      Sn: {confidence: 0.92, method: 'mediapipe', provider: 'mediapipe', x: 500, y: 720},
    },
    measurementMode: 'full_vertical_thirds',
    postCorrection: {
      applied: true,
      center: {x: 540, y: 960},
      method: 'mediapipe_pose_roll',
      rollCorrectionDeg: 0.6,
    },
    quality: {pitch: -2.8, roll: 0.6, usable: true, warnings: [], yaw: 1.2},
    schemaVersion: 'aura-face-vertical-thirds-v1',
    sessionId: 'cap-1',
    sourceImage: {height: 1920, uri: 'file:///tmp/src.jpg', width: 1080},
    status: 'full_success',
    verticalThirds: {
      confidence: 0.82,
      displayRatio: {lower: 1.08, middle: 1.0, upper: 0.97},
      lowerNormalized: 0.354,
      lowerPx: 345,
      middleNormalized: 0.328,
      middlePx: 320,
      totalPx: 975,
      upperNormalized: 0.318,
      upperPx: 310,
      warnings: [],
    },
  };
}

function buildGeometryFixture(): FaceGeometryResult {
  const metrics = {} as FaceGeometryResult['metrics'];
  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    metrics[key] = {
      unit: key.endsWith('Deg') ? 'deg' : 'ratio',
      value: key === 'browSlopeLeftDeg' ? null : 0.5,
      warnings: key === 'browSlopeLeftDeg' ? ['roll_out_of_range'] : [],
    };
  }

  return {
    captureId: 'cap-1',
    createdAt: '2026-07-13T00:00:00.000Z',
    metrics,
    pose: {pitchDeg: -2.8, rollDeg: 0.6, yawDeg: 1.2},
    rollCorrection: {applied: true, rollCorrectionDeg: -0.6},
    schemaVersion: 'aura-face-geometry-v1',
    sessionId: 'cap-1',
    sourceImage: {height: 1920, uri: 'file:///tmp/src.jpg', width: 1080},
    status: 'partial_success',
    statusReason: 'some_metrics_unavailable',
  };
}

function buildFace3dFixture(): Face3DProfile {
  const metric = {confidence: 1, mad: 0.001, unit: 'normalized' as const, validFrameCount: 30, value: 0.2};

  return {
    gateVersion: 'face3d-gate-v1',
    metrics: {
      centralProjectionScore: metric,
      chinProjection: metric,
      lowerLipToELine: metric,
      noseTipProjection: metric,
      upperLipToELine: metric,
    },
    schemaVersion: 'aura.face3d-profile.v1',
    source: 'arkit_face_mesh',
    targetFrameCount: 30,
    topologyFingerprint: 'v:1220|i:6912|u:abcd',
    validFrameCount: 30,
    warnings: [],
  };
}

function buildPersonalColorFixture(): PersonalColorMeasurementInput {
  const axis = {basis: 'within-frame-relative' as const, confidence: 0.8, floored: false, value: 0.32};
  const typeKeys: PersonalColor12Type[] = [
    'spring_light', 'spring_bright', 'spring_true',
    'summer_light', 'summer_true', 'summer_muted',
    'autumn_muted', 'autumn_true', 'autumn_deep',
    'winter_bright', 'winter_true', 'winter_deep',
  ];
  const probabilities = {} as Record<PersonalColor12Type, number>;
  const distances = {} as Record<PersonalColor12Type, number>;
  for (const key of typeKeys) {
    probabilities[key] = key === 'autumn_muted' ? 0.41 : 0.05;
    distances[key] = key === 'autumn_muted' ? 0.2 : 1.1;
  }

  const reported: AuraPersonalColorResult = {
    artifacts: {
      calibrationVersion: null,
      frameCount: 1,
      referencePoints: {fixedRefsVersion: 'refs-v3', neutralSource: 'population'},
    },
    axes: {chroma: axis, clarity: axis, contrast: axis, temperature: axis, value: axis},
    calibrationApplied: false,
    colorFrame: 'device-relative-awb-locked',
    deferredRegions: ['eye'],
    measurementConfidence: 0.72,
    palette: {best: [], colorFamilies: [], worst: []},
    preCalibrationHedge: false,
    regions: [
      {
        areaRatio: 0.12,
        colorSpace: 'srgb',
        lab: {L: 62.1, a: 12.4, b: 16.8},
        lch: {C: 20.9, h: 53.6},
        overExposedRatio: 0,
        qEff: 0.8,
        qNative: 0.85,
        region: 'skin',
        underExposedRatio: 0,
        warnings: [],
      },
    ],
    relations: {dE00_skinHair: 21.3, dE00_skinLip: 12.8, dL_skinHair: 18.2, dL_skinLip: 9.4},
    schemaVersion: 'aura-personal-color-v1',
    status: 'definitive',
    tone: {
      distances,
      gap: 0.13,
      isMixed: false,
      probabilities,
      season: 'autumn',
      secondary: 'autumn_true',
      tau: 0.4,
      top: 'autumn_muted',
      typeScore: 0.41,
    },
    warnings: [],
    privacy: {localOnly: true, offDeviceUpload: false, longTermRawFrameStored: false},
  };

  const correctionReport: IlluminationCorrectionReport = {
    applied: true,
    capped: false,
    confidence: 0.6,
    gains: {b: 1.04, g: 1.0, r: 0.97},
    reasons: [],
    sclera: {
      available: true,
      eyesUsed: 2,
      leftRightAgreement: 0.02,
      measuredLab: {L: 78.2, a: 3.1, b: 5.4},
      measuredRgb: {r: 201, g: 196, b: 188},
      rawGains: {b: 1.05, g: 1.0, r: 0.96},
      reasons: [],
      sampleCount: 140,
    },
    source: 'sclera',
    strength: 0.05,
    wb: {available: true, bg: 1.02, rawGains: null, reasons: ['wb_low_confidence'], rg: 0.98},
  };

  return {corrected: {result: reported}, correctionReport, reported};
}

// ── 1. encode: 제외 필드(artifacts/uri/privacy) + 포함 필드 ──────────────────
{
  const payload = expectDefined(
    buildFaceAnalysisMeasurementsPayload({
      captureId: 'cap-1',
      face3d: buildFace3dFixture(),
      faceGeometry2d: buildGeometryFixture(),
      faceVerticalThirds: buildThirdsFixture(),
      personalColor: buildPersonalColorFixture(),
    }),
    'encode payload',
  );
  const json = JSON.stringify(payload);

  expectEqual(json.includes('file://'), false, 'no local file uris');
  expectEqual(json.includes('artifacts'), true, 'pc artifacts(provenance) kept');
  expectEqual(json.includes('logJsonlUri'), false, 'thirds artifacts dropped');
  expectEqual(json.includes('privacy'), false, 'privacy field dropped');
  expectEqual(json.includes('"captureId":"cap-1"'), true, 'captureId kept');
  expectEqual(json.includes('measuredRgb'), true, 'correction sclera 실측값 kept');

  const thirds = payload.faceVerticalThirds as Record<string, unknown>;
  const sourceImage = thirds.sourceImage as Record<string, unknown>;
  expectEqual(sourceImage.uri, undefined, 'thirds sourceImage.uri dropped');
  expectEqual(sourceImage.width, 1080, 'thirds sourceImage.width kept');
}

// ── 2. 왕복: encode → 백엔드 camelize 재현 → decode ──────────────────────────
{
  const payload = buildFaceAnalysisMeasurementsPayload({
    captureId: 'cap-1',
    face3d: buildFace3dFixture(),
    faceGeometry2d: buildGeometryFixture(),
    faceVerticalThirds: buildThirdsFixture(),
    personalColor: buildPersonalColorFixture(),
  });
  const camelized = simulateBackendCamelize(payload);
  const decoded = expectDefined(
    parseFaceAnalysisMeasurements(camelized, {imageUrl: 'https://cdn/x.jpg'}),
    'roundtrip decode',
  );

  expectEqual(decoded.captureId, 'cap-1', 'captureId');

  const thirds = expectDefined(decoded.faceVerticalThirds, 'thirds axis');
  expectEqual(thirds.sourceImage.uri, 'https://cdn/x.jpg', 'imageUrl injected');
  expectEqual(thirds.sourceImage.width, 1080, 'thirds width roundtrip');
  expectEqual(thirds.sourceImage.height, 1920, 'thirds height roundtrip');
  expectEqual(thirds.keypoints.H?.y, 120, 'keypoint H roundtrip');
  expectEqual(thirds.keypoints.Me?.y, 1095, 'keypoint Me roundtrip');
  expectEqual(thirds.keypoints.G?.x, 500, 'keypoint G roundtrip');
  expectEqual(thirds.keypoints.Sn?.y, 720, 'keypoint Sn roundtrip');
  expectEqual(thirds.faceLength?.ratio, 1.383, 'faceLength roundtrip');
  // 판정 스냅샷·버전 왕복(Phase 0-5, 1차 리뷰 반영): encode→camelize→decode
  expectEqual(
    thirds.judgmentVersion,
    'face-length-judgment/v3-pose-normalization-validation-20260717',
    'judgmentVersion roundtrip',
  );
  expectEqual(
    thirds.faceLengthJudgment?.verdict,
    'borderline_wide',
    'faceLengthJudgment verdict roundtrip',
  );
  expectEqual(thirds.faceLengthJudgment?.band.hi, 1.412, 'judgment band hi roundtrip');
  expectEqual(thirds.faceLengthJudgment?.band.lo, 1.376, 'judgment band lo roundtrip');
  expectEqual(thirds.postCorrection?.center?.x, 540, 'postCorrection center roundtrip');
  // 오염 입력 계약(3차 셀프 리뷰): band가 비유한/문자열이거나 verdict가
  // 미지 값이면 스냅샷 전체를 폐기하고 화면 재판정 폴백에 맡긴다.
  {
    const contaminated = parseFaceAnalysisMeasurements(
      simulateBackendCamelize(
        buildFaceAnalysisMeasurementsPayload({
          captureId: 'cap-x',
          face3d: null,
          faceGeometry2d: null,
          faceVerticalThirds: {
            ...buildThirdsFixture(),
            faceLengthJudgment: {
              band: {hi: Number.NaN, lo: 1.3},
              verdict: 'wide',
            },
          },
          personalColor: null,
        }),
      ) as Record<string, unknown>,
      {},
    );
    expectEqual(
      contaminated?.faceVerticalThirds?.faceLengthJudgment,
      undefined,
      'contaminated band must drop the snapshot (fallback to re-judgment)',
    );
    const unknownVerdict = parseFaceAnalysisMeasurements(
      simulateBackendCamelize(
        buildFaceAnalysisMeasurementsPayload({
          captureId: 'cap-y',
          face3d: null,
          faceGeometry2d: null,
          faceVerticalThirds: {
            ...buildThirdsFixture(),
            faceLengthJudgment: {
              band: {hi: 1.31, lo: 1.3},
              verdict: 'future-verdict' as never,
            },
          },
          personalColor: null,
        }),
      ) as Record<string, unknown>,
      {},
    );
    expectEqual(
      unknownVerdict?.faceVerticalThirds?.faceLengthJudgment,
      undefined,
      'unknown future verdict must drop the snapshot (fallback to re-judgment)',
    );
  }
  expectEqual(thirds.verticalThirds?.displayRatio.upper, 0.97, 'ratio roundtrip');
  expectEqual(thirds.measurementMode, 'full_vertical_thirds', 'measurement mode roundtrip');
  expectEqual(
    thirds.hairlineAnalysis.analysisEligible,
    true,
    'hairline eligibility roundtrip',
  );

  const face3d = expectDefined(decoded.face3d, 'face3d axis');
  expectEqual(face3d.metrics.noseTipProjection.value, 0.2, 'face3d metric roundtrip');

  const geometry = expectDefined(decoded.faceGeometry2d, 'geometry axis');
  expectEqual(geometry.metrics.browSlopeLeftDeg.value, null, 'geometry null metric kept');
  expectEqual(
    geometry.metrics.browSlopeLeftDeg.warnings[0],
    'roll_out_of_range',
    'geometry metric warning kept',
  );
  expectEqual(geometry.pose?.rollDeg, 0.6, 'geometry pose roundtrip');
  expectEqual(geometry.statusReason, 'some_metrics_unavailable', 'geometry statusReason');

  const personalColor = expectDefined(decoded.personalColor, 'pc axis');
  // camelize 로 dL_skinHair→dLSkinHair 로 변형된 키가 원 키로 역정규화돼야 한다.
  expectEqual(personalColor.reported.relations.dL_skinHair, 18.2, 'relations 역정규화');
  expectEqual(personalColor.reported.relations.dE00_skinLip, 12.8, 'relations 역정규화 2');
  expectEqual(personalColor.reported.tone?.top, 'autumn_muted', 'tone top');
  expectEqual(
    personalColor.reported.tone?.probabilities.autumn_muted,
    0.41,
    'probabilities 12톤 키 역매핑',
  );
  expectEqual(
    personalColor.reported.tone?.distances.winter_deep,
    1.1,
    'distances 12톤 키 역매핑',
  );
  expectEqual(personalColor.reported.regions[0]?.lab.L, 62.1, 'region lab roundtrip');
  expectEqual(personalColor.correctionStatus.applied, true, 'correction status');
  expectEqual(
    personalColor.correctionReport?.sclera.measuredRgb?.r,
    201,
    'correction 실측 RGB roundtrip',
  );
  expectEqual(personalColor.correctionReport?.wb.rg, 0.98, 'wb ratio roundtrip');
  expectEqual(
    (personalColor.reported as Record<string, unknown>).privacy,
    undefined,
    'privacy 재부착 금지',
  );
}

// ── 2-1. Phase 1 validation-only 보정은 product payload 승격 금지 ─────────────
{
  const validationOnlyThirds: FaceVerticalThirdsResult = {
    ...buildThirdsFixture(),
    faceLengthJudgment: {
      band: {hi: 1.412, lo: 1.376},
      verdict: 'indeterminate',
    },
    postCorrection: {
      applied: true,
      center: {x: 540, y: 960},
      method: 'mediapipe_facial_transformation_matrix',
      poseNormalization: {
        confidencePolicy: 'diagnostic_only_unvalidated',
        diagnostics: {
          correctionMaxPx: 12.5,
          correctionRmsPx: 3.25,
          landmarkCount: 478,
          matrixOrthogonalityResidual: 0.002,
          matrixRotationDeterminant: 1,
          matrixScaleSpread: 0.004,
          roundTripRmsPx: 0.001,
          zSpanPx: 83.4,
        },
        requested: true,
      },
      rollCorrectionDeg: null,
    },
  };
  const payload = expectDefined(
    buildFaceAnalysisMeasurementsPayload({
      captureId: 'cap-validation-only',
      face3d: null,
      faceGeometry2d: buildGeometryFixture(),
      faceVerticalThirds: validationOnlyThirds,
      personalColor: null,
    }),
    'validation-only payload keeps unrelated axes',
  );
  expectEqual(
    'faceVerticalThirds' in payload,
    false,
    'validation-only corrected thirds omitted from product payload',
  );

  const decoded = expectDefined(
    parseFaceAnalysisMeasurements(
      {
        captureId: 'cap-local-replay',
        faceVerticalThirds: {
          ...validationOnlyThirds,
          artifacts: undefined,
          sourceImage: {height: 1920, width: 1080},
        },
        schemaVersion: 'aura-face-analysis-measurements-v1',
      },
      {imageUrl: 'file:///local-replay.jpg'},
    ),
    'validation-only local replay decode',
  );
  const correction = expectDefined(
    decoded.faceVerticalThirds?.postCorrection,
    'pose normalization correction decode',
  );
  expectEqual(
    correction.method,
    'mediapipe_facial_transformation_matrix',
    'matrix correction method decode',
  );
  expectEqual(
    correction.poseNormalization?.diagnostics.landmarkCount,
    478,
    'pose normalization diagnostics decode',
  );
  expectEqual(
    correction.poseNormalization?.confidencePolicy,
    'diagnostic_only_unvalidated',
    'pose normalization confidence policy decode',
  );
}

// ── 3. legacy 세로비율: Apple full 복원 + proxy fail-closed ───────────────────
{
  const legacyApplePayload = expectDefined(
    buildFaceAnalysisMeasurementsPayload({
      captureId: 'legacy-apple',
      face3d: null,
      faceGeometry2d: null,
      faceVerticalThirds: buildThirdsFixture(),
      personalColor: null,
    }),
    'legacy apple payload',
  );
  const legacyApple = legacyApplePayload.faceVerticalThirds as Record<string, unknown>;
  delete legacyApple.measurementMode;
  delete legacyApple.hairlineAnalysis;
  const restoredApple = expectDefined(
    parseFaceAnalysisMeasurements(simulateBackendCamelize(legacyApplePayload), {}),
    'legacy apple decode',
  ).faceVerticalThirds;
  expectEqual(
    restoredApple?.measurementMode,
    'full_vertical_thirds',
    'legacy full Apple remains full',
  );

  const proxyFixture: FaceVerticalThirdsResult = {
    ...buildThirdsFixture(),
    hairlineAnalysis: {
      analysisEligible: false,
      confidence: null,
      outcome: 'omitted',
      provider: null,
    },
    keypoints: {
      ...buildThirdsFixture().keypoints,
      H: {
        confidence: 0.4,
        method: 'mediapipe_landmark_10_forehead_approx',
        provider: 'mediapipe_forehead_approx',
        x: 500,
        y: 120,
      },
    },
    measurementMode: 'middle_lower_only',
    status: 'partial_success',
  };
  const legacyProxyPayload = expectDefined(
    buildFaceAnalysisMeasurementsPayload({
      captureId: 'legacy-proxy',
      face3d: null,
      faceGeometry2d: null,
      faceVerticalThirds: proxyFixture,
      personalColor: null,
    }),
    'legacy proxy payload',
  );
  const legacyProxy = legacyProxyPayload.faceVerticalThirds as Record<string, unknown>;
  delete legacyProxy.measurementMode;
  delete legacyProxy.hairlineAnalysis;
  const restoredProxy = expectDefined(
    expectDefined(
      parseFaceAnalysisMeasurements(simulateBackendCamelize(legacyProxyPayload), {}),
      'legacy proxy measurements',
    ).faceVerticalThirds,
    'legacy proxy thirds',
  );
  expectEqual(
    restoredProxy.measurementMode,
    'middle_lower_only',
    'legacy proxy downgraded',
  );
  expectEqual(restoredProxy.hairlineAnalysis.analysisEligible, false, 'proxy ineligible');
  expectEqual(
    restoredProxy.keypoints.H?.provider,
    'mediapipe_forehead_approx',
    'legacy proxy raw point preserved for parsing compatibility',
  );
  expectEqual(restoredProxy.faceLength, undefined, 'proxy faceLength removed');
  expectEqual(restoredProxy.verticalThirds?.displayRatio.upper, null, 'proxy upper removed');
  expectEqual(
    restoredProxy.interpretation.dominantPart,
    'unknown',
    'proxy dominant part removed',
  );
}

// ── 4. blocked 축·geometry 16키 채움·구버전 방어 ─────────────────────────────
{
  const blockedThirds: FaceVerticalThirdsResult = {
    ...buildThirdsFixture(),
    faceLength: undefined,
    status: 'blocked',
    statusReason: 'pose_gate_failed',
    verticalThirds: undefined,
  };
  const payload = buildFaceAnalysisMeasurementsPayload({
    captureId: 'cap-2',
    face3d: null,
    faceGeometry2d: null,
    faceVerticalThirds: blockedThirds,
    personalColor: null,
  });
  const decoded = expectDefined(
    parseFaceAnalysisMeasurements(simulateBackendCamelize(payload), {}),
    'blocked decode',
  );
  expectEqual(
    decoded.faceVerticalThirds?.statusReason,
    'pose_gate_failed',
    'blocked statusReason 보존',
  );
  expectEqual(decoded.face3d, undefined, 'absent face3d');

  // metrics 가 일부 누락된(부분 손상) 응답도 16키 전부 채워져야 화면이 안 죽는다.
  const decodedPartial = expectDefined(
    parseFaceAnalysisMeasurements(
      {
        captureId: 'cap-3',
        faceGeometry2d: {
          metrics: {mouthWidthRatio: {unit: 'ratio', value: 0.35, warnings: []}},
          rollCorrection: {applied: false},
          sourceImage: {height: 10, width: 10},
          status: 'partial_success',
        },
        schemaVersion: 'aura-face-analysis-measurements-v1',
      },
      {},
    ),
    'partial geometry decode',
  );
  const partialGeometry = expectDefined(decodedPartial.faceGeometry2d, 'partial geometry');
  expectEqual(partialGeometry.metrics.mouthWidthRatio.value, 0.35, 'present metric');
  expectEqual(partialGeometry.metrics.canthalTiltLeftDeg.value, null, 'missing metric filled');
  expectEqual(partialGeometry.metrics.canthalTiltLeftDeg.unit, 'deg', 'unit inferred');
  expectEqual(FACE_GEOMETRY_METRIC_KEYS.every(key => key in partialGeometry.metrics), true, '16키 전부');
}

// ── 5. insufficient PC(tone null) 왕복 ───────────────────────────────────────
{
  const fixture = buildPersonalColorFixture();
  const insufficient: PersonalColorMeasurementInput = {
    corrected: null,
    correctionReport: {...fixture.correctionReport, applied: false, source: 'none'},
    reported: {...fixture.reported, status: 'insufficient', tone: null},
  };
  const payload = buildFaceAnalysisMeasurementsPayload({
    captureId: 'cap-4',
    face3d: null,
    faceGeometry2d: null,
    faceVerticalThirds: null,
    personalColor: insufficient,
  });
  const decoded = expectDefined(
    parseFaceAnalysisMeasurements(simulateBackendCamelize(payload), {}),
    'insufficient decode',
  );
  expectEqual(decoded.personalColor?.reported.status, 'insufficient', 'insufficient status');
  expectEqual(decoded.personalColor?.reported.tone, null, 'tone null 보존');
  expectEqual(decoded.personalColor?.correctionStatus.applied, false, 'correction 미적용');
}

// ── 6. 스키마·비객체 방어 ────────────────────────────────────────────────────
{
  expectEqual(parseFaceAnalysisMeasurements(null, {}), undefined, 'null 방어');
  expectEqual(parseFaceAnalysisMeasurements('x', {}), undefined, '문자열 방어');
  expectEqual(
    parseFaceAnalysisMeasurements({captureId: 'c', schemaVersion: 'other-v9'}, {}),
    undefined,
    '스키마 불일치 방어',
  );
  expectEqual(
    parseFaceAnalysisMeasurements(
      {schemaVersion: 'aura-face-analysis-measurements-v1'},
      {},
    ),
    undefined,
    'captureId 부재 방어',
  );
}

// ── 7. identity resolver 4분기 ───────────────────────────────────────────────
{
  expectEqual(
    shouldUseSessionMeasurements({explicitReportId: 'r1', reportCaptureId: 'cap-1', sessionCaptureId: 'cap-1'}),
    false,
    '명시적 reportId → 복원분',
  );
  expectEqual(
    shouldUseSessionMeasurements({explicitReportId: null, reportCaptureId: null, sessionCaptureId: 'cap-1'}),
    true,
    '구버전(measurements 없음)+세션 직후 → 세션 props',
  );
  expectEqual(
    shouldUseSessionMeasurements({explicitReportId: null, reportCaptureId: 'cap-1', sessionCaptureId: 'cap-1'}),
    true,
    'captureId 일치 → 세션 props',
  );
  expectEqual(
    shouldUseSessionMeasurements({explicitReportId: null, reportCaptureId: 'cap-9', sessionCaptureId: 'cap-1'}),
    false,
    'captureId 불일치(다른 보고서) → 복원분',
  );
}

// ── 8. measuredPersonalColor AI 요약 ─────────────────────────────────────────
{
  expectEqual(buildMeasuredPersonalColorAiPayload(null), undefined, 'null → undefined');

  const ai = expectDefined(
    buildMeasuredPersonalColorAiPayload(buildPersonalColorFixture()),
    'ai payload',
  );
  expectEqual(ai.relations.skinHairLightnessDelta, 18.2, '서술명 relations');
  expectEqual(ai.relations.skinLipColorDelta, 12.8, '서술명 relations 2');
  expectEqual(ai.tone?.top, 'autumn_muted', 'ai tone');
  expectEqual(ai.correction.applied, true, 'ai correction applied');
  expectEqual(ai.correction.wbRatio.rg, 0.98, 'ai wb ratio');
  expectEqual(ai.correction.scleraSummary.sampleCount, 140, 'ai sclera 표본수');
  expectEqual(ai.regions[0]?.lab.L, 62.1, 'ai region lab');
  expectEqual(ai.axes.temperature.value, 0.32, 'ai axis');
  // camelize 위험 키(dL_/dE00_)는 AI payload 에 존재하지 않아야 한다.
  expectEqual(JSON.stringify(ai).includes('dL_'), false, 'ai payload camel-safe');

  const status = derivePersonalColorCorrectionStatus(buildPersonalColorFixture());
  expectEqual(status.applied, true, 'derive applied');
  expectEqual(status.reasons.includes('wb_low_confidence'), true, 'derive reasons 병합');
}

// ── 9. P0-1: 업로드 계약 == DB 저장 원본 == 복원 ──────────────────────────────
// 모바일은 저장 원본 measurements를 그대로 요청에 싣는다. 백엔드는 DB에는 이 원본을
// 보존하되 AI 프롬프트를 만들 때 analysis-ineligible H만 별도 안전 투영한다.
// 백엔드 camelize 왕복 후에도 16개 geometry 키가 값까지 그대로 복원돼야 한다.
{
  const geometry = buildGeometryFixture();
  const dbMeasurements = expectDefined(
    buildFaceAnalysisMeasurementsPayload({
      captureId: 'cap-3way',
      face3d: buildFace3dFixture(),
      faceGeometry2d: geometry,
      faceVerticalThirds: buildThirdsFixture(),
      personalColor: buildPersonalColorFixture(),
    }),
    '3way db measurements',
  );

  // 분석 요청 payload 는 DB 저장용 measurements 객체를 그대로 싣는다.
  const aiPayload = buildFaceAnalysisRequestPayload(
    {bucket: 'b', objectKey: 'k'},
    undefined,
    undefined,
    undefined,
    undefined,
    dbMeasurements,
  );
  expectEqual(
    (aiPayload as {measurements?: unknown}).measurements,
    dbMeasurements,
    'AI 입력과 DB 저장이 동일 measurements 출처',
  );

  // DB → 백엔드 camelize → 복원: 16 geometry 키가 값까지 보존.
  const restored = expectDefined(
    parseFaceAnalysisMeasurements(simulateBackendCamelize(dbMeasurements), {
      imageUrl: 'https://cdn/y.jpg',
    }),
    '3way decode',
  );
  const restoredGeometry = expectDefined(restored.faceGeometry2d, '복원 geometry 축');
  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    expectEqual(
      restoredGeometry.metrics[key].value,
      geometry.metrics[key].value,
      `geometry ${key} 값 3표면 일치`,
    );
  }
  expectEqual(
    Object.keys(restoredGeometry.metrics).length,
    FACE_GEOMETRY_METRIC_KEYS.length,
    '복원 geometry 키 개수 == 16',
  );
  expectDefined(restored.face3d, '복원 face3d 축');
  expectDefined(restored.faceVerticalThirds, '복원 thirds 축');
}

// ── 10. regionVisuals round-trip(measurements v1 optional key, schemaVersion 불변) ──
{
  const rv = {
    upper: {
      cropRect: {x: 0.1, y: 0.2, w: 0.3, h: 0.2},
      guide: {points: [{x: 0.2, y: 0.3}, {x: 0.5, y: 0.3}], label: '눈가'},
    },
  };
  const payload = expectDefined(
    buildFaceAnalysisMeasurementsPayload({
      captureId: 'c1',
      face3d: null,
      faceGeometry2d: {...buildGeometryFixture(), regionVisuals: rv},
      faceVerticalThirds: null,
      personalColor: null,
    }),
    'regionVisuals payload',
  );
  expectDefined(
    (payload as {regionVisuals?: unknown}).regionVisuals,
    'regionVisuals가 top-level로 lift되어야 함',
  );
  expectEqual(
    Object.prototype.hasOwnProperty.call(
      (payload as {faceGeometry2d?: Record<string, unknown>}).faceGeometry2d ?? {},
      'regionVisuals',
    ),
    false,
    'nested faceGeometry2d에는 regionVisuals 중복 저장 없음',
  );
  expectEqual(
    payload.schemaVersion,
    'aura-face-analysis-measurements-v1',
    'schemaVersion 불변(버전 미변경)',
  );

  const parsed = expectDefined(
    parseFaceAnalysisMeasurements(payload, {imageUrl: undefined}),
    'regionVisuals parsed',
  );
  const upper = expectDefined(parsed.regionVisuals?.upper, 'regionVisuals.upper 복원');
  expectEqual(upper.guide.label, '눈가', 'guide label 보존');
  expectEqual(upper.cropRect.w, 0.3, 'cropRect 값 보존');
  expectEqual(upper.guide.points.length, 2, 'guide points 개수 보존');
}

console.log('faceAnalysisMeasurements.test.ts passed');
