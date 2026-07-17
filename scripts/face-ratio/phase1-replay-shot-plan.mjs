import {readFileSync} from 'node:fs';

export const PHASE1_REPLAY_SHOT_PLAN_SCHEMA_VERSION =
  'aura.face-ratio.phase1-shot-plan.v1';

const planUrl = new URL(
  '../../apps/mobile/src/features/face-ratio/phase1ReplayShotPlan.json',
  import.meta.url,
);
const parsedPlan = JSON.parse(readFileSync(planUrl, 'utf8'));

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expectedKeys, label) {
  invariant(isRecord(value), `${label} must be an object`);
  invariant(
    Object.keys(value).sort().join(',') === [...expectedKeys].sort().join(','),
    `${label} must contain exactly ${expectedKeys.join(', ')}`,
  );
}

function validateShot(shot, index) {
  const label = `phase1ReplayShotPlan.shots[${index}]`;
  exactKeys(shot, ['collection', 'condition', 'lab'], label);
  exactKeys(
    shot.collection,
    shot.collection.targetAbsDeg === undefined
      ? ['distance', 'pose', 'purpose', 'shotId']
      : ['distance', 'pose', 'purpose', 'shotId', 'targetAbsDeg'],
    `${label}.collection`,
  );
  exactKeys(
    shot.condition,
    ['distanceLabel', 'isReference', 'poseLabel', 'repeatGroup', 'repeatIndex'],
    `${label}.condition`,
  );
  exactKeys(shot.lab, ['instruction', 'label'], `${label}.lab`);

  for (const [key, value] of Object.entries(shot.collection)) {
    if (key === 'targetAbsDeg') {
      invariant(
        typeof value === 'number' && Number.isFinite(value) && value > 0,
        `${label}.collection.targetAbsDeg must be positive`,
      );
    } else {
      invariant(
        typeof value === 'string' && value.length > 0,
        `${label}.collection.${key} is required`,
      );
    }
  }
  invariant(
    typeof shot.condition.distanceLabel === 'string' &&
      shot.condition.distanceLabel.length > 0,
    `${label}.condition.distanceLabel is required`,
  );
  invariant(
    typeof shot.condition.isReference === 'boolean',
    `${label}.condition.isReference must be boolean`,
  );
  invariant(
    typeof shot.condition.poseLabel === 'string' &&
      shot.condition.poseLabel.length > 0,
    `${label}.condition.poseLabel is required`,
  );
  invariant(
    typeof shot.condition.repeatGroup === 'string' &&
      shot.condition.repeatGroup.length > 0,
    `${label}.condition.repeatGroup is required`,
  );
  invariant(
    Number.isInteger(shot.condition.repeatIndex) &&
      shot.condition.repeatIndex >= 1,
    `${label}.condition.repeatIndex must be >= 1`,
  );
  invariant(
    typeof shot.lab.instruction === 'string' &&
      shot.lab.instruction.length > 0 &&
      typeof shot.lab.label === 'string' &&
      shot.lab.label.length > 0,
    `${label}.lab instruction and label are required`,
  );
}

exactKeys(parsedPlan, ['schemaVersion', 'shots'], 'phase1ReplayShotPlan');
invariant(
  parsedPlan.schemaVersion === PHASE1_REPLAY_SHOT_PLAN_SCHEMA_VERSION,
  `phase1ReplayShotPlan.schemaVersion must be ${PHASE1_REPLAY_SHOT_PLAN_SCHEMA_VERSION}`,
);
invariant(
  Array.isArray(parsedPlan.shots) && parsedPlan.shots.length === 10,
  'phase1ReplayShotPlan.shots must contain exactly 10 ordered shots',
);
parsedPlan.shots.forEach(validateShot);
invariant(
  new Set(parsedPlan.shots.map(shot => shot.collection.shotId)).size === 10,
  'phase1ReplayShotPlan shotId values must be unique',
);
invariant(
  parsedPlan.shots.filter(shot => shot.condition.isReference).length === 2 &&
    parsedPlan.shots[0].condition.isReference === true &&
    parsedPlan.shots[9].condition.isReference === true,
  'phase1ReplayShotPlan references must be exactly shots 1 and 10',
);

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
  } else if (isRecord(value)) {
    Object.values(value).forEach(deepFreeze);
  }
  return Object.freeze(value);
}

export const PHASE1_REPLAY_SHOTS = deepFreeze(parsedPlan.shots);

export function phase1ReplayConditionsMatch(actual, expected) {
  return (
    actual.distanceLabel === expected.distanceLabel &&
    actual.isReference === expected.isReference &&
    actual.poseLabel === expected.poseLabel &&
    actual.repeatGroup === expected.repeatGroup &&
    actual.repeatIndex === expected.repeatIndex
  );
}
