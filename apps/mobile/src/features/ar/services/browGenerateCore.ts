import type {
  E7ArFaceExport,
  E7NativeBoundaryResult,
  E7NativeFaceLandmarkRegion,
  E7Point2D,
} from './personalizedGenerate/e7PersonalizedGeneratePipeline';
import {encodeBase64} from './personalizedGenerate/e7PersonalizedGeneratePipeline';

export type BrowMaskProvider = 'vision' | 'mediapipe';

export type BrowShapeId = 'soft-arch' | 'straight' | 'slim-tail';

export type GeneratedBrowControls = {
  cleanupStrength: number;
  colorHex: string;
  coverage: number;
  debugExaggerate: boolean;
  debugMode: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  debugShowLeftRight: boolean;
  enabled: boolean;
  intensity: number;
  neutralizeStrength: number;
  opacity: number;
  shapeId: BrowShapeId;
  strandTextureAmount: number;
};

export type BrowEnvelope = {
  anchorMetadata: {
    browPointCount: number;
    eyePointCount: number;
    faceDirectionSlope: number;
    faceOvalPointCount: number;
    noseBridgePointCount: number;
    templePointCount: number;
    upperEyelidPointCount: number;
  };
  cleanupPolygon: E7Point2D[];
  eyeExclusionBounds: [number, number, number, number];
  fillBounds: [number, number, number, number];
  polygon: E7Point2D[];
  side: 'left' | 'right';
};

export type BrowUvMaskMetadata = {
  alphaChecksum: number;
  alphaSum: number;
  envelopeCount: number;
  eyeExclusionTexels: number;
  faceOvalPointCount: number;
  surroundAnchorPointCount: number;
  positiveTexels: number;
  strandChecksum: number;
};

export type GeneratedBrowPackage = {
  schemaVersion: 'e7-personalized-brow-generate-package-v0';
  generatedMaskId: string;
  captureSetId: string;
  provider: BrowMaskProvider;
  shapeId: BrowShapeId;
  sourceFrameMetadata: {
    arFaceExportPath?: string;
    capturePairId?: string;
    frameHeight: number;
    framePath?: string;
    frameWidth: number;
  };
  browEnvelope: {
    coordinateSpace: 'frame_image_pixel_top_left';
    envelopes: BrowEnvelope[];
    generationMethod: 'brow_surround_anchor_envelope_v2';
  };
  eyeExclusion: {
    mode: 'upper_eyelid_expanded_eye_bounds_v2';
    enforced: true;
  };
  runtimeApplyPayload: BrowRuntimeApplyPayload;
  uvCoverageMetadata: BrowUvMaskMetadata;
  qualityWarnings: string[];
  createdAt: string;
  privacyFlags: {
    localOnly: true;
    offDeviceUpload: false;
    longTermRawFrameStored: false;
  };
};

export type BrowRuntimeApplyPayload = {
  schemaVersion: 'e7-generated-brow-mask-runtime-payload-v0';
  generatedMaskId: string;
  captureSetId?: string;
  provider: BrowMaskProvider;
  shapeId: BrowShapeId;
  maskTextureId?: string;
  maskTextureEncoding?: 'raw_rgba_base64';
  maskRawRgbaBase64?: string;
  maskTextureWidth?: number;
  maskTextureHeight?: number;
  maskThreshold: number;
  maskFeatherUvNormalized: number;
  localOnly: true;
  offDeviceUpload: false;
  longTermRawFrameStored: false;
  runtimeReady: boolean;
  anchorStabilizationMode: 'surround_anchor_eye_eyelid_temple_nose_face_oval_v2';
  browAnchorPointCount: number;
  colorHex: string;
  coverage: number;
  eyeAnchorPointCount: number;
  eyeExclusionMode: 'upper_eyelid_expanded_eye_bounds_v2';
  faceOvalPointCount: number;
  intensity: number;
  noseBridgeAnchorPointCount: number;
  opacity: number;
  strandTextureAmount: number;
  surroundAnchorPointCount: number;
  templeAnchorPointCount: number;
  cleanupStrength: number;
  neutralizeStrength: number;
  upperEyelidAnchorPointCount: number;
  texture: 'natural_brow';
  finish: 'hair-stroke-brow';
  preserveDetail: true;
  maskVisible: boolean;
  validationVisible: boolean;
  visible: boolean;
  debugMode?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  debugShowLeftRight?: boolean;
  debugExaggerate?: boolean;
};

const BROW_UV_MASK_RESOLUTION = 512;
const BROW_SUPERSAMPLE_GRID = 2;
const BROW_SHAPE_ENGINE_SAMPLE_COUNT = 18;
const BROW_RUNTIME_COLOR_STRENGTH_GAIN = 1.18;
const BROW_MASK_VERTICAL_LIFT_RATIO = 0.13;
const UV_ALPHA_CHECKSUM_MOD = 2147483647;

export const DEFAULT_GENERATED_BROW_CONTROLS: GeneratedBrowControls = {
  cleanupStrength: 0,
  colorHex: '#4A342B',
  coverage: 0.9,
  debugExaggerate: false,
  debugMode: 0,
  debugShowLeftRight: false,
  enabled: false,
  intensity: 0.72,
  neutralizeStrength: 0,
  opacity: 0.72,
  shapeId: 'soft-arch',
  strandTextureAmount: 0.72,
};

export function buildGeneratedBrowPackage({
  controls = DEFAULT_GENERATED_BROW_CONTROLS,
  nativeResult,
}: {
  controls?: GeneratedBrowControls;
  nativeResult: E7NativeBoundaryResult;
}): GeneratedBrowPackage {
  if (!nativeResult.arFaceExport) {
    throw new Error('generated_brow_missing_arface_export');
  }

  const provider = nativeResult.provider;
  const regions = getBrowLandmarkRegions(nativeResult);
  const envelopes = buildBrowEnvelopes({
    frameHeight: nativeResult.frameHeight,
    frameWidth: nativeResult.frameWidth,
    leftBrow: regions.leftBrowCore,
    leftBrowAnchors: regions.leftBrow,
    leftBrowShapeBase: regions.leftBrowShapeBase,
    leftEye: regions.leftEye,
    leftTemple: regions.leftTemple,
    leftUpperEyelid: regions.leftUpperEyelid,
    faceOval: regions.faceOval,
    noseBridge: regions.noseBridge,
    rightBrow: regions.rightBrowCore,
    rightBrowAnchors: regions.rightBrow,
    rightBrowShapeBase: regions.rightBrowShapeBase,
    rightEye: regions.rightEye,
    rightTemple: regions.rightTemple,
    rightUpperEyelid: regions.rightUpperEyelid,
    shapeId: controls.shapeId,
  });

  if (!envelopes.length) {
    throw new Error('generated_brow_missing_brow_eye_landmarks');
  }

  const uvMask = buildBrowUvMaskRawRgba({
    arFaceExport: nativeResult.arFaceExport,
    controls,
    envelopes,
  });

  if (uvMask.positiveTexels <= 0) {
    throw new Error('generated_brow_uv_projection_empty_mask');
  }

  const generatedMaskId = [
    'e7-generated-brow',
    provider,
    nativeResult.captureSetId,
    controls.shapeId,
    uvMask.alphaChecksum.toString(36),
  ]
    .join('-')
    .replace(/[^a-zA-Z0-9_-]/g, '-');

  const runtimeApplyPayload = buildBrowRuntimeApplyPayload({
    controls,
    envelopes,
    generatedMaskId,
    includeTexture: true,
    mask: uvMask,
    nativeResult,
  });
  const anchorSummary = summarizeBrowAnchorMetadata(envelopes);

  return {
    schemaVersion: 'e7-personalized-brow-generate-package-v0',
    generatedMaskId,
    captureSetId: nativeResult.captureSetId,
    provider,
    shapeId: controls.shapeId,
    sourceFrameMetadata: {
      arFaceExportPath: nativeResult.arFaceExportPath,
      capturePairId: nativeResult.capturePairId,
      frameHeight: nativeResult.frameHeight,
      framePath: nativeResult.framePath,
      frameWidth: nativeResult.frameWidth,
    },
    browEnvelope: {
      coordinateSpace: 'frame_image_pixel_top_left',
      envelopes,
      generationMethod: 'brow_surround_anchor_envelope_v2',
    },
    eyeExclusion: {
      enforced: true,
      mode: 'upper_eyelid_expanded_eye_bounds_v2',
    },
    runtimeApplyPayload,
    uvCoverageMetadata: {
      alphaChecksum: uvMask.alphaChecksum,
      alphaSum: uvMask.alphaSum,
      envelopeCount: envelopes.length,
      eyeExclusionTexels: uvMask.eyeExclusionTexels,
      faceOvalPointCount: anchorSummary.faceOvalPointCount,
      surroundAnchorPointCount: anchorSummary.surroundAnchorPointCount,
      positiveTexels: uvMask.positiveTexels,
      strandChecksum: uvMask.strandChecksum,
    },
    qualityWarnings: [
      'brow_envelope_mask_not_follicle_segmentation',
      'eye_exclusion_zone_applied',
      'surround_anchor_eye_temple_face_direction_applied',
      'generated_brow_is_color_and_hair_overlay_without_existing_brow_removal',
    ],
    createdAt: new Date().toISOString(),
    privacyFlags: {
      localOnly: true,
      offDeviceUpload: false,
      longTermRawFrameStored: false,
    },
  };
}

export function buildGeneratedBrowMaskUnityPayload(
  generatedPackage: GeneratedBrowPackage,
  controls: GeneratedBrowControls,
  options: {
    controlRevision?: number;
    includeTexture: boolean;
  },
): BrowRuntimeApplyPayload & Record<string, unknown> {
  const runtimeIntensity = boostBrowRuntimeColorStrength(controls.intensity);
  const runtimeOpacity = boostBrowRuntimeColorStrength(controls.opacity);
  const runtimeStrandTextureAmount = boostBrowRuntimeColorStrength(
    controls.strandTextureAmount,
  );
  const payload: BrowRuntimeApplyPayload & Record<string, unknown> = {
    ...generatedPackage.runtimeApplyPayload,
    cleanupStrength: 0,
    color: controls.colorHex,
    colorHex: controls.colorHex,
    coverage: clamp01(controls.coverage),
    enabled: controls.enabled,
    finish: 'hair-stroke-brow',
    intensity: runtimeIntensity,
    maskOpacity: runtimeOpacity,
    maskVisible: controls.enabled,
    neutralizeStrength: 0,
    opacity: runtimeOpacity,
    preserveDetail: true,
    sample: 'natural_brow',
    shapeId: controls.shapeId,
    strandTextureAmount: runtimeStrandTextureAmount,
    texture: 'natural_brow',
    textureAmount: runtimeStrandTextureAmount,
    validationColor: controls.colorHex,
    validationColorHex: controls.colorHex,
    validationOpacity: runtimeOpacity,
    validationVisible: controls.enabled,
    visible: controls.enabled,
    debugMode: controls.enabled ? controls.debugMode : 0,
    debugShowLeftRight: controls.enabled && controls.debugShowLeftRight,
    debugExaggerate: controls.enabled && controls.debugExaggerate,
  };

  if (options.controlRevision !== undefined) {
    payload.controlRevision = options.controlRevision;
    payload.validationControlRevision = options.controlRevision;
  }

  if (!options.includeTexture) {
    delete payload.maskRawRgbaBase64;
  }

  return payload;
}

function buildBrowRuntimeApplyPayload({
  controls,
  envelopes,
  generatedMaskId,
  includeTexture,
  mask,
  nativeResult,
}: {
  controls: GeneratedBrowControls;
  envelopes: readonly BrowEnvelope[];
  generatedMaskId: string;
  includeTexture: boolean;
  mask: BrowUvMaskRawRgba;
  nativeResult: E7NativeBoundaryResult;
}): BrowRuntimeApplyPayload {
  const anchorSummary = summarizeBrowAnchorMetadata(envelopes);

  return {
    schemaVersion: 'e7-generated-brow-mask-runtime-payload-v0',
    generatedMaskId,
    captureSetId: nativeResult.captureSetId,
    provider: nativeResult.provider,
    shapeId: controls.shapeId,
    maskTextureId: generatedMaskId,
    maskTextureEncoding: 'raw_rgba_base64',
    maskRawRgbaBase64: includeTexture ? mask.rawRgbaBase64 : undefined,
    maskTextureWidth: mask.width,
    maskTextureHeight: mask.height,
    maskThreshold: 0.34,
    maskFeatherUvNormalized: 0.3,
    localOnly: true,
    offDeviceUpload: false,
    longTermRawFrameStored: false,
    runtimeReady: false,
    anchorStabilizationMode: 'surround_anchor_eye_eyelid_temple_nose_face_oval_v2',
    browAnchorPointCount: anchorSummary.browAnchorPointCount,
    colorHex: controls.colorHex,
    coverage: clamp01(controls.coverage),
    eyeAnchorPointCount: anchorSummary.eyeAnchorPointCount,
    eyeExclusionMode: 'upper_eyelid_expanded_eye_bounds_v2',
    faceOvalPointCount: anchorSummary.faceOvalPointCount,
    intensity: clamp01(controls.intensity),
    noseBridgeAnchorPointCount: anchorSummary.noseBridgeAnchorPointCount,
    opacity: clamp01(controls.opacity),
    strandTextureAmount: clamp01(controls.strandTextureAmount),
    surroundAnchorPointCount: anchorSummary.surroundAnchorPointCount,
    templeAnchorPointCount: anchorSummary.templeAnchorPointCount,
    cleanupStrength: 0,
    neutralizeStrength: 0,
    upperEyelidAnchorPointCount: anchorSummary.upperEyelidAnchorPointCount,
    texture: 'natural_brow',
    finish: 'hair-stroke-brow',
    preserveDetail: true,
    maskVisible: controls.enabled,
    validationVisible: controls.enabled,
    visible: controls.enabled,
    debugMode: controls.enabled ? controls.debugMode : 0,
    debugShowLeftRight: controls.enabled && controls.debugShowLeftRight,
    debugExaggerate: controls.enabled && controls.debugExaggerate,
  };
}

type BrowUvMaskRawRgba = {
  alphaChecksum: number;
  alphaSum: number;
  eyeExclusionTexels: number;
  positiveTexels: number;
  rawRgbaBase64: string;
  strandChecksum: number;
  width: number;
  height: number;
};

function buildBrowUvMaskRawRgba({
  arFaceExport,
  controls,
  envelopes,
}: {
  arFaceExport: E7ArFaceExport;
  controls: GeneratedBrowControls;
  envelopes: readonly BrowEnvelope[];
}): BrowUvMaskRawRgba {
  const resolution = BROW_UV_MASK_RESOLUTION;
  const raw = new Uint8Array(resolution * resolution * 4);
  const {screenVertices, uvs, indices} = arFaceExport;
  let eyeExclusionTexels = 0;

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
    const minColumn = clamp(
      Math.floor(Math.min(...triUv.map(uv => uv[0])) * (resolution - 1)) - 1,
      0,
      resolution - 1,
    );
    const maxColumn = clamp(
      Math.ceil(Math.max(...triUv.map(uv => uv[0])) * (resolution - 1)) + 1,
      0,
      resolution - 1,
    );
    const minRow = clamp(
      Math.floor(Math.min(...triUv.map(uv => uv[1])) * (resolution - 1)) - 1,
      0,
      resolution - 1,
    );
    const maxRow = clamp(
      Math.ceil(Math.max(...triUv.map(uv => uv[1])) * (resolution - 1)) + 1,
      0,
      resolution - 1,
    );

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        let cleanupSamples = 0;
        let desiredSamples = 0;
        let exclusionSamples = 0;
        let strandSamples = 0;

        for (let sampleY = 0; sampleY < BROW_SUPERSAMPLE_GRID; sampleY += 1) {
          for (let sampleX = 0; sampleX < BROW_SUPERSAMPLE_GRID; sampleX += 1) {
            const u =
              (column + (sampleX + 0.5) / BROW_SUPERSAMPLE_GRID) / resolution;
            const v =
              (row + (sampleY + 0.5) / BROW_SUPERSAMPLE_GRID) / resolution;
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
            const envelope = envelopes.find(candidate =>
              pointInPolygon(screenPoint, candidate.cleanupPolygon),
            );
            if (!envelope) {
              continue;
            }
            if (pointInRect(screenPoint, envelope.eyeExclusionBounds)) {
              exclusionSamples += 1;
              continue;
            }

            cleanupSamples += 1;
            if (pointInPolygon(screenPoint, envelope.polygon)) {
              const fillDensity = browFillDensity(screenPoint, envelope);
              desiredSamples += fillDensity;
              strandSamples +=
                browStrandDensity(screenPoint, envelope, controls) * fillDensity;
            }
          }
        }

        if (cleanupSamples <= 0 && exclusionSamples > 0) {
          eyeExclusionTexels += 1;
        }
        if (cleanupSamples <= 0) {
          continue;
        }

        const rawIndex = (row * resolution + column) * 4;
        const desiredAlpha = Math.round(
          (desiredSamples / (BROW_SUPERSAMPLE_GRID * BROW_SUPERSAMPLE_GRID)) * 255,
        );
        const strand = Math.round(
          clamp01(desiredSamples > 0 ? strandSamples / desiredSamples : 0) *
            255 *
            clamp01(controls.strandTextureAmount),
        );
        raw[rawIndex] = 0;
        raw[rawIndex + 1] = desiredAlpha;
        raw[rawIndex + 2] = strand;
        raw[rawIndex + 3] = desiredAlpha;
      }
    }
  }

  let positiveTexels = 0;
  let alphaSum = 0;
  let alphaChecksum = 0;
  let strandChecksum = 0;
  for (let texelIndex = 0; texelIndex < resolution * resolution; texelIndex += 1) {
    const rawIndex = texelIndex * 4;
    const alpha = raw[rawIndex + 1];
    const strand = raw[rawIndex + 2];
    alphaSum += alpha;
    alphaChecksum =
      (alphaChecksum + (((texelIndex + 1) * alpha) % UV_ALPHA_CHECKSUM_MOD)) %
      UV_ALPHA_CHECKSUM_MOD;
    strandChecksum =
      (strandChecksum + (((texelIndex + 1) * strand) % UV_ALPHA_CHECKSUM_MOD)) %
      UV_ALPHA_CHECKSUM_MOD;
    if (alpha > 8) {
      positiveTexels += 1;
    }
  }

  return {
    alphaChecksum,
    alphaSum,
    eyeExclusionTexels,
    height: resolution,
    positiveTexels,
    rawRgbaBase64: encodeBase64(raw),
    strandChecksum,
    width: resolution,
  };
}

function getBrowLandmarkRegions(nativeResult: E7NativeBoundaryResult) {
  const regions =
    nativeResult.faceLandmarks?.namedRegions ??
    nativeResult.faceLandmarks?.contours ??
    {};

  return {
    faceOval: normalizeLandmarkRegion(regions.faceOval ?? regions.faceContour),
    leftBrow: normalizeLandmarkRegion(
      regions.leftEyebrowSurroundAnchors ?? regions.leftEyebrow,
    ),
    leftBrowCore: normalizeLandmarkRegion(
      regions.leftEyebrowAppearance ?? regions.leftEyebrowCore ?? regions.leftEyebrow,
    ),
    leftBrowShapeBase: normalizeLandmarkRegion(
      regions.leftEyebrowCore ?? regions.leftEyebrow,
    ),
    leftEye: normalizeLandmarkRegion(regions.leftEye),
    leftTemple: normalizeLandmarkRegion(regions.leftTemple),
    leftUpperEyelid: normalizeLandmarkRegion(
      regions.leftUpperEyelid ?? regions.leftEye,
    ),
    noseBridge: normalizeLandmarkRegion(
      regions.noseBridge ?? regions.noseCrest ?? regions.medianLine ?? regions.nose,
    ),
    rightBrow: normalizeLandmarkRegion(
      regions.rightEyebrowSurroundAnchors ?? regions.rightEyebrow,
    ),
    rightBrowCore: normalizeLandmarkRegion(
      regions.rightEyebrowAppearance ?? regions.rightEyebrowCore ?? regions.rightEyebrow,
    ),
    rightBrowShapeBase: normalizeLandmarkRegion(
      regions.rightEyebrowCore ?? regions.rightEyebrow,
    ),
    rightEye: normalizeLandmarkRegion(regions.rightEye),
    rightTemple: normalizeLandmarkRegion(regions.rightTemple),
    rightUpperEyelid: normalizeLandmarkRegion(
      regions.rightUpperEyelid ?? regions.rightEye,
    ),
  };
}

function normalizeLandmarkRegion(
  region: E7NativeFaceLandmarkRegion | undefined,
): E7Point2D[] {
  return (region?.imagePoints ?? [])
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map(point => ({x: point.x, y: point.y}));
}

function buildBrowEnvelopes({
  frameHeight,
  frameWidth,
  leftBrow,
  leftBrowAnchors,
  leftBrowShapeBase,
  leftEye,
  leftTemple,
  leftUpperEyelid,
  faceOval,
  noseBridge,
  rightBrow,
  rightBrowAnchors,
  rightBrowShapeBase,
  rightEye,
  rightTemple,
  rightUpperEyelid,
  shapeId,
}: {
  frameHeight: number;
  frameWidth: number;
  faceOval: E7Point2D[];
  leftBrow: E7Point2D[];
  leftBrowAnchors: E7Point2D[];
  leftBrowShapeBase: E7Point2D[];
  leftEye: E7Point2D[];
  leftTemple: E7Point2D[];
  leftUpperEyelid: E7Point2D[];
  noseBridge: E7Point2D[];
  rightBrow: E7Point2D[];
  rightBrowAnchors: E7Point2D[];
  rightBrowShapeBase: E7Point2D[];
  rightEye: E7Point2D[];
  rightTemple: E7Point2D[];
  rightUpperEyelid: E7Point2D[];
  shapeId: BrowShapeId;
}): BrowEnvelope[] {
  const envelopes = [
    buildSingleBrowEnvelope({
      browAnchorPoints: leftBrowAnchors.length ? leftBrowAnchors : leftBrow,
      browPoints: leftBrow,
      browShapeBasePoints: leftBrowShapeBase,
      eyePoints: leftEye,
      faceOvalPoints: faceOval,
      frameHeight,
      frameWidth,
      noseBridgePoints: noseBridge,
      shapeId,
      side: 'left',
      templePoints: leftTemple,
      upperEyelidPoints: leftUpperEyelid,
    }),
    buildSingleBrowEnvelope({
      browAnchorPoints: rightBrowAnchors.length ? rightBrowAnchors : rightBrow,
      browPoints: rightBrow,
      browShapeBasePoints: rightBrowShapeBase,
      eyePoints: rightEye,
      faceOvalPoints: faceOval,
      frameHeight,
      frameWidth,
      noseBridgePoints: noseBridge,
      shapeId,
      side: 'right',
      templePoints: rightTemple,
      upperEyelidPoints: rightUpperEyelid,
    }),
  ].filter((envelope): envelope is BrowEnvelope => envelope !== null);

  return mirrorScreenRightBrowShapeToScreenLeft(envelopes).map(envelope =>
    liftBrowEnvelopeSlightly(envelope, frameHeight),
  );
}

function mirrorScreenRightBrowShapeToScreenLeft(
  envelopes: BrowEnvelope[],
): BrowEnvelope[] {
  if (envelopes.length !== 2) {
    return envelopes;
  }

  const [screenLeftEnvelope, screenRightEnvelope] = [...envelopes].sort(
    (first, second) => envelopeCenterX(first) - envelopeCenterX(second),
  );
  const mirroredPolygon = mirrorPolygonIntoTargetBounds(
    screenRightEnvelope.polygon,
    screenRightEnvelope.fillBounds,
    screenLeftEnvelope.fillBounds,
  );
  const mirroredFillBounds = bounds(mirroredPolygon) ?? screenLeftEnvelope.fillBounds;
  const nextScreenLeftEnvelope: BrowEnvelope = {
    ...screenLeftEnvelope,
    fillBounds: mirroredFillBounds,
    polygon: mirroredPolygon,
  };

  return envelopes.map(envelope =>
    envelope === screenLeftEnvelope ? nextScreenLeftEnvelope : envelope,
  );
}

function envelopeCenterX(envelope: BrowEnvelope): number {
  const [minX, , maxX] = envelope.fillBounds;
  return (minX + maxX) * 0.5;
}

function mirrorPolygonIntoTargetBounds(
  sourcePolygon: readonly E7Point2D[],
  sourceBounds: [number, number, number, number],
  targetBounds: [number, number, number, number],
): E7Point2D[] {
  const [sourceMinX, sourceMinY, sourceMaxX, sourceMaxY] = sourceBounds;
  const [targetMinX, targetMinY, targetMaxX, targetMaxY] = targetBounds;
  const sourceWidth = Math.max(1, sourceMaxX - sourceMinX);
  const sourceHeight = Math.max(1, sourceMaxY - sourceMinY);
  const targetWidth = Math.max(1, targetMaxX - targetMinX);
  const targetHeight = Math.max(1, targetMaxY - targetMinY);

  return sourcePolygon.map(point => {
    const sourceT = clamp01((point.x - sourceMinX) / sourceWidth);
    const sourceV = clamp01((point.y - sourceMinY) / sourceHeight);
    return {
      x: targetMinX + (1 - sourceT) * targetWidth,
      y: targetMinY + sourceV * targetHeight,
    };
  });
}

function liftBrowEnvelopeSlightly(
  envelope: BrowEnvelope,
  frameHeight: number,
): BrowEnvelope {
  const [, minY, , maxY] = envelope.fillBounds;
  const lift = Math.max(2, (maxY - minY) * BROW_MASK_VERTICAL_LIFT_RATIO);
  const liftPoint = (point: E7Point2D) => ({
    x: point.x,
    y: clamp(point.y - lift, 0, frameHeight - 1),
  });
  const polygon = envelope.polygon.map(liftPoint);

  return {
    ...envelope,
    cleanupPolygon: envelope.cleanupPolygon.map(liftPoint),
    fillBounds: bounds(polygon) ?? envelope.fillBounds,
    polygon,
  };
}

function buildSingleBrowEnvelope({
  browAnchorPoints,
  browPoints,
  browShapeBasePoints,
  eyePoints,
  faceOvalPoints,
  frameHeight,
  frameWidth,
  noseBridgePoints,
  shapeId,
  side,
  templePoints,
  upperEyelidPoints,
}: {
  browAnchorPoints: E7Point2D[];
  browPoints: E7Point2D[];
  browShapeBasePoints: E7Point2D[];
  eyePoints: E7Point2D[];
  faceOvalPoints: E7Point2D[];
  frameHeight: number;
  frameWidth: number;
  noseBridgePoints: E7Point2D[];
  shapeId: BrowShapeId;
  side: BrowEnvelope['side'];
  templePoints: E7Point2D[];
  upperEyelidPoints: E7Point2D[];
}): BrowEnvelope | null {
  const shapeBasePoints = browShapeBasePoints.length ? browShapeBasePoints : browPoints;
  const browBounds = bounds(shapeBasePoints);
  const eyeBounds = bounds(eyePoints);
  if (!browBounds || !eyeBounds) {
    return null;
  }

  const [browMinX, browMinY, browMaxX, browMaxY] = browBounds;
  const [eyeMinX, eyeMinY, eyeMaxX, eyeMaxY] = eyeBounds;
  const eyelidBounds = bounds(upperEyelidPoints) ?? eyeBounds;
  const [lidMinX, lidMinY, lidMaxX, lidMaxY] = eyelidBounds;
  const faceBounds = bounds(faceOvalPoints);
  const templeAnchor =
    centroid(templePoints) ?? deriveTempleAnchor(faceOvalPoints, side);
  const noseBridgeAnchor =
    centroid(noseBridgePoints) ??
    (faceBounds
      ? {x: (faceBounds[0] + faceBounds[2]) * 0.5, y: (faceBounds[1] + faceBounds[3]) * 0.26}
      : null);
  const browWidth = Math.max(1, browMaxX - browMinX);
  const browHeight = Math.max(1, browMaxY - browMinY);
  const eyeWidth = Math.max(1, eyeMaxX - eyeMinX);
  const eyeHeight = Math.max(1, eyeMaxY - eyeMinY);
  const eyelidWidth = Math.max(1, lidMaxX - lidMinX);
  const eyelidHeight = Math.max(1, lidMaxY - lidMinY);
  const usesImageGuidedAppearance = browPoints.length >= BROW_SHAPE_ENGINE_SAMPLE_COUNT * 2;
  const direction = side === 'left' ? 1 : -1;
  const faceDirectionSlope = estimateFaceDirectionSlope(
    noseBridgeAnchor,
    templeAnchor,
  );
  const anchoredBrowBounds = usesImageGuidedAppearance
    ? {maxX: browMaxX, minX: browMinX}
    : expandBrowBoundsWithSurroundAnchors({
        browMaxX,
        browMinX,
        eyeWidth,
        faceBounds,
        noseBridgeAnchor,
        side,
        templeAnchor,
      });
  const shapeScale =
    shapeId === 'slim-tail' ? 0.78 : shapeId === 'straight' ? 0.92 : 0.96;
  const xPad = Math.max(
    usesImageGuidedAppearance
      ? browWidth * (shapeId === 'slim-tail' ? 0.01 : 0.018)
      : browWidth * (shapeId === 'slim-tail' ? 0.09 : shapeId === 'straight' ? 0.12 : 0.14),
    eyelidWidth * (usesImageGuidedAppearance ? 0.006 : 0.025),
  );
  const topPad = usesImageGuidedAppearance
    ? Math.max(browHeight * 0.04, eyelidHeight * 0.025)
    : Math.max(browHeight * 0.18, eyelidHeight * 0.07);
  const bottomPad = usesImageGuidedAppearance
    ? Math.max(browHeight * 0.025, eyelidHeight * 0.018)
    : Math.max(browHeight * 0.1, eyelidHeight * 0.05);
  let minX = clamp(anchoredBrowBounds.minX - xPad, 0, frameWidth - 1);
  let maxX = clamp(anchoredBrowBounds.maxX + xPad, 0, frameWidth - 1);
  if (noseBridgeAnchor) {
    const noseGuard = eyeWidth * 0.035;
    if (side === 'left') {
      minX = Math.max(minX, noseBridgeAnchor.x + noseGuard);
    } else {
      maxX = Math.min(maxX, noseBridgeAnchor.x - noseGuard);
    }
  }
  if (faceBounds) {
    const [faceMinX, , faceMaxX] = faceBounds;
    const faceWidth = Math.max(1, faceMaxX - faceMinX);
    minX = Math.max(minX, faceMinX + faceWidth * 0.025);
    maxX = Math.min(maxX, faceMaxX - faceWidth * 0.025);
  }
  if (maxX - minX < browWidth * 0.62) {
    minX = clamp(browMinX - xPad * 0.6, 0, frameWidth - 1);
    maxX = clamp(browMaxX + xPad * 0.6, 0, frameWidth - 1);
  }
  const topY = clamp(browMinY - topPad, 0, frameHeight - 1);
  const eyeGuardTop = Math.min(eyeMinY, lidMinY) - eyelidHeight * 0.36;
  const bottomY = clamp(
    Math.min(browMaxY + bottomPad, eyeGuardTop),
    topY + Math.max(1, browHeight * 0.42),
    frameHeight - 1,
  );
  const centerX = (minX + maxX) * 0.5;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, bottomY - topY);
  const innerX = centerX - direction * width * 0.5 * shapeScale;
  const outerX = centerX + direction * width * 0.5 * shapeScale;

  const stabilizePoint = (point: E7Point2D) =>
    stabilizePointToFaceDirection(point, centerX, height, faceDirectionSlope);
  const polygon = buildShapeCorrectedBrowFillPolygon({
    bottomY,
    browPoints,
    browShapeBasePoints: shapeBasePoints,
    direction,
    frameHeight,
    frameWidth,
    innerX,
    outerX,
    shapeId,
    stabilizePoint,
    topY,
  });
  const cleanupPadX = Math.max(
    xPad * (usesImageGuidedAppearance ? 1.08 : 1.18),
    eyelidWidth * (usesImageGuidedAppearance ? 0.018 : 0.05),
  );
  const cleanupMinX = clamp(anchoredBrowBounds.minX - cleanupPadX, 0, frameWidth - 1);
  const cleanupMaxX = clamp(anchoredBrowBounds.maxX + cleanupPadX, 0, frameWidth - 1);
  const cleanupTopY = clamp(
    browMinY -
      (usesImageGuidedAppearance
        ? Math.max(topPad * 0.3, eyelidHeight * 0.018)
        : Math.max(topPad * 0.48, eyelidHeight * 0.08)),
    0,
    frameHeight - 1,
  );
  const cleanupBottomY = clamp(
    Math.min(
      browMaxY +
        (usesImageGuidedAppearance
          ? Math.max(bottomPad * 0.55, browHeight * 0.08)
          : Math.max(bottomPad * 0.8, browHeight * 0.22)),
      Math.min(eyeMinY, lidMinY) - eyelidHeight * (usesImageGuidedAppearance ? 0.32 : 0.26),
    ),
    cleanupTopY +
      Math.max(1, browHeight * (usesImageGuidedAppearance ? 0.18 : 0.36)),
    frameHeight - 1,
  );
  const cleanupWidth = Math.max(1, cleanupMaxX - cleanupMinX);
  const cleanupHeight = Math.max(1, cleanupBottomY - cleanupTopY);
  const cleanupPolygon = [
    {x: cleanupMinX, y: cleanupTopY + cleanupHeight * 0.34},
    {x: cleanupMinX + cleanupWidth * 0.18, y: cleanupTopY},
    {x: cleanupMaxX - cleanupWidth * 0.18, y: cleanupTopY},
    {x: cleanupMaxX, y: cleanupTopY + cleanupHeight * 0.36},
    {x: cleanupMaxX, y: cleanupBottomY},
    {x: cleanupMinX, y: cleanupBottomY},
  ].map(stabilizePoint);

  return {
    anchorMetadata: {
      browPointCount: browAnchorPoints.length,
      eyePointCount: eyePoints.length,
      faceDirectionSlope,
      faceOvalPointCount: faceOvalPoints.length,
      noseBridgePointCount: noseBridgePoints.length,
      templePointCount: templePoints.length || (templeAnchor ? 1 : 0),
      upperEyelidPointCount: upperEyelidPoints.length,
    },
    cleanupPolygon,
    eyeExclusionBounds: [
      clamp(Math.min(eyeMinX, lidMinX) - eyeWidth * 0.18, 0, frameWidth - 1),
      clamp(Math.min(eyeMinY, lidMinY) - eyelidHeight * 0.36, 0, frameHeight - 1),
      clamp(Math.max(eyeMaxX, lidMaxX) + eyeWidth * 0.18, 0, frameWidth - 1),
      clamp(eyeMaxY + eyeHeight * 0.14, 0, frameHeight - 1),
    ],
    fillBounds: bounds(polygon) ?? [minX, topY, maxX, bottomY],
    polygon,
    side,
  };
}

function summarizeBrowAnchorMetadata(envelopes: readonly BrowEnvelope[]) {
  const summary = envelopes.reduce(
    (summary, envelope) => {
      const metadata = envelope.anchorMetadata;
      summary.browAnchorPointCount += metadata.browPointCount;
      summary.eyeAnchorPointCount += metadata.eyePointCount;
      summary.upperEyelidAnchorPointCount += metadata.upperEyelidPointCount;
      summary.templeAnchorPointCount += metadata.templePointCount;
      summary.noseBridgeAnchorPointCount = Math.max(
        summary.noseBridgeAnchorPointCount,
        metadata.noseBridgePointCount,
      );
      summary.faceOvalPointCount = Math.max(
        summary.faceOvalPointCount,
        metadata.faceOvalPointCount,
      );
      return summary;
    },
    {
      browAnchorPointCount: 0,
      eyeAnchorPointCount: 0,
      faceOvalPointCount: 0,
      noseBridgeAnchorPointCount: 0,
      surroundAnchorPointCount: 0,
      templeAnchorPointCount: 0,
      upperEyelidAnchorPointCount: 0,
    },
  );
  summary.surroundAnchorPointCount =
    summary.browAnchorPointCount +
    summary.eyeAnchorPointCount +
    summary.upperEyelidAnchorPointCount +
    summary.templeAnchorPointCount +
    summary.noseBridgeAnchorPointCount +
    summary.faceOvalPointCount;
  return summary;
}

function expandBrowBoundsWithSurroundAnchors({
  browMaxX,
  browMinX,
  eyeWidth,
  faceBounds,
  noseBridgeAnchor,
  side,
  templeAnchor,
}: {
  browMaxX: number;
  browMinX: number;
  eyeWidth: number;
  faceBounds: [number, number, number, number] | null;
  noseBridgeAnchor: E7Point2D | null;
  side: BrowEnvelope['side'];
  templeAnchor: E7Point2D | null;
}) {
  let minX = browMinX;
  let maxX = browMaxX;
  const templeReach = eyeWidth * 0.34;

  if (templeAnchor) {
    if (side === 'left') {
      maxX = Math.max(
        maxX,
        clamp(templeAnchor.x - eyeWidth * 0.16, browMaxX, browMaxX + templeReach),
      );
    } else {
      minX = Math.min(
        minX,
        clamp(templeAnchor.x + eyeWidth * 0.16, browMinX - templeReach, browMinX),
      );
    }
  }

  if (noseBridgeAnchor) {
    const innerReach = eyeWidth * 0.14;
    if (side === 'left') {
      minX = Math.max(
        Math.min(minX, browMinX + innerReach * 0.25),
        noseBridgeAnchor.x + eyeWidth * 0.02,
      );
    } else {
      maxX = Math.min(
        Math.max(maxX, browMaxX - innerReach * 0.25),
        noseBridgeAnchor.x - eyeWidth * 0.02,
      );
    }
  }

  if (faceBounds) {
    const [faceMinX, , faceMaxX] = faceBounds;
    const faceWidth = Math.max(1, faceMaxX - faceMinX);
    minX = clamp(minX, faceMinX + faceWidth * 0.02, faceMaxX - faceWidth * 0.08);
    maxX = clamp(maxX, faceMinX + faceWidth * 0.08, faceMaxX - faceWidth * 0.02);
  }

  if (maxX <= minX) {
    return {maxX: browMaxX, minX: browMinX};
  }

  return {maxX, minX};
}

function buildShapeCorrectedBrowFillPolygon({
  bottomY,
  browPoints,
  browShapeBasePoints,
  direction,
  frameHeight,
  frameWidth,
  innerX,
  outerX,
  shapeId,
  stabilizePoint,
  topY,
}: {
  bottomY: number;
  browPoints: E7Point2D[];
  browShapeBasePoints: E7Point2D[];
  direction: number;
  frameHeight: number;
  frameWidth: number;
  innerX: number;
  outerX: number;
  shapeId: BrowShapeId;
  stabilizePoint: (point: E7Point2D) => E7Point2D;
  topY: number;
}): E7Point2D[] {
  const height = Math.max(1, bottomY - topY);
  const ringShape =
    buildOrderedBrowRingShapeModel({
      bottomY,
      browPoints: browShapeBasePoints.length ? browShapeBasePoints : browPoints,
      direction,
      innerX,
      maxThicknessRatio: 0.72,
      minThicknessRatio: 0.18,
      outerX,
      topY,
    }) ??
    buildPersonalBrowShapeModel({
      bottomY,
      browPoints: browShapeBasePoints.length ? browShapeBasePoints : browPoints,
      direction,
      innerX,
      maxThicknessRatio: 0.72,
      minThicknessRatio: 0.18,
      outerX,
      topY,
    });
  const hasImageGuidedAppearance = browPoints.length >= BROW_SHAPE_ENGINE_SAMPLE_COUNT * 2;
  const appearanceShape =
    hasImageGuidedAppearance
      ? buildPersonalBrowShapeModel({
          bottomY,
          browPoints,
          direction,
          innerX,
          maxThicknessRatio: 0.56,
          minThicknessRatio: 0.12,
          outerX,
          topY,
        })
      : null;

  if (ringShape) {
    return buildBrowRingSilhouettePolygon({
      appearanceShape,
      bottomY,
      direction,
      frameHeight,
      frameWidth,
      innerX,
      outerX,
      ringShape,
      shapeId,
      stabilizePoint,
      topY,
    });
  }

  const archAmount =
    shapeId === 'straight' ? 0.025 : shapeId === 'slim-tail' ? 0.11 : 0.15;
  const tailDrop =
    shapeId === 'straight' ? 0.035 : shapeId === 'slim-tail' ? 0.16 : 0.09;
  const baseThickness =
    shapeId === 'straight' ? 0.24 : shapeId === 'slim-tail' ? 0.2 : 0.26;
  const tailTaper =
    shapeId === 'straight' ? 0.22 : shapeId === 'slim-tail' ? 0.64 : 0.48;
  const upperCurve: E7Point2D[] = [];
  const lowerCurve: E7Point2D[] = [];

  for (let index = 0; index < BROW_SHAPE_ENGINE_SAMPLE_COUNT; index += 1) {
    const t = index / (BROW_SHAPE_ENGINE_SAMPLE_COUNT - 1);
    const x = lerp(innerX, outerX, remapBrowPreArchXProgress(t, shapeId));
    const arch = Math.sin(Math.PI * t);
    const tail = smoothstep(0.58, 1, t);
    const innerSoftDrop = (1 - smoothstep(0, 0.18, t)) * 0.035;
    const centerY =
      topY +
      height *
        (0.54 -
          arch * archAmount +
            tail * tailDrop +
          innerSoftDrop);
    const thickness =
      height *
      baseThickness *
      (1 - tail * tailTaper) *
      (0.88 + 0.12 * Math.sin(Math.PI * t));
    const upperBias = shapeId === 'straight' ? 0.48 : 0.56;
    const templateUpperY = centerY - thickness * upperBias;
    const templateLowerY = centerY + thickness * (1 - upperBias);
    const appearanceSample = appearanceShape?.(t);
    let upperY = templateUpperY;
    let lowerY = templateLowerY;
    if (appearanceSample) {
      upperY = lerp(upperY, appearanceSample.upperY, 0.18);
      lowerY = lerp(lowerY, appearanceSample.lowerY, 0.14);
    }
    upperCurve.push({
      x,
      y: upperY,
    });
    lowerCurve.push({
      x: x - direction * thickness * 0.06 * tail,
      y: lowerY,
    });
  }

  const tailUpper = upperCurve[upperCurve.length - 1];
  const tailLower = lowerCurve[lowerCurve.length - 1];
  const tailPoint = {
    x: outerX + direction * height * 0.02,
    y: (tailUpper.y + tailLower.y) * 0.5 + height * 0.018,
  };
  const polygon = [
    ...upperCurve.slice(0, -1),
    tailPoint,
    ...lowerCurve.slice(0, -1).reverse(),
  ];

  return polygon
    .map(stabilizePoint)
    .map(point => ({
      x: clamp(point.x, 0, frameWidth - 1),
      y: clamp(point.y, 0, frameHeight - 1),
    }));
}

function buildBrowRingSilhouettePolygon({
  appearanceShape,
  bottomY,
  direction,
  frameHeight,
  frameWidth,
  innerX,
  outerX,
  ringShape,
  shapeId,
  stabilizePoint,
  topY,
}: {
  appearanceShape: ((t: number) => {lowerY: number; upperY: number}) | null;
  bottomY: number;
  direction: number;
  frameHeight: number;
  frameWidth: number;
  innerX: number;
  outerX: number;
  ringShape: (t: number) => {lowerY: number; upperY: number};
  shapeId: BrowShapeId;
  stabilizePoint: (point: E7Point2D) => E7Point2D;
  topY: number;
}): E7Point2D[] {
  const height = Math.max(1, bottomY - topY);
  const upperCurve: E7Point2D[] = [];
  const lowerCurve: E7Point2D[] = [];
  const maxBodyThickness =
    height * (shapeId === 'slim-tail' ? 0.4 : shapeId === 'straight' ? 0.48 : 0.54);
  const minBodyThickness =
    height * (shapeId === 'slim-tail' ? 0.11 : shapeId === 'straight' ? 0.14 : 0.16);
  const tailTaperStrength =
    shapeId === 'slim-tail' ? 0.92 : shapeId === 'straight' ? 0.54 : 0.82;
  const headTaperStrength = shapeId === 'straight' ? 0.16 : 0.24;
  const lowerHeadY = ringShape(0).lowerY;
  const lowerTailY = ringShape(1).lowerY;

  for (let index = 0; index < BROW_SHAPE_ENGINE_SAMPLE_COUNT; index += 1) {
    const t = index / (BROW_SHAPE_ENGINE_SAMPLE_COUNT - 1);
    const x = lerp(innerX, outerX, remapBrowPreArchXProgress(t, shapeId));
    const ringSample = ringShape(t);
    const appearanceSample = appearanceShape?.(t);
    const archLift =
      shapeId === 'straight'
        ? 0
        : Math.sin(Math.PI * t) * height * (shapeId === 'slim-tail' ? 0.006 : 0.012);
    const tail = smoothstep(0.58, 1, t);
    const head = 1 - smoothstep(0, 0.18, t);
    let ringUpperY = ringSample.upperY;
    let ringLowerY = ringSample.lowerY;

    if (appearanceSample) {
      ringUpperY = lerp(ringUpperY, appearanceSample.upperY, 0.04);
      ringLowerY = lerp(ringLowerY, appearanceSample.lowerY, 0.08);
    }

    const ringThickness = Math.max(1, ringLowerY - ringUpperY);
    const bodyThickness = clamp(
      ringThickness * (shapeId === 'slim-tail' ? 0.58 : shapeId === 'straight' ? 0.64 : 0.68) +
        height * 0.016,
      minBodyThickness,
      maxBodyThickness,
    );
    const lowerAnchorLift = archLift * 0.18;
    const tailDrop = tail * height * (shapeId === 'straight' ? 0.018 : 0.036);
    const lowerFlowBaselineY =
      lerp(lowerHeadY, lowerTailY, t) -
      Math.sin(Math.PI * t) * height * (shapeId === 'straight' ? 0.01 : 0.018);
    const lowerFlowFlatten = Math.sin(Math.PI * t) * (shapeId === 'straight' ? 0.34 : 0.46);
    let lowerY =
      lerp(ringLowerY, lowerFlowBaselineY, lowerFlowFlatten) -
      lowerAnchorLift +
      tailDrop;
    lowerY -= height * (shapeId === 'straight' ? 0.018 : 0.032);

    if (shapeId === 'straight') {
      const straightCenter = topY + height * 0.52;
      lowerY += (straightCenter + bodyThickness * 0.34 - lowerY) * 0.1;
    }

    const visibleThicknessScale =
      shapeId === 'slim-tail' ? 1.24 : shapeId === 'straight' ? 1.24 : 1.28;
    let visibleThickness =
      bodyThickness * (1 - tail * tailTaperStrength) * visibleThicknessScale;
    visibleThickness *= 1 - head * headTaperStrength;
    const minVisibleThickness =
      height * (shapeId === 'slim-tail' ? 0.045 : shapeId === 'straight' ? 0.064 : 0.072);
    if (tail < 0.92) {
      visibleThickness = Math.max(visibleThickness, minVisibleThickness);
    }
    let upperY = lowerY - visibleThickness;
    upperY = lerp(
      upperY,
      Math.max(ringUpperY + height * 0.018, lowerY - maxBodyThickness),
      shapeId === 'straight' ? 0.08 : 0.14,
    );

    if (lowerY - upperY < minVisibleThickness && tail < 0.84) {
      upperY = lowerY - minVisibleThickness;
    }

    upperCurve.push({
      x,
      y: upperY,
    });
    lowerCurve.push({
      x: x - direction * Math.max(0, lowerY - upperY) * 0.03 * tail,
      y: lowerY,
    });
  }

  const tailUpper = upperCurve[upperCurve.length - 1];
  const tailLower = lowerCurve[lowerCurve.length - 1];
  const tailPoint = {
    x: outerX + direction * height * (shapeId === 'straight' ? 0.024 : 0.045),
    y:
      (tailUpper.y + tailLower.y) * 0.5 +
      height * (shapeId === 'slim-tail' ? 0.09 : shapeId === 'straight' ? 0.045 : 0.078),
  };
  const polygon = [
    ...upperCurve.slice(0, -1),
    tailPoint,
    ...lowerCurve.slice(0, -1).reverse(),
  ];

  return polygon
    .map(stabilizePoint)
    .map(point => ({
      x: clamp(point.x, 0, frameWidth - 1),
      y: clamp(point.y, 0, frameHeight - 1),
    }));
}

function remapBrowPreArchXProgress(t: number, shapeId: BrowShapeId): number {
  const preArchPush =
    shapeId === 'slim-tail' ? 0.025 : shapeId === 'straight' ? 0.028 : 0.038;
  const headGate = smoothstep(0.06, 0.24, t);
  const archGate = 1 - smoothstep(0.62, 0.9, t);
  return clamp01(t + preArchPush * headGate * archGate);
}

function buildOrderedBrowRingShapeModel({
  bottomY,
  browPoints,
  direction,
  innerX,
  maxThicknessRatio,
  minThicknessRatio,
  outerX,
  topY,
}: {
  bottomY: number;
  browPoints: E7Point2D[];
  direction: number;
  innerX: number;
  maxThicknessRatio: number;
  minThicknessRatio: number;
  outerX: number;
  topY: number;
}) {
  if (browPoints.length < 8 || browPoints.length > 14) {
    return null;
  }

  const midpoint = Math.floor(browPoints.length / 2);
  const firstChain = browPoints.slice(0, midpoint);
  const secondChain = browPoints.slice(midpoint);
  if (firstChain.length < 3 || secondChain.length < 3) {
    return null;
  }

  const firstAverageY =
    firstChain.reduce((sum, point) => sum + point.y, 0) / firstChain.length;
  const secondAverageY =
    secondChain.reduce((sum, point) => sum + point.y, 0) / secondChain.length;
  const lowerRaw = firstAverageY > secondAverageY ? firstChain : secondChain;
  const upperRaw = firstAverageY > secondAverageY ? secondChain : firstChain;
  const width = Math.max(1, Math.abs(outerX - innerX));
  const height = Math.max(1, bottomY - topY);
  const toChainPoint = (point: E7Point2D) => ({
    ...point,
    t: clamp01(((point.x - innerX) * direction) / width),
  });
  const upperChain = upperRaw
    .map(toChainPoint)
    .sort((first, second) => first.t - second.t || first.y - second.y);
  const lowerChain = lowerRaw
    .map(toChainPoint)
    .sort((first, second) => first.t - second.t || second.y - first.y);

  if (upperChain.length < 2 || lowerChain.length < 2) {
    return null;
  }

  return (t: number) => {
    const upperY = smoothChainY(upperChain, t);
    const lowerY = smoothChainY(lowerChain, t);
    const minThickness = height * minThicknessRatio;
    const maxThickness = height * maxThicknessRatio;
    const adjustedLowerY = clamp(
      Math.max(lowerY, upperY + minThickness),
      upperY + minThickness,
      upperY + maxThickness,
    );
    return {
      lowerY: adjustedLowerY,
      upperY,
    };
  };
}

function buildPersonalBrowShapeModel({
  bottomY,
  browPoints,
  direction,
  innerX,
  maxThicknessRatio,
  minThicknessRatio,
  outerX,
  topY,
}: {
  bottomY: number;
  browPoints: E7Point2D[];
  direction: number;
  innerX: number;
  maxThicknessRatio: number;
  minThicknessRatio: number;
  outerX: number;
  topY: number;
}) {
  if (browPoints.length < 6) {
    return null;
  }

  const width = Math.max(1, Math.abs(outerX - innerX));
  const height = Math.max(1, bottomY - topY);
  const pointsWithT = browPoints
    .map(point => ({
      ...point,
      t: clamp01(((point.x - innerX) * direction) / width),
    }))
    .sort((first, second) => first.t - second.t || first.y - second.y);
  const sortedY = [...pointsWithT].sort((first, second) => first.y - second.y);
  const splitY = sortedY[Math.floor(sortedY.length * 0.52)]?.y ?? topY + height * 0.5;
  const upperChain = pointsWithT
    .filter(point => point.y <= splitY)
    .sort((first, second) => first.t - second.t || first.y - second.y);
  const lowerChain = pointsWithT
    .filter(point => point.y > splitY)
    .sort((first, second) => first.t - second.t || second.y - first.y);

  if (upperChain.length < 2 || lowerChain.length < 2) {
    return null;
  }

  return (t: number) => {
    const upperY = smoothChainY(upperChain, t);
    const lowerY = smoothChainY(lowerChain, t);
    const minThickness = height * minThicknessRatio;
    const maxThickness = height * maxThicknessRatio;
    const adjustedLowerY = clamp(
      Math.max(lowerY, upperY + minThickness),
      upperY + minThickness,
      upperY + maxThickness,
    );
    return {
      lowerY: adjustedLowerY,
      upperY,
    };
  };
}

function smoothChainY(
  chain: ReadonlyArray<E7Point2D & {t: number}>,
  t: number,
) {
  if (chain.length <= 2) {
    return interpolateChainY(chain, t);
  }

  const bandwidth = 0.16;
  let weightedY = 0;
  let weightSum = 0;
  for (const point of chain) {
    const distance = t - point.t;
    const weight = Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth));
    weightedY += point.y * weight;
    weightSum += weight;
  }

  const smoothedY = weightSum > 0 ? weightedY / weightSum : interpolateChainY(chain, t);
  const interpolatedY = interpolateChainY(chain, t);
  return lerp(interpolatedY, smoothedY, 0.72);
}

function interpolateChainY(
  chain: ReadonlyArray<E7Point2D & {t: number}>,
  t: number,
) {
  if (t <= chain[0].t) {
    return chain[0].y;
  }
  const last = chain[chain.length - 1];
  if (t >= last.t) {
    return last.y;
  }

  for (let index = 1; index < chain.length; index += 1) {
    const previous = chain[index - 1];
    const current = chain[index];
    if (t <= current.t) {
      const localT = clamp01(
        (t - previous.t) / (current.t - previous.t || Number.EPSILON),
      );
      return lerp(previous.y, current.y, smoothstep(0, 1, localT));
    }
  }

  return last.y;
}

function deriveTempleAnchor(
  faceOvalPoints: E7Point2D[],
  side: BrowEnvelope['side'],
): E7Point2D | null {
  const faceBounds = bounds(faceOvalPoints);
  if (!faceBounds) {
    return null;
  }

  const [faceMinX, faceMinY, faceMaxX, faceMaxY] = faceBounds;
  const faceWidth = Math.max(1, faceMaxX - faceMinX);
  const faceHeight = Math.max(1, faceMaxY - faceMinY);
  const sideThreshold =
    side === 'left' ? faceMinX + faceWidth * 0.62 : faceMinX + faceWidth * 0.38;
  const upperLimitY = faceMinY + faceHeight * 0.42;
  const candidates = faceOvalPoints.filter(point =>
    side === 'left'
      ? point.x >= sideThreshold && point.y <= upperLimitY
      : point.x <= sideThreshold && point.y <= upperLimitY,
  );

  if (candidates.length) {
    return centroid(candidates);
  }

  const sorted = [...faceOvalPoints]
    .filter(point => point.y <= upperLimitY)
    .sort((first, second) =>
      side === 'left' ? second.x - first.x : first.x - second.x,
    );
  return centroid(sorted.slice(0, 4));
}

function estimateFaceDirectionSlope(
  noseBridgeAnchor: E7Point2D | null,
  templeAnchor: E7Point2D | null,
) {
  if (!noseBridgeAnchor || !templeAnchor) {
    return 0;
  }

  const deltaX = templeAnchor.x - noseBridgeAnchor.x;
  if (Math.abs(deltaX) < 1) {
    return 0;
  }

  return clamp((templeAnchor.y - noseBridgeAnchor.y) / deltaX, -0.22, 0.22);
}

function stabilizePointToFaceDirection(
  point: E7Point2D,
  centerX: number,
  envelopeHeight: number,
  faceDirectionSlope: number,
): E7Point2D {
  const yOffset = clamp(
    (point.x - centerX) * faceDirectionSlope * 0.3,
    -envelopeHeight * 0.1,
    envelopeHeight * 0.1,
  );
  return {
    x: point.x,
    y: point.y + yOffset,
  };
}

function centroid(points: E7Point2D[]): E7Point2D | null {
  if (!points.length) {
    return null;
  }

  const sum = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    {x: 0, y: 0},
  );
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

function browStrandDensity(
  point: E7Point2D,
  envelope: BrowEnvelope,
  controls: GeneratedBrowControls,
) {
  const local = browLocalCoordinates(point, envelope);
  const {t, v} = local;
  const arch = Math.sin(Math.PI * t);
  const head = 1 - smoothstep(0.02, 0.28, t);
  const tail = smoothstep(0.58, 1, t);
  const body = smoothstep(0.05, 0.2, t) * smoothstep(0.02, 0.28, 1 - t);
  const verticalBody =
    smoothstep(0.1, 0.42, v) * smoothstep(0.04, 0.38, 1 - v);
  const browCurve = arch * 0.82 - tail * 0.36 + head * 0.18;
  const primaryPhase = fract(t * 42.0 + v * 8.4 + browCurve * 0.52);
  const secondaryPhase = fract(t * 31.0 + v * 5.2 + browCurve * 0.37 + 0.27);
  const finePhase = fract(t * 63.0 + v * 10.6 + browCurve * 0.24 + 0.61);
  const primaryStroke = ridge(primaryPhase, 0.035);
  const secondaryStroke = ridge(secondaryPhase, 0.026) * 0.54;
  const fineStroke = ridge(finePhase, 0.018) * 0.34;
  const headPhase = fract(t * 54.0 + v * 2.2 + 0.19);
  const headStroke = ridge(headPhase, 0.032) * head * smoothstep(0.18, 0.82, v);
  const tailFade = lerp(1, 0.44, tail);
  const opacityProfile =
    (verticalBody * (0.74 + body * 0.26) + headStroke * 0.42) * tailFade;
  const strand =
    (primaryStroke * 0.82 + secondaryStroke + fineStroke + headStroke * 0.72) *
    opacityProfile;
  return clamp01(strand * controls.intensity * 1.18);
}

function browFillDensity(point: E7Point2D, envelope: BrowEnvelope) {
  const {t, v} = browLocalCoordinates(point, envelope);
  const headFade = lerp(0.54, 1, smoothstep(0, 0.2, t));
  const tailFade = lerp(1, 0.22, smoothstep(0.64, 1, t));
  const verticalCore =
    smoothstep(0.04, 0.36, v) * smoothstep(0.04, 0.34, 1 - v);
  const bodyBoost = lerp(0.76, 1.08, Math.sin(Math.PI * t));
  return clamp01((0.1 + verticalCore * 0.9) * headFade * tailFade * bodyBoost);
}

function browLocalCoordinates(point: E7Point2D, envelope: BrowEnvelope) {
  const [minX, minY, maxX, maxY] = envelope.fillBounds;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const t =
    envelope.side === 'left'
      ? clamp01((point.x - minX) / width)
      : clamp01((maxX - point.x) / width);
  const v = clamp01((point.y - minY) / height);
  return {t, v};
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

function interpolateScreen(
  weights: readonly [number, number, number],
  triangleScreen: number[][],
): E7Point2D {
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

function pointInRect(point: E7Point2D, rect: [number, number, number, number]) {
  return (
    point.x >= rect[0] &&
    point.x <= rect[2] &&
    point.y >= rect[1] &&
    point.y <= rect[3]
  );
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function fract(value: number) {
  return value - Math.floor(value);
}

function ridge(phase: number, width: number) {
  return 1 - smoothstep(0, width, Math.abs(phase - 0.5));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || Number.EPSILON));
  return t * t * (3 - 2 * t);
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

function clamp01(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function boostBrowRuntimeColorStrength(value: number): number {
  return clamp01(value * BROW_RUNTIME_COLOR_STRENGTH_GAIN);
}
