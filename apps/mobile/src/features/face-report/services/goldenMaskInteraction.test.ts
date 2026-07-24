import {
  GOLDEN_MASK_PITCH_LIMIT,
  GOLDEN_MASK_YAW_LIMIT,
  resolveGoldenMaskRotation,
  shouldEnableFaceReportBackGesture,
} from './goldenMaskInteraction';

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const profile = resolveGoldenMaskRotation(
  {pitch: 0, yaw: 0},
  {dx: 1000, dy: 0},
);
expectEqual(profile.yaw, GOLDEN_MASK_YAW_LIMIT, 'full profile yaw clamp');

const highAngle = resolveGoldenMaskRotation(
  {pitch: 0, yaw: 0},
  {dx: 0, dy: -1000},
);
expectEqual(highAngle.pitch, GOLDEN_MASK_PITCH_LIMIT, 'upper angle clamp');

const lowAngle = resolveGoldenMaskRotation(
  {pitch: 0, yaw: 0},
  {dx: 0, dy: 1000},
);
expectEqual(lowAngle.pitch, -GOLDEN_MASK_PITCH_LIMIT, 'lower angle clamp');

expectEqual(
  shouldEnableFaceReportBackGesture(),
  false,
  'the report pager exclusively owns horizontal gestures',
);

console.log('golden mask interaction contracts passed');
