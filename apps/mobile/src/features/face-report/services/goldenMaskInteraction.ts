export const GOLDEN_MASK_YAW_LIMIT = 90;
export const GOLDEN_MASK_PITCH_LIMIT = 40;

type GoldenMaskRotation = {
  pitch: number;
  yaw: number;
};

type GoldenMaskGesture = {
  dx: number;
  dy: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function resolveGoldenMaskRotation(
  start: GoldenMaskRotation,
  gesture: GoldenMaskGesture,
): GoldenMaskRotation {
  return {
    pitch: clamp(
      start.pitch - gesture.dy * 0.24,
      -GOLDEN_MASK_PITCH_LIMIT,
      GOLDEN_MASK_PITCH_LIMIT,
    ),
    yaw: clamp(
      start.yaw + gesture.dx * 0.34,
      -GOLDEN_MASK_YAW_LIMIT,
      GOLDEN_MASK_YAW_LIMIT,
    ),
  };
}

export function shouldEnableFaceReportBackGesture(): boolean {
  // Horizontal gestures inside a report belong exclusively to the report
  // pager. Native iOS swipe-back competes for the same rightward edge swipe
  // and can pop the entire report before the pager receives the gesture.
  return false;
}
