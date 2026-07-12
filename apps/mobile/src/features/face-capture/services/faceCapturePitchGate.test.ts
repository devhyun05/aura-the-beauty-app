import {
  evaluateFacePitchGate,
  FACE_PITCH_GATE_MAX_ABS_DEG,
} from './faceCapturePitchGate';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// 정면 근처는 통과 (임계값은 마진 반영된 상수를 참조 — 하드코딩 금지)
expect(evaluateFacePitchGate(0).pitchOk, 'pitch 0 passes');
expect(evaluateFacePitchGate(FACE_PITCH_GATE_MAX_ABS_DEG).pitchOk, 'pitch at +limit passes');
expect(evaluateFacePitchGate(-FACE_PITCH_GATE_MAX_ABS_DEG).pitchOk, 'pitch at -limit passes');

// 한계 초과는 차단 (들거나 숙이거나 양방향)
expect(!evaluateFacePitchGate(FACE_PITCH_GATE_MAX_ABS_DEG + 1).pitchOk, 'pitch above limit blocks');
expect(!evaluateFacePitchGate(-20).pitchOk, 'large negative pitch blocks');

// 값 없음/비유한: 기본(requireValid=false)은 통과, requireValid=true 는 차단(fail-closed)
expect(evaluateFacePitchGate(undefined).pitchOk, 'missing pitch passes when not required');
expect(evaluateFacePitchGate(undefined).pitchDeg === null, 'missing pitch reports null');
expect(evaluateFacePitchGate(Number.NaN).pitchOk, 'NaN pitch passes when not required');
expect(!evaluateFacePitchGate(undefined, undefined, true).pitchOk, 'missing pitch blocks when requireValid');
expect(!evaluateFacePitchGate(Number.NaN, undefined, true).pitchOk, 'NaN pitch blocks when requireValid');

// 커스텀 임계값
expect(!evaluateFacePitchGate(6, 5).pitchOk, 'custom threshold respected');

console.log('faceCapturePitchGate tests passed');
