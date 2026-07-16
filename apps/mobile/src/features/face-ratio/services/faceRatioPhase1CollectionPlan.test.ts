import {
  FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION,
  resolveFaceRatioPhase1CollectionPlan,
  resolveFaceRatioPreparedCollectionProgress,
  resolveFaceRatioPreparedExact30Progress,
} from './faceRatioPhase1CollectionPlan';
import {
  appendFaceRatioPhase1ReplayCapture,
  createFaceRatioPhase1ReplayArtifact,
  createFaceRatioPhase1ReplayCapture,
} from './faceRatioPhase1ReplayArtifact';

declare const process: {
  argv: string[];
};

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
      `expected ${pattern}, received ${String(error)}`,
    );
    return;
  }
  throw new Error(`expected action to throw ${pattern}`);
}

const expectedShots = [
  ['p1-01-frontal-standard-reference-a', 'standard', true, 'frontal', 'frontal-standard', 1],
  ['p1-02-yaw-left-moderate', 'standard', false, 'yaw-subject-left-6deg', 'yaw-subject-left-6deg-standard', 1],
  ['p1-03-yaw-right-moderate', 'standard', false, 'yaw-subject-right-6deg', 'yaw-subject-right-6deg-standard', 1],
  ['p1-04-chin-up-moderate', 'standard', false, 'pitch-chin-up-8deg', 'pitch-chin-up-8deg-standard', 1],
  ['p1-05-chin-down-moderate', 'standard', false, 'pitch-chin-down-8deg', 'pitch-chin-down-8deg-standard', 1],
  ['p1-06-roll-left-light', 'standard', false, 'roll-subject-left-3deg', 'roll-subject-left-3deg-standard', 1],
  ['p1-07-roll-right-light', 'standard', false, 'roll-subject-right-3deg', 'roll-subject-right-3deg-standard', 1],
  ['p1-08-frontal-near-greenlight', 'near-within-existing-greenlight', false, 'frontal', 'frontal-near-within-existing-greenlight', 1],
  ['p1-09-frontal-far-greenlight', 'far-within-existing-greenlight', false, 'frontal', 'frontal-far-within-existing-greenlight', 1],
  ['p1-10-frontal-standard-reference-b', 'standard', true, 'frontal', 'frontal-standard', 2],
].map(
  ([
    shotId,
    distanceLabel,
    isReference,
    poseLabel,
    repeatGroup,
    repeatIndex,
  ]) => ({
    condition: {
      distanceLabel: distanceLabel as string,
      isReference: isReference as boolean,
      poseLabel: poseLabel as string,
      repeatGroup: repeatGroup as string,
      repeatIndex: repeatIndex as number,
    },
    shotId: shotId as string,
  }),
);

const encodedPlan = process.argv[2];
expect(encodedPlan, 'generated prepared collection plan argument is required');
const sourcePlan = JSON.parse(
  decodeURIComponent(
    Array.from(globalThis.atob(encodedPlan))
      .map(character =>
        `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`,
      )
      .join(''),
  ),
) as {
  phase1: {
    shots: Array<{
      phase1ReplayValidation: unknown;
    }>;
  };
};

const prepared = resolveFaceRatioPhase1CollectionPlan({
  encodedPlan,
  expectedShots,
  modeValue: 'prepared',
});
expect(prepared.mode === 'prepared', `prepared plan rejected: ${prepared.error}`);
if (prepared.mode !== 'prepared') {
  throw new Error(prepared.error ?? 'prepared plan resolution failed');
}
expect(
  prepared.plan.schemaVersion ===
    FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION,
  'app parser must accept the current collection-plan schema',
);
expect(
  JSON.stringify(
    prepared.plan.phase1.shots.map(shot => shot.phase1ReplayValidation),
  ) ===
    JSON.stringify(
      sourcePlan.phase1.shots.map(shot => shot.phase1ReplayValidation),
    ),
  'plan -> app handoff must preserve every Phase 1 runtime validation tuple exactly',
);
expect(
  prepared.plan.phase1.shots.every(
    (shot, index) =>
      shot.phase1ReplayValidation.captureId.startsWith(
        `cap_p1_${String(index + 1).padStart(2, '0')}_`,
      ) &&
      shot.phase1ReplayValidation.acquisition.source === 'camera' &&
      shot.phase1ReplayValidation.acquisition.captureImplementation ===
        'native' &&
      shot.phase1ReplayValidation.acquisition.cameraFacing === 'front',
  ),
  'prepared plan must preserve exact capture IDs and camera/native/front acquisition',
);

const wrongExpectedShots = expectedShots.map((shot, index) =>
  index === 1
    ? {
        ...shot,
        condition: {
          ...shot.condition,
          poseLabel: 'wrong-app-pose',
        },
      }
    : shot,
);
const mismatch = resolveFaceRatioPhase1CollectionPlan({
  encodedPlan,
  expectedShots: wrongExpectedShots,
  modeValue: 'prepared',
});
expect(
  mismatch.mode === 'invalid' &&
    mismatch.error.includes('condition does not match'),
  'prepared mode must fail closed when the generated plan and app shot plan diverge',
);

const missingPlan = resolveFaceRatioPhase1CollectionPlan({
  encodedPlan: undefined,
  expectedShots,
  modeValue: 'prepared',
});
expect(
  missingPlan.mode === 'invalid' &&
    missingPlan.error.includes('requires a base64 collection plan'),
  'prepared mode must fail closed without a plan',
);

const generic = resolveFaceRatioPhase1CollectionPlan({
  encodedPlan: undefined,
  expectedShots,
  modeValue: 'generic',
});
expect(generic.mode === 'generic', 'generic Phase 1 lab must remain explicit');

const ambiguous = resolveFaceRatioPhase1CollectionPlan({
  encodedPlan,
  expectedShots,
  modeValue: 'generic',
});
expect(
  ambiguous.mode === 'invalid',
  'generic mode must reject an accidentally supplied prepared plan',
);

expect(
  new Set(prepared.plan.phase2.shots.map(shot => shot.shotId)).size ===
    prepared.plan.phase2.exact30RepeatCount &&
    prepared.plan.phase2.shots.every((shot, index) =>
      new RegExp(
        `^p2-${String(index + 1).padStart(2, '0')}-` +
          'exact30-frontal-neutral-[a-f0-9]{16}$',
      ).test(shot.shotId),
    ),
  'prepared exact-30 shot IDs must be ordered and unique to the plan context',
);
const preparedPlan = prepared.plan;

function exact30EvidenceLine(index: number, validFrameCount = 30) {
  const shot = preparedPlan.phase2.shots[index];
  return JSON.stringify({
    event: {
      profile: {
        collectionPolicyId: 'diagnostics-exact-30-v1',
        schemaVersion: 'aura.face3d-profile.v3',
        targetFrameCount: 30,
        validFrameCount,
      },
      requestId: shot.shotId,
      type: 'face3d_analyzed',
    },
    rawFaceDataIncluded: false,
    schemaVersion: 'aura.face3d-runtime-evidence.v1',
    unifiedCapture: {
      captureId: `cap_exact30_contract_${index + 1}`,
      sourceEventType: 'unified_face_capture_completed',
    },
  });
}

expect(
  resolveFaceRatioPreparedExact30Progress('', prepared.plan)
    .completedShotCount === 0,
  'prepared exact-30 must start at the first planned shot without evidence',
);
const exact30Prefix = [
  exact30EvidenceLine(0),
  exact30EvidenceLine(1),
].join('\n');
const exact30Progress = resolveFaceRatioPreparedExact30Progress(
  exact30Prefix,
  prepared.plan,
);
expect(
  exact30Progress.completedShotCount === 2 &&
    exact30Progress.nextShotIndex === 3 &&
    exact30Progress.phase2Completed === false,
  'prepared exact-30 must resume from the durable canonical evidence prefix',
);
expectThrows(
  () =>
    resolveFaceRatioPreparedExact30Progress(
      `${exact30EvidenceLine(0)}\n${exact30EvidenceLine(0)}`,
      prepared.plan,
    ),
  /duplicate prepared requestId/,
);
expectThrows(
  () =>
    resolveFaceRatioPreparedExact30Progress(
      exact30EvidenceLine(1),
      prepared.plan,
    ),
  /not a canonical plan prefix/,
);
expectThrows(
  () =>
    resolveFaceRatioPreparedExact30Progress(
      exact30EvidenceLine(0, 29),
      prepared.plan,
    ),
  /not a valid exact-30 completion/,
);

const replayLandmarks = Array.from({length: 478}, (_, i) => ({
  i,
  x: 0.25 + i * 0.0001,
  y: 0.35 + i * 0.0001,
  z: -0.02 + i * 0.00001,
}));
const replayMatrix = {
  layout: 'row-major' as const,
  values: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
let replayArtifact = createFaceRatioPhase1ReplayArtifact({
  createdAtUtc: '2026-07-17T00:00:00.000Z',
  validation: prepared.plan.phase1.shots[0].phase1ReplayValidation,
});
expect(
  resolveFaceRatioPreparedCollectionProgress(null, prepared.plan)
    .nextShotIndex === 1,
  'prepared collection without an artifact must start at shot 1',
);

for (let index = 0; index < prepared.plan.phase1.shots.length; index += 1) {
  const validation =
    prepared.plan.phase1.shots[index].phase1ReplayValidation;
  replayArtifact = appendFaceRatioPhase1ReplayCapture(
    replayArtifact,
    createFaceRatioPhase1ReplayCapture({
      capturedAtUtc: new Date(
        Date.parse('2026-07-17T00:01:00.000Z') + index * 60_000,
      ).toISOString(),
      hairline: null,
      imageHeight: 1440,
      imageWidth: 1080,
      landmarks: replayLandmarks,
      transformationMatrix: replayMatrix,
      validation,
    }),
  );

  const progress = resolveFaceRatioPreparedCollectionProgress(
    replayArtifact,
    prepared.plan,
  );
  expect(
    progress.completedShotCount === index + 1 &&
      progress.nextShotIndex === Math.min(index + 2, 10) &&
      progress.phase1Completed === (index === 9),
    `prepared collection must resume from the canonical prefix after shot ${index + 1}`,
  );
}

const mismatchedArtifact = {
  ...replayArtifact,
  captures: replayArtifact.captures.map((capture, index) =>
    index === 2
      ? {...capture, captureId: 'cap_wrong_prepared_prefix_003'}
      : capture,
  ),
};
expectThrows(
  () =>
    resolveFaceRatioPreparedCollectionProgress(
      mismatchedArtifact,
      prepared.plan,
    ),
  /does not match the prepared collection plan prefix/,
);

console.log('faceRatioPhase1CollectionPlan tests passed');
