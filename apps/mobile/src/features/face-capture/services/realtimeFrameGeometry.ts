// AURARealtimeGeometry.h 의 TS 미러 — 수식이 1:1 로 같아야 한다.
//
// CI 는 ObjC 를 컴파일하지 못하므로, 네이티브 기하 수식의 회귀는 이 미러가
// 같은 골든벡터(scripts/mobile/fixtures/realtime-geometry-golden.json)를
// 통과하는 것으로 상시 검증한다. 로컬(macOS)에서는
// scripts/ios/run-realtime-geometry-golden.mjs 가 헤더 원본을 clang 으로
// 직접 컴파일해 같은 JSON 을 통과시킨다. 수식을 바꾸면 반드시 세 곳
// (헤더/이 파일/JSON)을 함께 바꿀 것.
//
// 계약 요약 (헤더 주석 참조):
// - 모든 점은 정규화 [0,1], 원점 top-left.
// - FrameRotation 은 "vision 프레임 점 → 정준(upright portrait, unmirrored)
//   프레임" 변환.
// - 정준 → captureDevice 는 (y,x) 스왑 앵커. 미러는 preview connection 소유.

export type FrameRotation = 'upright' | 'rot90cw' | 'rot90ccw' | 'rot180' | 'unknown';

export type NormalizedPoint = {
  x: number;
  y: number;
};

const DETECTION_CANDIDATES: readonly FrameRotation[] = [
  'upright',
  'rot90cw',
  'rot90ccw',
  'rot180',
];

// vision 프레임 점 → 정준 프레임 점.
export function canonicalPoint(p: NormalizedPoint, rotation: FrameRotation): NormalizedPoint {
  switch (rotation) {
    case 'rot90cw':
      return {x: 1 - p.y, y: p.x};
    case 'rot90ccw':
      return {x: p.y, y: 1 - p.x};
    case 'rot180':
      return {x: 1 - p.x, y: 1 - p.y};
    default:
      return {x: p.x, y: p.y};
  }
}

// 정준 프레임 점 → vision 프레임 점 (역변환).
export function visionPointFromCanonical(
  c: NormalizedPoint,
  rotation: FrameRotation,
): NormalizedPoint {
  switch (rotation) {
    case 'rot90cw':
      return {x: c.y, y: 1 - c.x};
    case 'rot90ccw':
      return {x: 1 - c.y, y: c.x};
    case 'rot180':
      return {x: 1 - c.x, y: 1 - c.y};
    default:
      return {x: c.x, y: c.y};
  }
}

// 프레임 회전 자가판정 — 후보 전수 검사 + 유일성 요구 (헤더와 동일 수식).
// 엄격 부등식에서 후보는 최대 1개 — 유일성 검사는 경계 동률(FP-tie)과 퇴화
// 입력(프로브 없음/눈 한 점/프로브가 정확히 눈높이)을 unknown 으로 밀어낸다.
export function detectFrameRotation(
  leftEye: NormalizedPoint,
  rightEye: NormalizedPoint,
  probe: NormalizedPoint | null,
): FrameRotation {
  if (!probe) {
    return 'unknown';
  }

  let match: FrameRotation = 'unknown';
  let matchCount = 0;

  for (const rotation of DETECTION_CANDIDATES) {
    const l = canonicalPoint(leftEye, rotation);
    const r = canonicalPoint(rightEye, rotation);
    const n = canonicalPoint(probe, rotation);
    const dx = Math.abs(r.x - l.x);
    const dy = Math.abs(r.y - l.y);

    if (dx < 1e-6 && dy < 1e-6) {
      continue;
    }
    if (dx < dy) {
      continue;
    }
    const eyeMidY = (l.y + r.y) / 2;
    if (n.y <= eyeMidY) {
      continue;
    }

    matchCount += 1;
    match = rotation;
  }

  return matchCount === 1 ? match : 'unknown';
}

// 정준 점 → captureDevice 좌표 ((y,x) 스왑 앵커, 미러 미적용).
export function captureDevicePointFromCanonical(
  c: NormalizedPoint,
  _isFront: boolean,
): NormalizedPoint {
  return {x: c.y, y: c.x};
}

// 화면 공간 눈선 기울기 — |Δy| / max(|Δx|, eps).
export function screenEyeLineTilt(
  leftEyeScreen: NormalizedPoint,
  rightEyeScreen: NormalizedPoint,
): number {
  const dx = Math.abs(rightEyeScreen.x - leftEyeScreen.x);
  const dy = Math.abs(rightEyeScreen.y - leftEyeScreen.y);
  return dy / Math.max(dx, 1e-6);
}
