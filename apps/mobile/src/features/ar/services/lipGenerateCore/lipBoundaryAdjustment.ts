import type { LipAdjustment, LipBoundary2D, LipPoint2D } from "./contracts";

export type LipFrameSize = {
  width: number;
  height: number;
};

export function adjustmentDelta(
  next: LipAdjustment,
  previous?: LipAdjustment
): LipAdjustment {
  return {
    cornerReach: next.cornerReach - (previous?.cornerReach ?? 0),
    upperLipTightness:
      next.upperLipTightness - (previous?.upperLipTightness ?? 0),
    lowerLipTightness:
      next.lowerLipTightness - (previous?.lowerLipTightness ?? 0),
    verticalOffset: next.verticalOffset - (previous?.verticalOffset ?? 0),
    innerFill: next.innerFill - (previous?.innerFill ?? 0),
    upperInnerFill: next.upperInnerFill - (previous?.upperInnerFill ?? 0),
  };
}

export function adjustLipBoundary<T extends LipBoundary2D>(
  boundary: T,
  adjustment: LipAdjustment,
  frameSize?: LipFrameSize
): T {
  const referenceBounds = bounds(boundary.outerPoints);
  if (!referenceBounds) {
    return {
      ...boundary,
      outerPoints: [],
      innerPoints: [],
    };
  }

  return {
    ...boundary,
    outerPoints: applyLipAdjustmentToPoints(
      boundary.outerPoints,
      adjustment,
      referenceBounds,
      frameSize
    ),
    innerPoints: applyLipAdjustmentToPoints(
      boundary.innerPoints,
      adjustment,
      referenceBounds,
      frameSize,
      { inner: true },
      bounds(boundary.innerPoints) ?? referenceBounds
    ),
  };
}

export function adjustLipBoundaryFromPrevious<T extends LipBoundary2D>(
  boundary: T,
  previousAdjustment: LipAdjustment | undefined,
  nextAdjustment: LipAdjustment,
  frameSize?: LipFrameSize
): T {
  return adjustLipBoundary(
    boundary,
    adjustmentDelta(nextAdjustment, previousAdjustment),
    frameSize
  );
}

export function buildClosedSvgPath(points: LipPoint2D[]): string {
  if (!points.length) {
    return "";
  }

  const [first, ...rest] = points;
  const segments = [
    `M ${formatPoint(first.x)} ${formatPoint(first.y)}`,
    ...rest.map((point) => `L ${formatPoint(point.x)} ${formatPoint(point.y)}`),
    "Z",
  ];
  return segments.join(" ");
}

export function buildLipBoundarySvgPath(boundary: LipBoundary2D): string {
  return [
    buildClosedSvgPath(boundary.outerPoints),
    buildClosedSvgPath(boundary.innerPoints),
  ]
    .filter(Boolean)
    .join(" ");
}

function applyLipAdjustmentToPoints(
  points: LipPoint2D[],
  adjustment: LipAdjustment,
  referenceBounds: [number, number, number, number],
  frameSize: LipFrameSize | undefined,
  options: { inner?: boolean } = {},
  innerReferenceBounds?: [number, number, number, number]
): LipPoint2D[] {
  if (!points.length) {
    return [];
  }

  const [minX, minY, maxX, maxY] = referenceBounds;
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const centerX = minX + width * 0.5;
  const centerY = minY + height * 0.5;
  const cornerScale = options.inner ? 0.45 : 1;
  const tightnessScale = options.inner ? 0.35 : 1;
  const [innerMinX, innerMinY, innerMaxX, innerMaxY] =
    innerReferenceBounds ?? referenceBounds;
  const innerWidth = Math.max(innerMaxX - innerMinX, 1);
  const innerHeight = Math.max(innerMaxY - innerMinY, 1);
  const innerCenterX = innerMinX + innerWidth * 0.5;
  const innerCenterY = innerMinY + innerHeight * 0.5;

  return points.map((point) => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const cornerWeight = Math.min(1, Math.abs(dx) / (width * 0.5));
    const verticalWeight = Math.min(1, Math.abs(dy) / (height * 0.5));

    let x =
      centerX +
      dx * (1 + adjustment.cornerReach * 0.22 * cornerWeight * cornerScale);
    let y = point.y - adjustment.verticalOffset * height * 0.38;

    if (dy < 0) {
      y -=
        adjustment.upperLipTightness *
        height *
        0.24 *
        verticalWeight *
        tightnessScale;
    } else if (dy > 0) {
      y +=
        adjustment.lowerLipTightness *
        height *
        0.24 *
        verticalWeight *
        tightnessScale;
    }

    if (options.inner) {
      const innerDx = x - innerCenterX;
      const innerDy = y - innerCenterY;
      const upperWeight =
        innerDy < 0 ? Math.min(1, Math.abs(innerDy) / (innerHeight * 0.5)) : 0;
      const overallFill = clamp(adjustment.innerFill * 0.45, -0.45, 0.65);
      const upperFill = clamp(
        adjustment.upperInnerFill * 0.58 * upperWeight,
        -0.45,
        0.72
      );
      const fill = clamp(overallFill + upperFill, -0.6, 0.78);
      if (Math.abs(fill) > 0.0001) {
        x = innerCenterX + innerDx * (1 - fill * 0.35);
        y = innerCenterY + innerDy * (1 - fill);
      }
    }

    if (frameSize) {
      x = clamp(x, 0, Math.max(0, frameSize.width - 1));
      y = clamp(y, 0, Math.max(0, frameSize.height - 1));
    }

    return { x, y };
  });
}

function bounds(points: LipPoint2D[]): [number, number, number, number] | null {
  if (!points.length) {
    return null;
  }

  return points.reduce(
    ([minX, minY, maxX, maxY], point) => [
      Math.min(minX, point.x),
      Math.min(minY, point.y),
      Math.max(maxX, point.x),
      Math.max(maxY, point.y),
    ],
    [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ] as [number, number, number, number]
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatPoint(value: number): string {
  return Number(value.toFixed(2)).toString();
}
