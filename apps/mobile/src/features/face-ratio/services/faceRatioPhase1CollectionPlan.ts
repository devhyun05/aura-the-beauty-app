import type {
  FaceRatioPhase1ReplayCondition,
  FaceRatioPhase1ReplayValidation,
} from '../types';
import {
  validateFaceRatioPhase1ReplayArtifact,
  validateFaceRatioPhase1ReplayValidation,
} from './faceRatioPhase1ReplayArtifact';

declare const process: {
  env: {
    EXPO_PUBLIC_AURA_FACE_MEASUREMENT_COLLECTION_MODE?: string;
    EXPO_PUBLIC_AURA_FACE_MEASUREMENT_COLLECTION_PLAN_BASE64?: string;
  };
};

export const FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION =
  'aura.face-measurement-collection-plan.v2';
export const FACE_MEASUREMENT_PREPARED_COLLECTION_MODE = 'prepared';
export const FACE_MEASUREMENT_GENERIC_COLLECTION_MODE = 'generic';

type ExpectedPhase1Shot = {
  condition: FaceRatioPhase1ReplayCondition;
  shotId: string;
};

export type FaceRatioPreparedCollectionPlan = {
  cohortId: string;
  executionMode: 'dry_run_only';
  phase1: {
    shotCount: 10;
    shots: Array<{
      order: number;
      phase: 'phase1_pose_distance';
      phase1ReplayValidation: FaceRatioPhase1ReplayValidation;
      shotId: string;
    }>;
  };
  phase2: {
    collectionPolicyId: 'diagnostics-exact-30-v1';
    exact30RepeatCount: number;
    shots: Array<{
      collectionPolicyId: 'diagnostics-exact-30-v1';
      expectedEventType: 'unified_face_capture_completed';
      order: number;
      phase: 'phase2_exact30_baseline';
      requiredTargetFrameCount: 30;
      requiredValidFrameCount: 30;
      sessionId: string;
      shotId: string;
      subjectContextId: string;
      uploadAllowed: false;
    }>;
  };
  privacy: {
    rawLandmarks: {
      deleteByUtc: string;
      localOnly: true;
      retentionDays: number;
      separatedFromProductPayload: true;
      uploadAllowed: false;
    };
  };
  schemaVersion: typeof FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION;
  sequence: Array<{
    collectionPolicyId?: string;
    expectedEventType?: string;
    order: number;
    phase: string;
    phase1ReplayValidation?: FaceRatioPhase1ReplayValidation;
    requiredTargetFrameCount?: number;
    requiredValidFrameCount?: number;
    sessionId?: string;
    shotId: string;
    subjectContextId?: string;
    uploadAllowed?: boolean;
  }>;
  sessionId: string;
  subjectContextId: string;
  deviceActionsExecuted: false;
};

export type FaceRatioPhase1CollectionPlanResolution =
  | {
      error: null;
      mode: 'generic';
      plan: null;
    }
  | {
      error: null;
      mode: 'prepared';
      plan: FaceRatioPreparedCollectionPlan;
    }
  | {
      error: string;
      mode: 'invalid';
      plan: null;
    };

export type FaceRatioPreparedCollectionProgress = {
  completedShotCount: number;
  nextShotIndex: number;
  phase1Completed: boolean;
};

export type FaceRatioPreparedExact30Progress = {
  completedShotCount: number;
  nextShotIndex: number;
  phase2Completed: boolean;
};

function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function conditionsMatch(
  actual: FaceRatioPhase1ReplayCondition,
  expected: FaceRatioPhase1ReplayCondition,
) {
  return (
    actual.distanceLabel === expected.distanceLabel &&
    actual.isReference === expected.isReference &&
    actual.poseLabel === expected.poseLabel &&
    actual.repeatGroup === expected.repeatGroup &&
    actual.repeatIndex === expected.repeatIndex
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function decodeBase64Json(value: string): unknown {
  const binary = globalThis.atob(value);
  const json = decodeURIComponent(
    Array.from(binary)
      .map(character =>
        `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`,
      )
      .join(''),
  );

  return JSON.parse(json) as unknown;
}

export function validateFaceRatioPreparedCollectionPlan(
  value: unknown,
  expectedShots: readonly ExpectedPhase1Shot[],
): asserts value is FaceRatioPreparedCollectionPlan {
  invariant(isRecord(value), 'prepared collection plan must be an object');
  invariant(
    value.schemaVersion === FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION,
    `prepared collection plan schemaVersion must be ${FACE_MEASUREMENT_COLLECTION_PLAN_SCHEMA_VERSION}`,
  );
  invariant(
    value.executionMode === 'dry_run_only',
    'prepared collection plan executionMode must be dry_run_only',
  );
  invariant(
    value.deviceActionsExecuted === false,
    'prepared collection plan must not claim device execution',
  );
  invariant(
    typeof value.cohortId === 'string' &&
      typeof value.subjectContextId === 'string' &&
      typeof value.sessionId === 'string',
    'prepared collection plan IDs are required',
  );
  invariant(
    isRecord(value.phase1) &&
      value.phase1.shotCount === 10 &&
      Array.isArray(value.phase1.shots) &&
      value.phase1.shots.length === 10,
    'prepared collection plan must contain exactly 10 Phase 1 shots',
  );
  invariant(
    expectedShots.length === 10,
    'app canonical Phase 1 plan must contain exactly 10 shots',
  );
  const privacy = value.privacy;
  invariant(isRecord(privacy), 'prepared collection plan privacy is invalid');
  const rawLandmarks = privacy.rawLandmarks;
  invariant(
    isRecord(rawLandmarks) &&
      Number.isInteger(rawLandmarks.retentionDays) &&
      rawLandmarks.localOnly === true &&
      rawLandmarks.separatedFromProductPayload === true &&
      rawLandmarks.uploadAllowed === false &&
      typeof rawLandmarks.deleteByUtc === 'string' &&
      Number.isFinite(Date.parse(rawLandmarks.deleteByUtc)),
    'prepared collection plan raw-landmark retention is invalid',
  );
  const phase2 = value.phase2;
  invariant(
    isRecord(phase2) &&
      phase2.collectionPolicyId === 'diagnostics-exact-30-v1' &&
      Number.isInteger(phase2.exact30RepeatCount) &&
      Number(phase2.exact30RepeatCount) >= 3 &&
      Number(phase2.exact30RepeatCount) <= 12 &&
      Array.isArray(phase2.shots) &&
      phase2.shots.length === phase2.exact30RepeatCount,
    'prepared collection plan Phase 2 exact-30 contract is invalid',
  );
  const sequence = value.sequence;
  invariant(
    Array.isArray(sequence) &&
      sequence.length === 10 + phase2.exact30RepeatCount,
    'prepared collection plan sequence is incomplete',
  );

  const captureIds = new Set<string>();
  value.phase1.shots.forEach((rawShot, index) => {
    const label = `prepared collection plan phase1.shots[${index}]`;
    invariant(isRecord(rawShot), `${label} must be an object`);
    invariant(rawShot.order === index + 1, `${label}.order is invalid`);
    invariant(
      rawShot.phase === 'phase1_pose_distance',
      `${label}.phase is invalid`,
    );
    invariant(
      rawShot.shotId === expectedShots[index].shotId,
      `${label}.shotId does not match the app canonical plan`,
    );
    validateFaceRatioPhase1ReplayValidation(rawShot.phase1ReplayValidation);
    const validation = rawShot.phase1ReplayValidation;
    invariant(
      validation.cohortId === value.cohortId &&
        validation.subjectId === value.subjectContextId &&
        validation.sessionId === value.sessionId,
      `${label} IDs do not match the collection plan`,
    );
    invariant(
      validation.retentionDays ===
        rawLandmarks.retentionDays,
      `${label}.retentionDays does not match the collection plan`,
    );
    invariant(
      conditionsMatch(validation.condition, expectedShots[index].condition),
      `${label}.condition does not match the app canonical plan`,
    );
    invariant(
      !captureIds.has(validation.captureId),
      `${label}.captureId is duplicated`,
    );
    captureIds.add(validation.captureId);

    const sequenceShot = sequence[index];
    invariant(
      isRecord(sequenceShot) &&
        sequenceShot.order === rawShot.order &&
        sequenceShot.phase === rawShot.phase &&
        sequenceShot.shotId === rawShot.shotId &&
        canonicalJson(sequenceShot.phase1ReplayValidation) ===
          canonicalJson(validation),
      `${label} does not match sequence[${index}]`,
    );
  });

  const phase2ShotIds = new Set<string>();
  phase2.shots.forEach((rawShot, index) => {
    const label = `prepared collection plan phase2.shots[${index}]`;
    const sequenceIndex = 10 + index;
    const expectedShotIdPattern = new RegExp(
      `^p2-${String(index + 1).padStart(2, '0')}-` +
        'exact30-frontal-neutral-[a-f0-9]{16}$',
    );
    invariant(isRecord(rawShot), `${label} must be an object`);
    invariant(
      rawShot.order === sequenceIndex + 1 &&
        rawShot.phase === 'phase2_exact30_baseline' &&
        typeof rawShot.shotId === 'string' &&
        expectedShotIdPattern.test(rawShot.shotId) &&
        !phase2ShotIds.has(rawShot.shotId) &&
        rawShot.subjectContextId === value.subjectContextId &&
        rawShot.sessionId === value.sessionId &&
        rawShot.collectionPolicyId === 'diagnostics-exact-30-v1' &&
        rawShot.expectedEventType === 'unified_face_capture_completed' &&
        rawShot.requiredValidFrameCount === 30 &&
        rawShot.requiredTargetFrameCount === 30 &&
        rawShot.uploadAllowed === false &&
        canonicalJson(sequence[sequenceIndex]) === canonicalJson(rawShot),
      `${label} does not match the exact-30 sequence contract`,
    );
    phase2ShotIds.add(rawShot.shotId);
  });
}

export function resolveFaceRatioPhase1CollectionPlan({
  encodedPlan,
  expectedShots,
  modeValue,
}: {
  encodedPlan: string | undefined;
  expectedShots: readonly ExpectedPhase1Shot[];
  modeValue: string | undefined;
}): FaceRatioPhase1CollectionPlanResolution {
  if (
    modeValue === undefined ||
    modeValue === FACE_MEASUREMENT_GENERIC_COLLECTION_MODE
  ) {
    return encodedPlan
      ? {
          error:
            'Prepared collection plan was provided without prepared collection mode.',
          mode: 'invalid',
          plan: null,
        }
      : {error: null, mode: 'generic', plan: null};
  }

  if (modeValue !== FACE_MEASUREMENT_PREPARED_COLLECTION_MODE) {
    return {
      error: `Unsupported face measurement collection mode: ${modeValue}`,
      mode: 'invalid',
      plan: null,
    };
  }

  if (!encodedPlan) {
    return {
      error: 'Prepared collection mode requires a base64 collection plan.',
      mode: 'invalid',
      plan: null,
    };
  }

  try {
    const plan = decodeBase64Json(encodedPlan);
    validateFaceRatioPreparedCollectionPlan(plan, expectedShots);
    return {error: null, mode: 'prepared', plan};
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Prepared collection plan validation failed.',
      mode: 'invalid',
      plan: null,
    };
  }
}

export function resolveFaceRatioPreparedCollectionProgress(
  artifactValue: unknown | null,
  plan: FaceRatioPreparedCollectionPlan,
): FaceRatioPreparedCollectionProgress {
  if (artifactValue === null) {
    return {
      completedShotCount: 0,
      nextShotIndex: 1,
      phase1Completed: false,
    };
  }

  validateFaceRatioPhase1ReplayArtifact(artifactValue);
  invariant(
    artifactValue.cohortId === plan.cohortId &&
      artifactValue.sessionId === plan.sessionId &&
      artifactValue.privacy.retention.deleteAfterDays ===
        plan.privacy.rawLandmarks.retentionDays,
    'existing Phase 1 replay metadata does not match the prepared collection plan',
  );
  invariant(
    artifactValue.captures.length <= plan.phase1.shots.length,
    'existing Phase 1 replay has more captures than the prepared collection plan',
  );

  artifactValue.captures.forEach((capture, index) => {
    const planned =
      plan.phase1.shots[index]?.phase1ReplayValidation;
    invariant(
      Boolean(planned) &&
        capture.captureId === planned.captureId &&
        capture.subjectId === planned.subjectId &&
        conditionsMatch(capture.condition, planned.condition) &&
        canonicalJson(capture.acquisition) ===
          canonicalJson(planned.acquisition),
      `existing Phase 1 replay capture ${index + 1} does not match the prepared collection plan prefix`,
    );
  });

  const completedShotCount = artifactValue.captures.length;
  const phase1Completed =
    completedShotCount === plan.phase1.shots.length;

  return {
    completedShotCount,
    nextShotIndex: phase1Completed ? plan.phase1.shots.length : completedShotCount + 1,
    phase1Completed,
  };
}

export function resolveFaceRatioPreparedExact30Progress(
  evidenceJsonl: string,
  plan: FaceRatioPreparedCollectionPlan,
): FaceRatioPreparedExact30Progress {
  invariant(
    typeof evidenceJsonl === 'string',
    'Face3D runtime evidence must be JSONL text',
  );
  const plannedShotIds = plan.phase2.shots.map(shot => shot.shotId);
  const plannedShotIdSet = new Set(plannedShotIds);
  const completedShotIds = new Set<string>();

  evidenceJsonl
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .forEach((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        throw new Error(
          `Face3D runtime evidence line ${index + 1} is not valid JSON`,
        );
      }
      if (!isRecord(value) || !isRecord(value.event)) {
        return;
      }
      const requestId = value.event.requestId;
      if (
        typeof requestId !== 'string' ||
        !plannedShotIdSet.has(requestId)
      ) {
        return;
      }

      invariant(
        value.schemaVersion === 'aura.face3d-runtime-evidence.v1' &&
          value.rawFaceDataIncluded === false &&
          value.event.type === 'face3d_analyzed' &&
          isRecord(value.event.profile) &&
          value.event.profile.schemaVersion === 'aura.face3d-profile.v3' &&
          value.event.profile.collectionPolicyId ===
            'diagnostics-exact-30-v1' &&
          value.event.profile.validFrameCount === 30 &&
          value.event.profile.targetFrameCount === 30 &&
          isRecord(value.unifiedCapture) &&
          value.unifiedCapture.sourceEventType ===
            'unified_face_capture_completed' &&
          typeof value.unifiedCapture.captureId === 'string',
        `Face3D runtime evidence for ${requestId} is not a valid exact-30 completion`,
      );
      invariant(
        !completedShotIds.has(requestId),
        `Face3D runtime evidence contains duplicate prepared requestId ${requestId}`,
      );
      invariant(
        requestId === plannedShotIds[completedShotIds.size],
        'Face3D runtime evidence exact-30 completions are not a canonical plan prefix',
      );
      completedShotIds.add(requestId);
    });

  let completedShotCount = 0;
  while (
    completedShotCount < plannedShotIds.length &&
    completedShotIds.has(plannedShotIds[completedShotCount])
  ) {
    completedShotCount += 1;
  }
  invariant(
    plannedShotIds
      .slice(completedShotCount)
      .every(shotId => !completedShotIds.has(shotId)),
    'Face3D runtime evidence exact-30 completions are not a canonical plan prefix',
  );

  const phase2Completed = completedShotCount === plannedShotIds.length;
  return {
    completedShotCount,
    nextShotIndex: phase2Completed
      ? plannedShotIds.length
      : completedShotCount + 1,
    phase2Completed,
  };
}

export function resolveFaceRatioPhase1CollectionPlanFromEnvironment(
  expectedShots: readonly ExpectedPhase1Shot[],
) {
  return resolveFaceRatioPhase1CollectionPlan({
    encodedPlan:
      process.env.EXPO_PUBLIC_AURA_FACE_MEASUREMENT_COLLECTION_PLAN_BASE64,
    expectedShots,
    modeValue:
      process.env.EXPO_PUBLIC_AURA_FACE_MEASUREMENT_COLLECTION_MODE,
  });
}
