import {
  appendFaceRatioPhase1ReplayCapture,
  createFaceRatioPhase1ReplayArtifact,
  createFaceRatioPhase1ReplayCapture,
  isFaceRatioPhase1ReplayArtifactExpired,
  validateFaceRatioPhase1ReplayArtifact,
  validateFaceRatioPhase1ReplayValidation,
} from './faceRatioPhase1ReplayArtifact';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrows(action: () => void, pattern: RegExp) {
  try {
    action();
  } catch (error) {
    expect(
      error instanceof Error && pattern.test(error.message),
      `Expected error matching ${pattern}, received ${String(error)}`,
    );
    return;
  }

  throw new Error(`Expected action to throw ${pattern}`);
}

const validation = {
  captureId: 'cap_phase1_shot_001',
  cohortId: 'cohort_phase1_local',
  condition: {
    distanceLabel: 'standard',
    isReference: true,
    poseLabel: 'frontal',
    repeatGroup: 'frontal-standard',
    repeatIndex: 1,
  },
  retentionDays: 7,
  sessionId: 'session_20260717_a1b2c3d4',
  subjectId: 'subj_7f2d91a4c8e1',
} as const;

const landmarks = Array.from({length: 478}, (_, i) => ({
  i,
  x: 0.25 + i * 0.0001,
  y: 0.35 + i * 0.0001,
  z: -0.02 + i * 0.00001,
}));
const matrix = {
  layout: 'row-major' as const,
  values: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
const createdAtUtc = '2026-07-17T00:00:00.000Z';

validateFaceRatioPhase1ReplayValidation(validation);
const artifact = createFaceRatioPhase1ReplayArtifact({
  createdAtUtc,
  validation,
});
const capture = createFaceRatioPhase1ReplayCapture({
  capturedAtUtc: '2026-07-17T00:05:00.000Z',
  hairline: {
    confidence: 0.9,
    method: 'apple_hair_skin_boundary',
    provider: 'apple_semantic_matte',
    x: 540,
    y: 230.4,
  },
  imageHeight: 1440,
  imageWidth: 1080,
  landmarks,
  transformationMatrix: matrix,
  validation,
  zProxy: -0.04,
});
const appended = appendFaceRatioPhase1ReplayCapture(artifact, capture);
validateFaceRatioPhase1ReplayArtifact(appended);

expect(appended.captures.length === 1, 'capture must append once');
expect(
  appended.captures[0].landmarks.length === 478,
  'capture must retain exactly 478 landmarks',
);
expect(
  JSON.stringify(appended.captures[0].transformationMatrix.values) ===
    JSON.stringify(matrix.values),
  'capture must retain the full transformation matrix',
);
expect(appended.captures[0].hairline?.x === 0.5, 'hairline x must normalize');
expect(appended.captures[0].hairline?.y === 0.16, 'hairline y must normalize');
expect(appended.privacy.localOnly === true, 'artifact must remain local-only');
expect(
  appended.privacy.productPayloadIncluded === false,
  'artifact must stay outside the product payload',
);
expect(
  appended.privacy.sourceImagesIncluded === false,
  'artifact must not include source images',
);
expect(
  appended.privacy.retention.deleteAfterDays === 7,
  'retention duration must be explicit',
);
expect(
  appended.privacy.retention.deleteByUtc === '2026-07-24T00:00:00.000Z',
  'deleteByUtc must be derived from createdAtUtc and retention days',
);
expect(
  !JSON.stringify(appended).includes('imageUri'),
  'raw replay artifact must not persist the source image URI',
);
expect(
  isFaceRatioPhase1ReplayArtifactExpired(
    appended,
    '2026-07-23T23:59:59.999Z',
  ) === false,
  'artifact must remain until deleteByUtc',
);
expect(
  isFaceRatioPhase1ReplayArtifactExpired(
    appended,
    '2026-07-24T00:00:00.000Z',
  ) === true,
  'artifact must expire exactly at deleteByUtc',
);

expectThrows(
  () => appendFaceRatioPhase1ReplayCapture(appended, capture),
  /duplicate captureId/,
);
expectThrows(
  () =>
    validateFaceRatioPhase1ReplayValidation({
      ...validation,
      subjectId: 'person@example.com',
    }),
  /pseudonymous subj_/,
);
expectThrows(
  () =>
    createFaceRatioPhase1ReplayCapture({
      capturedAtUtc: '2026-07-17T00:06:00.000Z',
      hairline: null,
      imageHeight: 1440,
      imageWidth: 1080,
      landmarks: landmarks.slice(0, 477),
      transformationMatrix: matrix,
      validation: {
        ...validation,
        captureId: 'cap_phase1_shot_002',
      },
    }),
  /exactly 478/,
);

console.log('faceRatioPhase1ReplayArtifact tests passed');
