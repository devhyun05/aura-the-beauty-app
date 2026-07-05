import {
  ExpressionAssistMode,
  LipAdjustment,
  LipGeneratePackage,
  LipMaskProvider,
} from '../lipGenerateCore';

export type E7CaptureShotKind =
  | 'neutral'
  | 'mouthOpen'
  | 'mouthClosed'
  | 'smile'
  | 'pucker'
  | 'yawLeft'
  | 'yawRight';

export type E7Point2D = {
  x: number;
  y: number;
};

export type E7LipBoundarySmoothingAlgorithm = 'curve_densified_v1';

export type E7LipBoundarySmoothingDiagnostics = {
  samplesPerSegment: number;
  originalOuterPointCount: number;
  originalInnerPointCount: number;
  smoothedOuterPointCount: number;
  smoothedInnerPointCount: number;
};

export type E7NativeBoundaryResult = {
  status: 'ready' | 'partial' | 'blocked';
  provider: LipMaskProvider;
  captureSetId: string;
  capturePairId: string;
  captureShotKind: E7CaptureShotKind;
  framePath: string;
  framePreviewUri?: string;
  arFaceExportPath: string;
  fullFaceLandmarksPath?: string;
  debugArtifacts?: {
    fullFaceLandmarks?: string;
  };
  frameWidth: number;
  frameHeight: number;
  boundary?: {
    coordinateSpace: 'frame_image_pixel_top_left';
    outerPoints: E7Point2D[];
    innerPoints: E7Point2D[];
    source: LipMaskProvider;
    generationMethod: string;
    boundarySmoothing?: E7LipBoundarySmoothingAlgorithm;
    originalPointCount?: number;
    smoothedPointCount?: number;
    smoothingDiagnostics?: E7LipBoundarySmoothingDiagnostics;
  };
  arFaceExport?: E7ArFaceExport;
  blendShapes?: E7BlendShapeState;
  faceLandmarks?: E7NativeFaceLandmarks;
  warnings?: string[];
  blockedReason?: string;
};

export type E7NativeFaceLandmarkRegion = {
  // Fraction of dark (hair-like) samples in the band above the brow, measured
  // by the native appearance sampler. High values mean bangs cover the
  // forehead so there is no skin to inpaint the real brow from.
  aboveBrowDarkRatio?: number;
  aboveBrowSampleCount?: number;
  corePointCount?: number;
  generationMethod?: string;
  imagePoints?: E7Point2D[];
  indices?: number[];
  pointCount?: number;
  skinBaselineLuma?: number;
  status?: 'available' | 'unavailable' | string;
};

export type E7NativeFaceLandmarks = {
  contours?: Record<string, E7NativeFaceLandmarkRegion>;
  coordinateSpace: 'frame_image_pixel_top_left';
  faceBoundingBox?: Record<string, number>;
  landmarkCount?: number;
  namedRegions?: Record<string, E7NativeFaceLandmarkRegion>;
  provider: LipMaskProvider;
};

export type E7ArFaceExport = {
  capturePairId?: string;
  screenVertices: number[][];
  uvs: number[][];
  indices: number[];
  display?: {
    videoFrameSize?: number[];
    orientation?: string;
    isMirrored?: boolean;
  };
};

export type E7BlendShapeState = {
  available: boolean;
  keySignals?: Record<string, number>;
  reason?: string;
};

export type E7GeneratedCandidate = {
  candidateKey: string;
  title: string;
  provider: LipMaskProvider;
  expressionMode: ExpressionAssistMode;
  status: 'ready' | 'partial' | 'blocked';
  package?: LipGeneratePackage;
  warnings: string[];
  blockedReason?: string;
};

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CURVE_DENSIFIED_ALGORITHM: E7LipBoundarySmoothingAlgorithm =
  'curve_densified_v1';
const CURVE_DENSIFIED_SAMPLES_PER_SEGMENT = 6;
const ADJUSTMENT_CORNER_REACH_SCALE = 0.46;
const ADJUSTMENT_VERTICAL_OFFSET_SCALE = 0.72;
const ADJUSTMENT_LIP_TIGHTNESS_SCALE = 0.48;
const ADJUSTMENT_INNER_FILL_SCALE = 0.62;
const ADJUSTMENT_UPPER_INNER_FILL_SCALE = 1.18;
const ADJUSTMENT_INNER_FILL_X_SCALE = 0.5;
const ADJUSTMENT_UPPER_INNER_SEAM_SCALE = 0.12;
const AUTO_LOWER_LIP_SPILL_GUARD_TIGHTNESS = 0.34;
const AUTO_UPPER_INNER_FILL_BIAS = 0.34;
const AUTO_UPPER_INNER_FILL_USER_DECAY_AT = 0.45;
const AUTO_UPPER_INNER_FILL_MAX_EFFECTIVE = 0.58;
const MEDIAPIPE_INNER_LIP_POINT_COUNT = 20;
const MEDIAPIPE_INNER_LOWER_END_INDEX = 10;
const MEDIAPIPE_INNER_UPPER_START_INDEX = 11;
const UV_ALPHA_CHECKSUM_MOD = 2147483647;
const GENERATED_UV_MASK_RESOLUTION = 512;
const GENERATED_UV_SUPERSAMPLE_GRID = 2;
const GENERATED_UV_ALPHA_EDGE_LOW = 8;
const GENERATED_UV_ALPHA_EDGE_HIGH = 247;
const BLEND_MASK_CONSENSUS_THRESHOLD = 0.55;
const BLEND_MASK_NEUTRAL_EXPAND_RATIO = 0.18;
const BLEND_EXPRESSION_MASK_RESOLUTION = 96;
const BLEND_SHOT_WEIGHTS: Record<E7CaptureShotKind, number> = {
  neutral: 1,
  mouthOpen: 0.45,
  mouthClosed: 0.35,
  smile: 0.45,
  pucker: 0.45,
  yawLeft: 0.25,
  yawRight: 0.25,
};

type E7UvAlphaBoundingBox = {
  minColumn: number;
  minRow: number;
  maxColumn: number;
  maxRow: number;
};

type E7UvCoverageMetadataWithDiagnostics = NonNullable<
  LipGeneratePackage['uvCoverageMetadata']
> & {
  positiveTexels: number;
  alphaSum: number;
  alphaChecksum: number;
  edgeBandTexels: number;
  edgeBandRatio: number;
  innerHoleSampleCount: number;
  innerHolePositiveRatio: number;
  previewVsUvRoundTripDelta: number;
  alphaBoundingBoxTexels?: E7UvAlphaBoundingBox;
  boundarySmoothing: E7LipBoundarySmoothingAlgorithm;
  originalPointCount: number;
  smoothedPointCount: number;
};

type E7UvMaskRawRgbaResult = {
  rawRgbaBase64: string;
  rawAlpha: Uint8Array;
  innerHoleAlpha: Uint8Array;
  width: number;
  height: number;
  coverageTexels: number;
  positiveTexels: number;
  unknownTexels: number;
  alphaSum: number;
  alphaChecksum: number;
  edgeBandTexels: number;
  edgeBandRatio: number;
  innerHoleSampleCount: number;
  innerHolePositiveRatio: number;
  previewVsUvRoundTripDelta: number;
  alphaBoundingBoxTexels?: E7UvAlphaBoundingBox;
};

type E7BlendUvMaskResult = E7UvMaskRawRgbaResult & {
  blendMaskKind: 'neutral_single_shot_v1' | 'capture_set_consensus_v1';
  blendShotKindsUsed: E7CaptureShotKind[];
  blendUsableShotCount: number;
  blendFallbackReason?: string;
  uvOnlyAlphaChecksum: number;
  blendAlphaChecksum: number;
  uvOnlyVsBlendAlphaDelta: number;
  innerMouthSuppressedTexels: number;
  lowerLipGuardApplied: boolean;
  lowerLipGuardClippedTexels: number;
  consensusThreshold: number;
  shotWeights: Partial<Record<E7CaptureShotKind, number>>;
};

type E7PrecomputedNeutralUv = {
  smoothedAdjustedBoundary: NonNullable<E7NativeBoundaryResult['boundary']>;
  uvOnly: E7UvMaskRawRgbaResult;
};

function summarizeNativeProviderResult(result: E7NativeBoundaryResult) {
  return {
    status: result.status,
    provider: result.provider,
    capturePairId: result.capturePairId,
    captureShotKind: result.captureShotKind,
    frameWidth: result.frameWidth,
    frameHeight: result.frameHeight,
    outerPointCount: result.boundary?.outerPoints.length ?? 0,
    innerPointCount: result.boundary?.innerPoints.length ?? 0,
    generationMethod: result.boundary?.generationMethod,
    fullFaceLandmarksPath: result.fullFaceLandmarksPath,
    blockedReason: result.blockedReason,
    warnings: result.warnings ?? [],
  };
}

function summarizeCaptureSetBlendShapes(
  results: E7NativeBoundaryResult[],
): Record<string, number> | undefined {
  const values: Record<string, number> = {};
  const maxValues: Record<string, number> = {};

  for (const result of results) {
    const keySignals = result.blendShapes?.keySignals;
    if (!keySignals) {
      continue;
    }

    for (const [name, value] of Object.entries(keySignals)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }

      values[`${result.captureShotKind}.${name}`] = value;
      maxValues[name] =
        maxValues[name] === undefined
          ? value
          : Math.max(maxValues[name], value);
    }
  }

  for (const [name, value] of Object.entries(maxValues)) {
    values[`max.${name}`] = value;
  }

  return Object.keys(values).length ? values : undefined;
}

export function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += BASE64_ALPHABET[Math.floor(first / 4)];
    output += BASE64_ALPHABET[(first % 4) * 16 + Math.floor(second / 16)];
    output += BASE64_ALPHABET[(second % 16) * 4 + Math.floor(third / 64)];
    output += BASE64_ALPHABET[third % 64];
  }
  if (index < bytes.length) {
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    output += BASE64_ALPHABET[Math.floor(bytes[index] / 4)];
    output +=
      BASE64_ALPHABET[(bytes[index] % 4) * 16 + Math.floor(second / 16)];
    output +=
      index + 1 < bytes.length ? BASE64_ALPHABET[(second % 16) * 4] : '=';
    output += '=';
  }
  return output;
}

function pointInPolygon(point: E7Point2D, polygon: E7Point2D[]) {
  let inside = false;
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index++
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y || Number.EPSILON) +
          current.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function isInLipMask(point: E7Point2D, outer: E7Point2D[], inner: E7Point2D[]) {
  if (outer.length < 3) {
    return false;
  }
  if (!pointInPolygon(point, outer)) {
    return false;
  }
  return inner.length < 3 || !pointInPolygon(point, inner);
}

function adjustNativeLipBoundary(
  boundary: NonNullable<E7NativeBoundaryResult['boundary']>,
  adjustment: LipAdjustment,
  frameSize: { width: number; height: number },
): NonNullable<E7NativeBoundaryResult['boundary']> {
  const referenceBounds = bounds(boundary.outerPoints);
  if (!referenceBounds) {
    return { ...boundary, outerPoints: [], innerPoints: [] };
  }

  return {
    ...boundary,
    outerPoints: applyLipAdjustmentToPoints(
      boundary.outerPoints,
      adjustment,
      referenceBounds,
      frameSize,
    ),
    innerPoints: isMediaPipeInnerLipBoundary(boundary)
      ? applyMediaPipeInnerLipAdjustmentToPoints(
          boundary.innerPoints,
          adjustment,
          referenceBounds,
          frameSize,
          bounds(boundary.innerPoints) ?? referenceBounds,
        )
      : applyLipAdjustmentToPoints(
          boundary.innerPoints,
          adjustment,
          referenceBounds,
          frameSize,
          { inner: true },
          bounds(boundary.innerPoints) ?? referenceBounds,
        ),
  };
}

function isMediaPipeInnerLipBoundary(
  boundary: NonNullable<E7NativeBoundaryResult['boundary']>,
) {
  return (
    boundary.source === 'mediapipe' &&
    boundary.innerPoints.length === MEDIAPIPE_INNER_LIP_POINT_COUNT
  );
}

function applyMediaPipeInnerLipAdjustmentToPoints(
  points: E7Point2D[],
  adjustment: LipAdjustment,
  referenceBounds: [number, number, number, number],
  frameSize: { width: number; height: number },
  innerReferenceBounds: [number, number, number, number],
): E7Point2D[] {
  const basePoints = applyLipAdjustmentToPoints(
    points,
    {
      ...adjustment,
      innerFill: 0,
      upperInnerFill: 0,
    },
    referenceBounds,
    frameSize,
    { inner: true },
    innerReferenceBounds,
  );
  const [innerMinX, innerMinY, innerMaxX, innerMaxY] = innerReferenceBounds;
  const innerWidth = Math.max(innerMaxX - innerMinX, 1);
  const innerHeight = Math.max(innerMaxY - innerMinY, 1);
  const innerCenterX = innerMinX + innerWidth * 0.5;
  const innerCenterY = innerMinY + innerHeight * 0.5;
  const overallFill = clamp(
    adjustment.innerFill * ADJUSTMENT_INNER_FILL_SCALE,
    -0.45,
    0.65,
  );
  const upperFill = clamp(
    adjustment.upperInnerFill * ADJUSTMENT_UPPER_INNER_FILL_SCALE,
    -0.45,
    0.72,
  );
  const overallAdjustedPoints =
    Math.abs(overallFill) > 0.0001
      ? basePoints.map(point => {
          const innerDx = point.x - innerCenterX;
          const innerDy = point.y - innerCenterY;
          return {
            x: clamp(
              innerCenterX +
                innerDx * (1 - overallFill * ADJUSTMENT_INNER_FILL_X_SCALE),
              0,
              Math.max(0, frameSize.width - 1),
            ),
            y: clamp(
              innerCenterY + innerDy * (1 - overallFill),
              0,
              Math.max(0, frameSize.height - 1),
            ),
          };
        })
      : basePoints;

  if (Math.abs(upperFill) <= 0.0001) {
    return overallAdjustedPoints;
  }

  const lowerCurve = overallAdjustedPoints.slice(
    0,
    MEDIAPIPE_INNER_LOWER_END_INDEX + 1,
  );
  const minMouthGapPx = clamp(innerHeight * 0.06, 0.55, 1.25);

  return overallAdjustedPoints.map((point, index) => {
    if (index < MEDIAPIPE_INNER_UPPER_START_INDEX) {
      return point;
    }

    const upperSemanticWeight = semanticUpperInnerWeight(index);
    if (upperFill > 0) {
      const lowerY = interpolateCurveYAtX(lowerCurve, point.x);
      if (lowerY === null) {
        return point;
      }
      const targetY = lowerY - minMouthGapPx;
      if (targetY <= point.y) {
        return point;
      }
      return {
        x: point.x,
        y: clamp(
          point.y + (targetY - point.y) * upperFill * upperSemanticWeight,
          0,
          Math.max(0, frameSize.height - 1),
        ),
      };
    }

    return {
      x: point.x,
      y: clamp(
        point.y -
          innerHeight * Math.abs(upperFill) * 0.18 * upperSemanticWeight,
        0,
        Math.max(0, frameSize.height - 1),
      ),
    };
  });
}

function semanticUpperInnerWeight(index: number) {
  const upperCenterIndex = 15;
  return clamp(1 - Math.abs(index - upperCenterIndex) / 5.5, 0.18, 1);
}

function interpolateCurveYAtX(points: E7Point2D[], x: number) {
  if (!points.length) {
    return null;
  }

  let fallbackY = points[0].y;
  let fallbackDistance = Math.abs(points[0].x - x);

  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const distance = Math.abs(point.x - x);
    if (distance < fallbackDistance) {
      fallbackDistance = distance;
      fallbackY = point.y;
    }
  }

  for (let index = 0; index + 1 < points.length; index++) {
    const start = points[index];
    const end = points[index + 1];
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    if (x < minX || x > maxX) {
      continue;
    }
    const dx = end.x - start.x;
    const t = Math.abs(dx) < 1e-6 ? 0.5 : (x - start.x) / dx;
    return start.y + (end.y - start.y) * clamp(t, 0, 1);
  }

  return fallbackY;
}

function applyAutoLipCoverageGuard(adjustment: LipAdjustment): LipAdjustment {
  const userUpperInnerFill = Math.max(0, adjustment.upperInnerFill);
  const upperInnerAutoBias =
    AUTO_UPPER_INNER_FILL_BIAS *
    clamp(1 - userUpperInnerFill / AUTO_UPPER_INNER_FILL_USER_DECAY_AT, 0, 1);

  return {
    ...adjustment,
    lowerLipTightness: clamp(
      adjustment.lowerLipTightness - AUTO_LOWER_LIP_SPILL_GUARD_TIGHTNESS,
      -1,
      1,
    ),
    upperInnerFill: clamp(
      adjustment.upperInnerFill + upperInnerAutoBias,
      -1,
      AUTO_UPPER_INNER_FILL_MAX_EFFECTIVE,
    ),
  };
}

export function smoothLipBoundaryCurveDensified(
  boundary: NonNullable<E7NativeBoundaryResult['boundary']>,
  frameSize: { width: number; height: number },
): NonNullable<E7NativeBoundaryResult['boundary']> {
  const outerPoints = densifyClosedCurve(
    boundary.outerPoints,
    frameSize,
    CURVE_DENSIFIED_SAMPLES_PER_SEGMENT,
  );
  const innerPoints = isMediaPipeInnerLipBoundary(boundary)
    ? densifyClosedPolyline(
        boundary.innerPoints,
        frameSize,
        CURVE_DENSIFIED_SAMPLES_PER_SEGMENT,
      )
    : densifyClosedCurve(
        boundary.innerPoints,
        frameSize,
        CURVE_DENSIFIED_SAMPLES_PER_SEGMENT,
      );
  const originalPointCount =
    boundary.outerPoints.length + boundary.innerPoints.length;
  const smoothedPointCount = outerPoints.length + innerPoints.length;

  return {
    ...boundary,
    outerPoints,
    innerPoints,
    generationMethod: `${boundary.generationMethod}+${CURVE_DENSIFIED_ALGORITHM}`,
    boundarySmoothing: CURVE_DENSIFIED_ALGORITHM,
    originalPointCount,
    smoothedPointCount,
    smoothingDiagnostics: {
      samplesPerSegment: CURVE_DENSIFIED_SAMPLES_PER_SEGMENT,
      originalOuterPointCount: boundary.outerPoints.length,
      originalInnerPointCount: boundary.innerPoints.length,
      smoothedOuterPointCount: outerPoints.length,
      smoothedInnerPointCount: innerPoints.length,
    },
  };
}

function densifyClosedCurve(
  points: E7Point2D[],
  frameSize: { width: number; height: number },
  samplesPerSegment: number,
): E7Point2D[] {
  if (points.length < 3) {
    return points.map(point => ({
      x: clamp(point.x, 0, Math.max(0, frameSize.width - 1)),
      y: clamp(point.y, 0, Math.max(0, frameSize.height - 1)),
    }));
  }

  const densified: E7Point2D[] = [];
  const count = points.length;
  for (let index = 0; index < count; index++) {
    const previous = points[(index - 1 + count) % count];
    const current = points[index];
    const next = points[(index + 1) % count];
    const afterNext = points[(index + 2) % count];

    for (let sample = 0; sample < samplesPerSegment; sample++) {
      const t = sample / samplesPerSegment;
      const point = catmullRomPoint(previous, current, next, afterNext, t);
      densified.push({
        x: clamp(point.x, 0, Math.max(0, frameSize.width - 1)),
        y: clamp(point.y, 0, Math.max(0, frameSize.height - 1)),
      });
    }
  }

  return densified;
}

function densifyClosedPolyline(
  points: E7Point2D[],
  frameSize: { width: number; height: number },
  samplesPerSegment: number,
): E7Point2D[] {
  if (points.length < 3) {
    return points.map(point => ({
      x: clamp(point.x, 0, Math.max(0, frameSize.width - 1)),
      y: clamp(point.y, 0, Math.max(0, frameSize.height - 1)),
    }));
  }

  const densified: E7Point2D[] = [];
  const count = points.length;
  for (let index = 0; index < count; index++) {
    const current = points[index];
    const next = points[(index + 1) % count];
    for (let sample = 0; sample < samplesPerSegment; sample++) {
      const t = sample / samplesPerSegment;
      densified.push({
        x: clamp(
          current.x + (next.x - current.x) * t,
          0,
          Math.max(0, frameSize.width - 1),
        ),
        y: clamp(
          current.y + (next.y - current.y) * t,
          0,
          Math.max(0, frameSize.height - 1),
        ),
      });
    }
  }

  return densified;
}

function catmullRomPoint(
  p0: E7Point2D,
  p1: E7Point2D,
  p2: E7Point2D,
  p3: E7Point2D,
  t: number,
): E7Point2D {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function applyLipAdjustmentToPoints(
  points: E7Point2D[],
  adjustment: LipAdjustment,
  referenceBounds: [number, number, number, number],
  frameSize: { width: number; height: number },
  options: { inner?: boolean } = {},
  innerReferenceBounds?: [number, number, number, number],
): E7Point2D[] {
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

  return points.map(point => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const cornerWeight = Math.min(1, Math.abs(dx) / (width * 0.5));
    const verticalWeight = Math.min(1, Math.abs(dy) / (height * 0.5));

    let x =
      centerX +
      dx *
        (1 +
          adjustment.cornerReach *
            ADJUSTMENT_CORNER_REACH_SCALE *
            cornerWeight *
            cornerScale);
    let y =
      point.y -
      adjustment.verticalOffset * height * ADJUSTMENT_VERTICAL_OFFSET_SCALE;

    if (dy < 0) {
      y -=
        adjustment.upperLipTightness *
        height *
        ADJUSTMENT_LIP_TIGHTNESS_SCALE *
        verticalWeight *
        tightnessScale;
    } else if (dy > 0) {
      y +=
        adjustment.lowerLipTightness *
        height *
        ADJUSTMENT_LIP_TIGHTNESS_SCALE *
        verticalWeight *
        tightnessScale;
    }

    if (options.inner) {
      const innerDx = x - innerCenterX;
      const innerDy = y - innerCenterY;
      const upperWeight =
        innerDy < 0 ? Math.min(1, Math.abs(innerDy) / (innerHeight * 0.5)) : 0;
      const overallFill = clamp(
        adjustment.innerFill * ADJUSTMENT_INNER_FILL_SCALE,
        -0.45,
        0.65,
      );
      const upperFill = clamp(
        adjustment.upperInnerFill *
          ADJUSTMENT_UPPER_INNER_FILL_SCALE *
          upperWeight,
        -0.45,
        0.72,
      );
      const fill = clamp(overallFill + upperFill, -0.6, 0.78);
      if (Math.abs(fill) > 0.0001) {
        x = innerCenterX + innerDx * (1 - fill * ADJUSTMENT_INNER_FILL_X_SCALE);
        y = innerCenterY + innerDy * (1 - fill);
      }
      if (adjustment.upperInnerFill > 0 && upperWeight > 0) {
        const seamOffset = Math.min(
          height * 0.075,
          height *
            ADJUSTMENT_UPPER_INNER_SEAM_SCALE *
            adjustment.upperInnerFill *
            upperWeight,
        );
        y += seamOffset;
      }
    }

    return {
      x: clamp(x, 0, Math.max(0, frameSize.width - 1)),
      y: clamp(y, 0, Math.max(0, frameSize.height - 1)),
    };
  });
}

function bounds(points: E7Point2D[]): [number, number, number, number] | null {
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
    ] as [number, number, number, number],
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function barycentric(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) {
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denominator) < 1e-6) {
    return null;
  }
  const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denominator;
  const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denominator;
  const w2 = 1 - w0 - w1;
  if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) {
    return null;
  }
  return [w0, w1, w2] as const;
}

function interpolateUv(
  weights: readonly [number, number, number],
  triangleUvs: number[][],
  triangleScreen: number[][],
) {
  const clipW = triangleScreen.map(vertex =>
    Math.abs(vertex[3] ?? 1) < 1e-6 ? 1 : vertex[3] ?? 1,
  );
  const invW = clipW.map(value => 1 / value);
  const denominator =
    weights[0] * invW[0] + weights[1] * invW[1] + weights[2] * invW[2];
  const safeDenominator = Math.abs(denominator) < 1e-6 ? 1 : denominator;
  const u =
    (weights[0] * triangleUvs[0][0] * invW[0] +
      weights[1] * triangleUvs[1][0] * invW[1] +
      weights[2] * triangleUvs[2][0] * invW[2]) /
    safeDenominator;
  const v =
    (weights[0] * triangleUvs[0][1] * invW[0] +
      weights[1] * triangleUvs[1][1] * invW[1] +
      weights[2] * triangleUvs[2][1] * invW[2]) /
    safeDenominator;
  return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) };
}

function uvToIndex(u: number, v: number, resolution: number) {
  const column = Math.round(u * (resolution - 1));
  const row = Math.round(v * (resolution - 1));
  return row * resolution + column;
}

function interpolateScreen(
  weights: readonly [number, number, number],
  triangleScreen: number[][],
) {
  return {
    x:
      weights[0] * triangleScreen[0][0] +
      weights[1] * triangleScreen[1][0] +
      weights[2] * triangleScreen[2][0],
    y:
      weights[0] * triangleScreen[0][1] +
      weights[1] * triangleScreen[1][1] +
      weights[2] * triangleScreen[2][1],
  };
}

function sampleAlphaAtUv(
  raw: Uint8Array,
  resolution: number,
  u: number,
  v: number,
) {
  const texelIndex = uvToIndex(
    Math.max(0, Math.min(1, u)),
    Math.max(0, Math.min(1, v)),
    resolution,
  );
  return raw[texelIndex * 4 + 3] ?? 0;
}

function projectScreenPointToUv(
  point: E7Point2D,
  arFaceExport: E7ArFaceExport,
) {
  const { screenVertices, uvs, indices } = arFaceExport;
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]];
    if (
      triangle.some(
        vertexIndex =>
          vertexIndex < 0 ||
          vertexIndex >= screenVertices.length ||
          vertexIndex >= uvs.length,
      )
    ) {
      continue;
    }

    const triScreen = triangle.map(vertexIndex => screenVertices[vertexIndex]);
    const weights = barycentric(
      point.x,
      point.y,
      triScreen[0][0],
      triScreen[0][1],
      triScreen[1][0],
      triScreen[1][1],
      triScreen[2][0],
      triScreen[2][1],
    );
    if (!weights) {
      continue;
    }

    return interpolateUv(
      weights,
      triangle.map(vertexIndex => uvs[vertexIndex]),
      triScreen,
    );
  }

  return null;
}

function estimatePreviewVsUvRoundTripDelta(input: {
  boundary: NonNullable<E7NativeBoundaryResult['boundary']>;
  arFaceExport: E7ArFaceExport;
  raw: Uint8Array;
  resolution: number;
}) {
  const outerPoints = input.boundary.outerPoints ?? [];
  const innerPoints = input.boundary.innerPoints ?? [];
  const outerBounds = bounds(outerPoints);
  const innerBounds = bounds(innerPoints) ?? outerBounds;
  const outerCenter = outerBounds
    ? {
        x: outerBounds[0] + (outerBounds[2] - outerBounds[0]) * 0.5,
        y: outerBounds[1] + (outerBounds[3] - outerBounds[1]) * 0.5,
      }
    : { x: 0, y: 0 };
  const innerCenter = innerBounds
    ? {
        x: innerBounds[0] + (innerBounds[2] - innerBounds[0]) * 0.5,
        y: innerBounds[1] + (innerBounds[3] - innerBounds[1]) * 0.5,
      }
    : outerCenter;
  let sampleCount = 0;
  let mismatchCount = 0;

  for (const point of outerPoints) {
    const samplePoint = {
      x: point.x + (outerCenter.x - point.x) * 0.04,
      y: point.y + (outerCenter.y - point.y) * 0.04,
    };
    const uv = projectScreenPointToUv(samplePoint, input.arFaceExport);
    if (!uv) {
      continue;
    }
    sampleCount += 1;
    if (
      sampleAlphaAtUv(input.raw, input.resolution, uv.u, uv.v) <=
      GENERATED_UV_ALPHA_EDGE_LOW
    ) {
      mismatchCount += 1;
    }
  }

  for (const point of innerPoints) {
    const samplePoint = {
      x: point.x + (innerCenter.x - point.x) * 0.12,
      y: point.y + (innerCenter.y - point.y) * 0.12,
    };
    const uv = projectScreenPointToUv(samplePoint, input.arFaceExport);
    if (!uv) {
      continue;
    }
    sampleCount += 1;
    if (
      sampleAlphaAtUv(input.raw, input.resolution, uv.u, uv.v) >
      GENERATED_UV_ALPHA_EDGE_LOW
    ) {
      mismatchCount += 1;
    }
  }

  return sampleCount > 0 ? mismatchCount / sampleCount : 1;
}

function projectBoundaryPointsToUvPolygon(
  points: E7Point2D[],
  arFaceExport: E7ArFaceExport,
) {
  const uvPoints: E7Point2D[] = [];
  for (const point of points) {
    const uv = projectScreenPointToUv(point, arFaceExport);
    if (!uv) {
      return null;
    }
    uvPoints.push({ x: uv.u, y: uv.v });
  }
  return uvPoints.length >= 3 ? uvPoints : null;
}

function buildProjectedUvMaskRawRgba(input: {
  boundary: NonNullable<E7NativeBoundaryResult['boundary']>;
  arFaceExport: E7ArFaceExport;
  resolution: number;
  supersampleGrid: number;
}) {
  const outerUv = projectBoundaryPointsToUvPolygon(
    input.boundary.outerPoints,
    input.arFaceExport,
  );
  if (!outerUv) {
    return null;
  }
  const innerUv =
    input.boundary.innerPoints.length >= 3
      ? projectBoundaryPointsToUvPolygon(
          input.boundary.innerPoints,
          input.arFaceExport,
        ) ?? []
      : [];
  const outerBounds = bounds(outerUv);
  if (!outerBounds) {
    return null;
  }

  const resolution = input.resolution;
  const texelCount = resolution * resolution;
  const rawAlpha = new Uint8Array(texelCount);
  const innerHoleAlpha = new Uint8Array(texelCount);
  const minColumn = Math.max(
    0,
    Math.floor(Math.min(outerBounds[0], outerBounds[2]) * (resolution - 1)) - 1,
  );
  const maxColumn = Math.min(
    resolution - 1,
    Math.ceil(Math.max(outerBounds[0], outerBounds[2]) * (resolution - 1)) + 1,
  );
  const minRow = Math.max(
    0,
    Math.floor(Math.min(outerBounds[1], outerBounds[3]) * (resolution - 1)) - 1,
  );
  const maxRow = Math.min(
    resolution - 1,
    Math.ceil(Math.max(outerBounds[1], outerBounds[3]) * (resolution - 1)) + 1,
  );
  if (maxColumn < minColumn || maxRow < minRow) {
    return null;
  }

  let coverageTexels = 0;
  let innerHoleSampleCount = 0;
  const samplesPerTexel = input.supersampleGrid * input.supersampleGrid;
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      let positiveSamples = 0;
      let innerSamples = 0;
      for (let sampleY = 0; sampleY < input.supersampleGrid; sampleY++) {
        for (let sampleX = 0; sampleX < input.supersampleGrid; sampleX++) {
          const samplePoint = {
            x: (column + (sampleX + 0.5) / input.supersampleGrid) / resolution,
            y: (row + (sampleY + 0.5) / input.supersampleGrid) / resolution,
          };
          if (!pointInPolygon(samplePoint, outerUv)) {
            continue;
          }
          const isInnerHole =
            innerUv.length >= 3 && pointInPolygon(samplePoint, innerUv);
          if (isInnerHole) {
            innerSamples += 1;
            innerHoleSampleCount += 1;
          } else {
            positiveSamples += 1;
          }
        }
      }

      const texelIndex = row * resolution + column;
      coverageTexels += 1;
      rawAlpha[texelIndex] = Math.round(
        (positiveSamples / samplesPerTexel) * 255,
      );
      innerHoleAlpha[texelIndex] = Math.round(
        (innerSamples / samplesPerTexel) * 255,
      );
    }
  }

  return summarizeRawAlphaMask({
    rawAlpha,
    innerHoleAlpha,
    resolution,
    coverageTexels,
    boundary: input.boundary,
    arFaceExport: input.arFaceExport,
    innerHoleSampleCount,
    innerHolePositiveRatio: 0,
  });
}

export function buildUvMaskRawRgba(input: {
  boundary: NonNullable<E7NativeBoundaryResult['boundary']>;
  arFaceExport: E7ArFaceExport;
  resolution?: number;
  sampleStride?: number;
}): E7UvMaskRawRgbaResult {
  const resolution = input.resolution ?? GENERATED_UV_MASK_RESOLUTION;
  const supersampleGrid = Math.max(
    1,
    Math.min(
      GENERATED_UV_SUPERSAMPLE_GRID,
      Math.round(
        GENERATED_UV_SUPERSAMPLE_GRID * (2 / (input.sampleStride ?? 2)),
      ),
    ),
  );
  const projectedMask = buildProjectedUvMaskRawRgba({
    boundary: input.boundary,
    arFaceExport: input.arFaceExport,
    resolution,
    supersampleGrid,
  });
  if (projectedMask) {
    return projectedMask;
  }
  const texelCount = resolution * resolution;
  const positiveVotes = new Uint16Array(texelCount);
  const totalVotes = new Uint16Array(texelCount);
  const innerHoleVotes = new Uint16Array(texelCount);
  const { boundary, arFaceExport } = input;
  const { screenVertices, uvs, indices } = arFaceExport;
  let innerHoleSampleCount = 0;
  let innerHolePositiveSamples = 0;

  for (let index = 0; index + 2 < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]];
    if (
      triangle.some(
        vertexIndex =>
          vertexIndex < 0 ||
          vertexIndex >= screenVertices.length ||
          vertexIndex >= uvs.length,
      )
    ) {
      continue;
    }

    const triScreen = triangle.map(vertexIndex => screenVertices[vertexIndex]);
    const triUv = triangle.map(vertexIndex => uvs[vertexIndex]);
    const minColumn = Math.max(
      0,
      Math.floor(Math.min(...triUv.map(uv => uv[0])) * (resolution - 1)),
    );
    const maxColumn = Math.min(
      resolution - 1,
      Math.ceil(Math.max(...triUv.map(uv => uv[0])) * (resolution - 1)),
    );
    const minRow = Math.max(
      0,
      Math.floor(Math.min(...triUv.map(uv => uv[1])) * (resolution - 1)),
    );
    const maxRow = Math.min(
      resolution - 1,
      Math.ceil(Math.max(...triUv.map(uv => uv[1])) * (resolution - 1)),
    );
    if (maxColumn < minColumn || maxRow < minRow) {
      continue;
    }

    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        const texelIndex = row * resolution + column;
        for (let sampleY = 0; sampleY < supersampleGrid; sampleY++) {
          for (let sampleX = 0; sampleX < supersampleGrid; sampleX++) {
            const u = (column + (sampleX + 0.5) / supersampleGrid) / resolution;
            const v = (row + (sampleY + 0.5) / supersampleGrid) / resolution;
            const weights = barycentric(
              u,
              v,
              triUv[0][0],
              triUv[0][1],
              triUv[1][0],
              triUv[1][1],
              triUv[2][0],
              triUv[2][1],
            );
            if (!weights) {
              continue;
            }

            const screenPoint = interpolateScreen(weights, triScreen);
            const isInnerHole =
              boundary.innerPoints.length >= 3 &&
              pointInPolygon(screenPoint, boundary.innerPoints);
            const isPositive = isInLipMask(
              screenPoint,
              boundary.outerPoints,
              boundary.innerPoints,
            );

            totalVotes[texelIndex] = Math.min(
              65535,
              totalVotes[texelIndex] + 1,
            );
            if (isInnerHole) {
              innerHoleSampleCount += 1;
              innerHoleVotes[texelIndex] = Math.min(
                65535,
                innerHoleVotes[texelIndex] + 1,
              );
            }
            if (isPositive) {
              positiveVotes[texelIndex] = Math.min(
                65535,
                positiveVotes[texelIndex] + 1,
              );
            }
            if (isInnerHole && isPositive) {
              innerHolePositiveSamples += 1;
            }
          }
        }
      }
    }
  }

  const raw = new Uint8Array(texelCount * 4);
  const rawAlpha = new Uint8Array(texelCount);
  const innerHoleAlpha = new Uint8Array(texelCount);
  let coverageTexels = 0;
  let positiveTexels = 0;
  let edgeBandTexels = 0;
  let alphaSum = 0;
  let alphaChecksum = 0;
  let minColumn = resolution;
  let minRow = resolution;
  let maxColumn = -1;
  let maxRow = -1;
  for (let texelIndex = 0; texelIndex < texelCount; texelIndex++) {
    const total = totalVotes[texelIndex];
    const probability = total > 0 ? positiveVotes[texelIndex] / total : 0;
    const alpha = Math.round(Math.max(0, Math.min(1, probability)) * 255);
    const innerProbability = total > 0 ? innerHoleVotes[texelIndex] / total : 0;
    const rawIndex = texelIndex * 4;
    rawAlpha[texelIndex] = alpha;
    innerHoleAlpha[texelIndex] = Math.round(
      Math.max(0, Math.min(1, innerProbability)) * 255,
    );
    raw[rawIndex] = alpha;
    raw[rawIndex + 1] = alpha;
    raw[rawIndex + 2] = alpha;
    raw[rawIndex + 3] = alpha;
    if (total > 0) {
      coverageTexels += 1;
    }
    alphaSum += alpha;
    alphaChecksum =
      (alphaChecksum + (((texelIndex + 1) * alpha) % UV_ALPHA_CHECKSUM_MOD)) %
      UV_ALPHA_CHECKSUM_MOD;
    if (alpha > GENERATED_UV_ALPHA_EDGE_LOW) {
      positiveTexels += 1;
      const row = Math.floor(texelIndex / resolution);
      const column = texelIndex % resolution;
      minColumn = Math.min(minColumn, column);
      minRow = Math.min(minRow, row);
      maxColumn = Math.max(maxColumn, column);
      maxRow = Math.max(maxRow, row);
      if (alpha < GENERATED_UV_ALPHA_EDGE_HIGH) {
        edgeBandTexels += 1;
      }
    }
  }

  return {
    rawRgbaBase64: encodeBase64(raw),
    rawAlpha,
    innerHoleAlpha,
    width: resolution,
    height: resolution,
    coverageTexels,
    positiveTexels,
    unknownTexels: texelCount - coverageTexels,
    alphaSum,
    alphaChecksum,
    edgeBandTexels,
    edgeBandRatio: positiveTexels > 0 ? edgeBandTexels / positiveTexels : 0,
    innerHoleSampleCount,
    innerHolePositiveRatio:
      innerHoleSampleCount > 0
        ? innerHolePositiveSamples / innerHoleSampleCount
        : 0,
    previewVsUvRoundTripDelta: estimatePreviewVsUvRoundTripDelta({
      boundary,
      arFaceExport,
      raw,
      resolution,
    }),
    alphaBoundingBoxTexels:
      positiveTexels > 0 ? { minColumn, minRow, maxColumn, maxRow } : undefined,
  };
}

function encodeRawRgbaBase64FromAlpha(rawAlpha: Uint8Array) {
  const raw = new Uint8Array(rawAlpha.length * 4);
  for (let index = 0; index < rawAlpha.length; index++) {
    const alpha = rawAlpha[index];
    const rawIndex = index * 4;
    raw[rawIndex] = alpha;
    raw[rawIndex + 1] = alpha;
    raw[rawIndex + 2] = alpha;
    raw[rawIndex + 3] = alpha;
  }
  return {
    raw,
    rawRgbaBase64: encodeBase64(raw),
  };
}

function summarizeRawAlphaMask(input: {
  rawAlpha: Uint8Array;
  innerHoleAlpha?: Uint8Array;
  resolution: number;
  coverageTexels?: number;
  boundary: NonNullable<E7NativeBoundaryResult['boundary']>;
  arFaceExport: E7ArFaceExport;
  innerHoleSampleCount?: number;
  innerHolePositiveRatio?: number;
}): E7UvMaskRawRgbaResult {
  const texelCount = input.resolution * input.resolution;
  const { raw, rawRgbaBase64 } = encodeRawRgbaBase64FromAlpha(input.rawAlpha);
  let positiveTexels = 0;
  let edgeBandTexels = 0;
  let alphaSum = 0;
  let alphaChecksum = 0;
  let minColumn = input.resolution;
  let minRow = input.resolution;
  let maxColumn = -1;
  let maxRow = -1;

  for (let texelIndex = 0; texelIndex < input.rawAlpha.length; texelIndex++) {
    const alpha = input.rawAlpha[texelIndex];
    alphaSum += alpha;
    alphaChecksum =
      (alphaChecksum + (((texelIndex + 1) * alpha) % UV_ALPHA_CHECKSUM_MOD)) %
      UV_ALPHA_CHECKSUM_MOD;
    if (alpha > GENERATED_UV_ALPHA_EDGE_LOW) {
      positiveTexels += 1;
      const row = Math.floor(texelIndex / input.resolution);
      const column = texelIndex % input.resolution;
      minColumn = Math.min(minColumn, column);
      minRow = Math.min(minRow, row);
      maxColumn = Math.max(maxColumn, column);
      maxRow = Math.max(maxRow, row);
      if (alpha < GENERATED_UV_ALPHA_EDGE_HIGH) {
        edgeBandTexels += 1;
      }
    }
  }

  const coverageTexels = input.coverageTexels ?? positiveTexels;
  return {
    rawRgbaBase64,
    rawAlpha: input.rawAlpha,
    innerHoleAlpha: input.innerHoleAlpha ?? new Uint8Array(texelCount),
    width: input.resolution,
    height: input.resolution,
    coverageTexels,
    positiveTexels,
    unknownTexels: texelCount - coverageTexels,
    alphaSum,
    alphaChecksum,
    edgeBandTexels,
    edgeBandRatio: positiveTexels > 0 ? edgeBandTexels / positiveTexels : 0,
    innerHoleSampleCount: input.innerHoleSampleCount ?? 0,
    innerHolePositiveRatio: input.innerHolePositiveRatio ?? 0,
    previewVsUvRoundTripDelta: estimatePreviewVsUvRoundTripDelta({
      boundary: input.boundary,
      arFaceExport: input.arFaceExport,
      raw,
      resolution: input.resolution,
    }),
    alphaBoundingBoxTexels:
      positiveTexels > 0 ? { minColumn, minRow, maxColumn, maxRow } : undefined,
  };
}

function isUsableBlendShot(result: E7NativeBoundaryResult) {
  return (
    (result.status === 'ready' || result.status === 'partial') &&
    Boolean(result.boundary) &&
    (result.boundary?.outerPoints.length ?? 0) >= 3 &&
    Boolean(result.arFaceExport) &&
    result.frameWidth > 0 &&
    result.frameHeight > 0
  );
}

function expandBoundingBox(
  bbox: E7UvAlphaBoundingBox | undefined,
  resolution: number,
  ratio: number,
) {
  if (!bbox) {
    return undefined;
  }
  const width = bbox.maxColumn - bbox.minColumn + 1;
  const height = bbox.maxRow - bbox.minRow + 1;
  const marginX = Math.max(1, Math.round(width * ratio));
  const marginY = Math.max(1, Math.round(height * ratio));
  return {
    minColumn: Math.max(0, bbox.minColumn - marginX),
    minRow: Math.max(0, bbox.minRow - marginY),
    maxColumn: Math.min(resolution - 1, bbox.maxColumn + marginX),
    maxRow: Math.min(resolution - 1, bbox.maxRow + marginY),
  };
}

function isTexelInsideBbox(
  texelIndex: number,
  resolution: number,
  bbox: E7UvAlphaBoundingBox | undefined,
) {
  if (!bbox) {
    return false;
  }
  const row = Math.floor(texelIndex / resolution);
  const column = texelIndex % resolution;
  return (
    column >= bbox.minColumn &&
    column <= bbox.maxColumn &&
    row >= bbox.minRow &&
    row <= bbox.maxRow
  );
}

function countAlphaDelta(previous: Uint8Array, next: Uint8Array) {
  const count = Math.min(previous.length, next.length);
  let delta = 0;
  for (let index = 0; index < count; index++) {
    delta += Math.abs(previous[index] - next[index]);
  }
  return delta;
}

function sampleAlphaFromMask(
  alpha: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetTexelIndex: number,
  targetResolution: number,
) {
  const targetRow = Math.floor(targetTexelIndex / targetResolution);
  const targetColumn = targetTexelIndex % targetResolution;
  const sourceColumn = Math.max(
    0,
    Math.min(
      sourceWidth - 1,
      Math.round(
        (targetColumn / Math.max(1, targetResolution - 1)) * (sourceWidth - 1),
      ),
    ),
  );
  const sourceRow = Math.max(
    0,
    Math.min(
      sourceHeight - 1,
      Math.round(
        (targetRow / Math.max(1, targetResolution - 1)) * (sourceHeight - 1),
      ),
    ),
  );
  return alpha[sourceRow * sourceWidth + sourceColumn] ?? 0;
}

export function buildCaptureSetBlendUvMask(input: {
  neutralResult: E7NativeBoundaryResult;
  providerResults: E7NativeBoundaryResult[];
  adjustment: LipAdjustment;
  resolution?: number;
  precomputedNeutral?: E7PrecomputedNeutralUv;
}): E7BlendUvMaskResult {
  if (!input.neutralResult.boundary || !input.neutralResult.arFaceExport) {
    throw new Error('neutral_result_missing_boundary_or_arface_export');
  }

  const resolution = input.resolution ?? GENERATED_UV_MASK_RESOLUTION;
  const effectiveAdjustment = applyAutoLipCoverageGuard(input.adjustment);
  const adjustedNeutralBoundary =
    input.precomputedNeutral?.smoothedAdjustedBoundary ??
    adjustNativeLipBoundary(input.neutralResult.boundary, effectiveAdjustment, {
      width: input.neutralResult.frameWidth,
      height: input.neutralResult.frameHeight,
    });
  const smoothedNeutralBoundary =
    input.precomputedNeutral?.smoothedAdjustedBoundary ??
    smoothLipBoundaryCurveDensified(adjustedNeutralBoundary, {
      width: input.neutralResult.frameWidth,
      height: input.neutralResult.frameHeight,
    });
  const neutralUv =
    input.precomputedNeutral?.uvOnly ??
    buildUvMaskRawRgba({
      boundary: smoothedNeutralBoundary,
      arFaceExport: input.neutralResult.arFaceExport,
      resolution,
    });
  const uniqueResults = [
    input.neutralResult,
    ...input.providerResults.filter(result => result !== input.neutralResult),
  ].filter(isUsableBlendShot);
  const seenShotKinds = new Set<E7CaptureShotKind>();
  const usableShots = uniqueResults
    .filter(result => {
      if (seenShotKinds.has(result.captureShotKind)) {
        return false;
      }
      seenShotKinds.add(result.captureShotKind);
      return true;
    })
    .map(result => {
      const adjustedBoundary = adjustNativeLipBoundary(
        result.boundary!,
        effectiveAdjustment,
        {
          width: result.frameWidth,
          height: result.frameHeight,
        },
      );
      const smoothedBoundary = smoothLipBoundaryCurveDensified(
        adjustedBoundary,
        {
          width: result.frameWidth,
          height: result.frameHeight,
        },
      );
      return {
        result,
        smoothedBoundary,
        uv:
          result.captureShotKind === 'neutral'
            ? neutralUv
            : buildUvMaskRawRgba({
                boundary: smoothedBoundary,
                arFaceExport: result.arFaceExport!,
                resolution: Math.min(
                  resolution,
                  BLEND_EXPRESSION_MASK_RESOLUTION,
                ),
                sampleStride: 3,
              }),
        weight: BLEND_SHOT_WEIGHTS[result.captureShotKind] ?? 0.25,
      };
    });

  const shotWeights = usableShots.reduce(
    (weights, shot) => ({
      ...weights,
      [shot.result.captureShotKind]: shot.weight,
    }),
    {} as Partial<Record<E7CaptureShotKind, number>>,
  );
  const blendShotKindsUsed = usableShots.map(
    shot => shot.result.captureShotKind,
  );

  if (usableShots.length < 2) {
    return {
      ...neutralUv,
      blendMaskKind: 'neutral_single_shot_v1',
      blendShotKindsUsed,
      blendUsableShotCount: usableShots.length,
      blendFallbackReason: 'blend_fallback_single_shot',
      uvOnlyAlphaChecksum: neutralUv.alphaChecksum,
      blendAlphaChecksum: neutralUv.alphaChecksum,
      uvOnlyVsBlendAlphaDelta: 0,
      innerMouthSuppressedTexels: 0,
      lowerLipGuardApplied: false,
      lowerLipGuardClippedTexels: 0,
      consensusThreshold: BLEND_MASK_CONSENSUS_THRESHOLD,
      shotWeights,
    };
  }

  const texelCount = resolution * resolution;
  const expandedNeutralBbox = expandBoundingBox(
    neutralUv.alphaBoundingBoxTexels,
    resolution,
    BLEND_MASK_NEUTRAL_EXPAND_RATIO,
  );
  const processingBbox = expandedNeutralBbox ?? {
    minColumn: 0,
    minRow: 0,
    maxColumn: resolution - 1,
    maxRow: resolution - 1,
  };
  const score = new Float32Array(texelCount);
  const coverage = new Uint8Array(texelCount);
  const innerHoleMax = new Uint8Array(texelCount);
  for (const shot of usableShots) {
    for (let row = processingBbox.minRow; row <= processingBbox.maxRow; row++) {
      for (
        let column = processingBbox.minColumn;
        column <= processingBbox.maxColumn;
        column++
      ) {
        const texelIndex = row * resolution + column;
        const alpha =
          shot.uv.width === resolution
            ? shot.uv.rawAlpha[texelIndex] ?? 0
            : sampleAlphaFromMask(
                shot.uv.rawAlpha,
                shot.uv.width,
                shot.uv.height,
                texelIndex,
                resolution,
              );
        const innerAlpha =
          shot.uv.width === resolution
            ? shot.uv.innerHoleAlpha[texelIndex] ?? 0
            : sampleAlphaFromMask(
                shot.uv.innerHoleAlpha,
                shot.uv.width,
                shot.uv.height,
                texelIndex,
                resolution,
              );
        if (alpha > 0 || innerAlpha > 0) {
          coverage[texelIndex] = 1;
        }
        if (innerAlpha > innerHoleMax[texelIndex]) {
          innerHoleMax[texelIndex] = innerAlpha;
        }
        if (alpha > 0) {
          score[texelIndex] += (alpha / 255) * shot.weight;
        }
      }
    }
  }

  const finalAlpha = new Uint8Array(texelCount);
  const neutralBboxHeight = neutralUv.alphaBoundingBoxTexels
    ? neutralUv.alphaBoundingBoxTexels.maxRow -
      neutralUv.alphaBoundingBoxTexels.minRow +
      1
    : 0;
  const lowerGuardMaxRow = neutralUv.alphaBoundingBoxTexels
    ? Math.min(
        resolution - 1,
        neutralUv.alphaBoundingBoxTexels.maxRow +
          Math.round(Math.max(1, neutralBboxHeight) * 0.22),
      )
    : resolution - 1;
  let coverageTexels = 0;
  let innerMouthSuppressedTexels = 0;
  let lowerLipGuardClippedTexels = 0;

  for (let row = processingBbox.minRow; row <= processingBbox.maxRow; row++) {
    for (
      let column = processingBbox.minColumn;
      column <= processingBbox.maxColumn;
      column++
    ) {
      const texelIndex = row * resolution + column;
      if (coverage[texelIndex]) {
        coverageTexels += 1;
      }
      const neutralAlpha = neutralUv.rawAlpha[texelIndex] ?? 0;
      const weightedScore = score[texelIndex];
      const expressionAllowed =
        weightedScore >= BLEND_MASK_CONSENSUS_THRESHOLD &&
        isTexelInsideBbox(texelIndex, resolution, expandedNeutralBbox);
      let alpha = 0;
      if (innerHoleMax[texelIndex] > GENERATED_UV_ALPHA_EDGE_HIGH / 2) {
        if (neutralAlpha > GENERATED_UV_ALPHA_EDGE_LOW || weightedScore > 0) {
          innerMouthSuppressedTexels += 1;
        }
      } else if (neutralAlpha > GENERATED_UV_ALPHA_EDGE_LOW) {
        alpha = neutralAlpha;
      } else if (expressionAllowed) {
        alpha = Math.min(220, Math.round(weightedScore * 170));
      }

      if (alpha > 0 && row > lowerGuardMaxRow) {
        lowerLipGuardClippedTexels += 1;
        alpha = 0;
      }
      finalAlpha[texelIndex] = alpha;
    }
  }

  const summarized = summarizeRawAlphaMask({
    rawAlpha: finalAlpha,
    innerHoleAlpha: innerHoleMax,
    resolution,
    coverageTexels,
    boundary: smoothedNeutralBoundary,
    arFaceExport: input.neutralResult.arFaceExport,
    innerHoleSampleCount: neutralUv.innerHoleSampleCount,
    innerHolePositiveRatio: 0,
  });
  const uvOnlyVsBlendAlphaDelta = countAlphaDelta(
    neutralUv.rawAlpha,
    summarized.rawAlpha,
  );

  return {
    ...summarized,
    blendMaskKind: 'capture_set_consensus_v1',
    blendShotKindsUsed,
    blendUsableShotCount: usableShots.length,
    blendFallbackReason:
      uvOnlyVsBlendAlphaDelta > 0 ? undefined : 'blend_no_alpha_delta',
    uvOnlyAlphaChecksum: neutralUv.alphaChecksum,
    blendAlphaChecksum: summarized.alphaChecksum,
    uvOnlyVsBlendAlphaDelta,
    innerMouthSuppressedTexels,
    lowerLipGuardApplied: lowerLipGuardClippedTexels > 0,
    lowerLipGuardClippedTexels,
    consensusThreshold: BLEND_MASK_CONSENSUS_THRESHOLD,
    shotWeights,
  };
}

function formatAdjustmentHash(adjustment: LipAdjustment): string {
  const scaled = [
    adjustment.cornerReach,
    adjustment.upperLipTightness,
    adjustment.lowerLipTightness,
    adjustment.verticalOffset,
    adjustment.innerFill,
    adjustment.upperInnerFill,
  ].map(value => {
    const rounded = Math.round(value * 1000);
    const prefix = rounded < 0 ? 'm' : 'p';
    return `${prefix}${Math.abs(rounded).toString(36)}`;
  });
  return `adj-${scaled.join('-')}`;
}

function buildPrecomputedNeutralUv(
  nativeResult: E7NativeBoundaryResult,
  adjustment: LipAdjustment,
): E7PrecomputedNeutralUv {
  if (!nativeResult.boundary || !nativeResult.arFaceExport) {
    throw new Error('native_boundary_or_arface_export_missing');
  }
  const adjustedBoundary = adjustNativeLipBoundary(
    nativeResult.boundary,
    applyAutoLipCoverageGuard(adjustment),
    {
      width: nativeResult.frameWidth,
      height: nativeResult.frameHeight,
    },
  );
  const smoothedAdjustedBoundary = smoothLipBoundaryCurveDensified(
    adjustedBoundary,
    {
      width: nativeResult.frameWidth,
      height: nativeResult.frameHeight,
    },
  );
  return {
    smoothedAdjustedBoundary,
    uvOnly: buildUvMaskRawRgba({
      boundary: smoothedAdjustedBoundary,
      arFaceExport: nativeResult.arFaceExport,
    }),
  };
}

export function buildGeneratedLipPackage(input: {
  nativeResult: E7NativeBoundaryResult;
  providerResults?: E7NativeBoundaryResult[];
  expressionMode: ExpressionAssistMode;
  adjustment: LipAdjustment;
  generatedAtMs?: number;
  precomputedNeutralUv?: E7PrecomputedNeutralUv;
}): E7GeneratedCandidate {
  const { nativeResult, expressionMode, adjustment } = input;
  const generatedAtMs = input.generatedAtMs ?? Date.now();
  const candidateKey = `${nativeResult.provider}/${expressionMode}`;
  const title = `${nativeResult.provider} / ${
    expressionMode === 'blendshapeAssist' ? 'blend' : 'off'
  }`;
  const warnings = [...(nativeResult.warnings ?? [])];

  if (
    nativeResult.status === 'blocked' ||
    !nativeResult.boundary ||
    !nativeResult.arFaceExport
  ) {
    return {
      candidateKey,
      title,
      provider: nativeResult.provider,
      expressionMode,
      status: 'blocked',
      warnings,
      blockedReason:
        nativeResult.blockedReason ??
        'native_boundary_or_arface_export_missing',
    };
  }

  const precomputedNeutral =
    input.precomputedNeutralUv ??
    buildPrecomputedNeutralUv(nativeResult, adjustment);
  const smoothedAdjustedBoundary = precomputedNeutral.smoothedAdjustedBoundary;
  const uvOnly = precomputedNeutral.uvOnly;
  const captureSetResults = input.providerResults ?? [nativeResult];
  const uv =
    expressionMode === 'blendshapeAssist'
      ? buildCaptureSetBlendUvMask({
          neutralResult: nativeResult,
          providerResults: captureSetResults,
          adjustment,
          precomputedNeutral,
        })
      : uvOnly;
  const blendUv: E7BlendUvMaskResult | undefined =
    expressionMode === 'blendshapeAssist'
      ? (uv as E7BlendUvMaskResult)
      : undefined;
  const generatedMaskId = [
    'e7-generated-lip',
    nativeResult.captureSetId,
    nativeResult.provider,
    expressionMode,
    formatAdjustmentHash(adjustment),
    Math.round(generatedAtMs),
  ].join('-');
  const packageStatus =
    uv.positiveTexels > 0 && uv.coverageTexels > 0 ? 'partial' : 'blocked';
  const qualityWarnings = Array.from(
    new Set([
      ...warnings,
      'native_current_frame_generated',
      'runtimeReady_false_until_real_iPhone_apply_evidence',
      'same_frame_round_trip_pending_in_app_preview',
      'boundary_smoothing_curve_densified_v1',
      'adjustment_applied_before_uv_projection',
      `lower_lip_spill_guard_tightness_${AUTO_LOWER_LIP_SPILL_GUARD_TIGHTNESS.toFixed(
        2,
      )}`,
      `upper_inner_fill_auto_bias_${AUTO_UPPER_INNER_FILL_BIAS.toFixed(2)}`,
      `capture_set_shots_used_${
        (input.providerResults ?? [nativeResult]).length
      }`,
      expressionMode === 'blendshapeAssist'
        ? `blendshape_assist_capture_set_summary_${
            (input.providerResults ?? [nativeResult]).length
          }_shots`
        : 'blendshape_assist_off',
      blendUv
        ? `blend_mask_${blendUv.blendMaskKind}_${blendUv.blendUsableShotCount}_shots`
        : 'blend_mask_neutral_only',
      blendUv?.blendFallbackReason,
    ]),
  ).filter(Boolean) as string[];
  const uvCoverageMetadata: E7UvCoverageMetadataWithDiagnostics = {
    uvResolution: uv.width,
    coverageTexels: uv.coverageTexels,
    positiveTexels: uv.positiveTexels,
    unknownTexels: uv.unknownTexels,
    alphaSum: uv.alphaSum,
    alphaChecksum: uv.alphaChecksum,
    edgeBandTexels: uv.edgeBandTexels,
    edgeBandRatio: uv.edgeBandRatio,
    innerHoleSampleCount: uv.innerHoleSampleCount,
    innerHolePositiveRatio: uv.innerHolePositiveRatio,
    previewVsUvRoundTripDelta: uv.previewVsUvRoundTripDelta,
    alphaBoundingBoxTexels: uv.alphaBoundingBoxTexels,
    blendMaskKind: blendUv?.blendMaskKind,
    blendShotKindsUsed: blendUv?.blendShotKindsUsed,
    blendUsableShotCount: blendUv?.blendUsableShotCount,
    blendFallbackReason: blendUv?.blendFallbackReason,
    uvOnlyAlphaChecksum: blendUv?.uvOnlyAlphaChecksum,
    blendAlphaChecksum: blendUv?.blendAlphaChecksum,
    uvOnlyVsBlendAlphaDelta: blendUv?.uvOnlyVsBlendAlphaDelta,
    innerMouthSuppressedTexels: blendUv?.innerMouthSuppressedTexels,
    lowerLipGuardApplied: true,
    lowerLipGuardClippedTexels: blendUv?.lowerLipGuardClippedTexels ?? 0,
    lowerLipGuardTightness: AUTO_LOWER_LIP_SPILL_GUARD_TIGHTNESS,
    consensusThreshold: blendUv?.consensusThreshold,
    shotWeights: blendUv?.shotWeights,
    boundarySmoothing: CURVE_DENSIFIED_ALGORITHM,
    originalPointCount: smoothedAdjustedBoundary.originalPointCount ?? 0,
    smoothedPointCount: smoothedAdjustedBoundary.smoothedPointCount ?? 0,
    roundTripKind: 'same_frame_self_reconstruction',
  };
  const providerResults = Object.fromEntries(
    [nativeResult].map(result => [
      result.provider,
      summarizeNativeProviderResult(result),
    ]),
  );
  const captureSetShotResults = Object.fromEntries(
    captureSetResults.map(result => [
      result.captureShotKind,
      summarizeNativeProviderResult(result),
    ]),
  );
  const captureSetBlendShapeValues =
    expressionMode === 'blendshapeAssist'
      ? summarizeCaptureSetBlendShapes(captureSetResults)
      : nativeResult.blendShapes?.keySignals;
  const materialFeatherUvNormalized =
    expressionMode === 'blendshapeAssist' ? 0.09 : 0.07;
  const generatedPackage: LipGeneratePackage = {
    schemaVersion: 'e7-personalized-lip-generate-package-v0',
    generatedMaskId,
    captureSetId: nativeResult.captureSetId,
    provider: nativeResult.provider,
    providerResults,
    captureSetShotResults,
    expressionMode,
    blendshapeAssist: {
      mode: expressionMode,
      enabled: expressionMode === 'blendshapeAssist',
      source: 'arface-blendshapes',
      materialFeatherUvNormalized,
      blendMaskKind: blendUv?.blendMaskKind,
      blendShotKindsUsed: blendUv?.blendShotKindsUsed,
      blendUsableShotCount: blendUv?.blendUsableShotCount,
      blendFallbackReason: blendUv?.blendFallbackReason,
      uvOnlyVsBlendAlphaDelta: blendUv?.uvOnlyVsBlendAlphaDelta,
      values: captureSetBlendShapeValues,
      warning:
        blendUv?.blendFallbackReason ??
        (captureSetBlendShapeValues
          ? undefined
          : nativeResult.blendShapes?.reason ?? 'blendshape_unavailable'),
    },
    adjustment,
    sourceFrameMetadata: {
      capturePairId: nativeResult.capturePairId,
      framePath: nativeResult.framePath,
      arFaceExportPath: nativeResult.arFaceExportPath,
      frameWidth: nativeResult.frameWidth,
      frameHeight: nativeResult.frameHeight,
      orientation: nativeResult.arFaceExport.display?.orientation ?? 'unknown',
      isMirrored: nativeResult.arFaceExport.display?.isMirrored ?? false,
    },
    sourceFaceState: {
      blendshapeAvailable: Boolean(captureSetBlendShapeValues),
      warning: captureSetBlendShapeValues
        ? undefined
        : nativeResult.blendShapes?.reason ?? 'blendshape_unavailable',
      values: captureSetBlendShapeValues,
      captureSetShotCount: captureSetResults.length,
      blendshapeSummaryKind:
        captureSetResults.length > 1 ? 'capture-set' : 'single-frame',
    },
    lipBoundary2D: smoothedAdjustedBoundary,
    uvMaskTexture: `${generatedMaskId}.raw-rgba-${uv.width}x${uv.height}`,
    uvCoverageMetadata,
    roundTripPreview: 'in_app_round_trip_preview_pending',
    runtimeApplyPayload: {
      schemaVersion: 'e7-generated-lip-mask-runtime-payload-v0',
      generatedMaskId,
      captureSetId: nativeResult.captureSetId,
      provider: nativeResult.provider,
      expressionMode,
      adjustment,
      maskTextureId: generatedMaskId,
      maskTextureEncoding: 'raw_rgba_base64',
      maskRawRgbaBase64: uv.rawRgbaBase64,
      maskTextureWidth: uv.width,
      maskTextureHeight: uv.height,
      maskThreshold: 0.5,
      maskFeatherUvNormalized: materialFeatherUvNormalized,
      localOnly: true,
      offDeviceUpload: false,
      longTermRawFrameStored: false,
      runtimeReady: false,
    },
    qualityWarnings,
    createdAt: new Date(generatedAtMs).toISOString(),
    privacyFlags: {
      localOnly: true,
      offDeviceUpload: false,
      longTermRawFrameStored: false,
    },
  };

  return {
    candidateKey,
    title,
    provider: nativeResult.provider,
    expressionMode,
    status: packageStatus,
    package: generatedPackage,
    warnings: qualityWarnings,
    blockedReason:
      packageStatus === 'blocked' ? 'uv_projection_empty_mask' : undefined,
  };
}

export function buildGeneratedLipCandidateSet(input: {
  nativeResult: E7NativeBoundaryResult;
  providerResults?: E7NativeBoundaryResult[];
  expressionModes: ExpressionAssistMode[];
  adjustment: LipAdjustment;
  generatedAtMs?: number;
}): E7GeneratedCandidate[] {
  if (
    input.nativeResult.status === 'blocked' ||
    !input.nativeResult.boundary ||
    !input.nativeResult.arFaceExport
  ) {
    return input.expressionModes.map(expressionMode =>
      buildGeneratedLipPackage({
        nativeResult: input.nativeResult,
        providerResults: input.providerResults,
        expressionMode,
        adjustment: input.adjustment,
        generatedAtMs: input.generatedAtMs,
      }),
    );
  }

  const precomputedNeutralUv = buildPrecomputedNeutralUv(
    input.nativeResult,
    input.adjustment,
  );
  return input.expressionModes.map(expressionMode =>
    buildGeneratedLipPackage({
      nativeResult: input.nativeResult,
      providerResults: input.providerResults,
      expressionMode,
      adjustment: input.adjustment,
      generatedAtMs: input.generatedAtMs,
      precomputedNeutralUv,
    }),
  );
}
