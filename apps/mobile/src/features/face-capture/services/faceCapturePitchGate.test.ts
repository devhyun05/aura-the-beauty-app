import {
  evaluateFacePitchGate,
  FACE_PITCH_GATE_MAX_ABS_DEG,
} from './faceCapturePitchGate';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// 정면 근처는 통과
expect(evaluateFacePitchGate(0).pitchOk, 'pitch 0 passes');
expect(evaluateFacePitchGate(8).pitchOk, 'pitch within limit passes');
expect(evaluateFacePitchGate(-FACE_PITCH_GATE_MAX_ABS_DEG).pitchOk, 'pitch at -limit passes');

// 한계 초과는 차단 (들거나 숙이거나 양방향)
expect(!evaluateFacePitchGate(FACE_PITCH_GATE_MAX_ABS_DEG + 1).pitchOk, 'pitch above limit blocks');
expect(!evaluateFacePitchGate(-20).pitchOk, 'large negative pitch blocks');

// 값 없음/비유한은 통과 (얼굴 미검출은 greenlight가 담당)
expect(evaluateFacePitchGate(undefined).pitchOk, 'missing pitch passes');
expect(evaluateFacePitchGate(undefined).pitchDeg === null, 'missing pitch reports null');
expect(evaluateFacePitchGate(Number.NaN).pitchOk, 'NaN pitch passes');

// 커스텀 임계값
expect(!evaluateFacePitchGate(6, 5).pitchOk, 'custom threshold respected');

console.log('faceCapturePitchGate tests passed');
