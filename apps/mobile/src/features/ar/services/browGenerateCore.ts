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
    browCorePointCount: number;
    browPointCount: number;
    browShapeBasePointCount: number;
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
  browCorePointCount: number;
  browShapeBasePointCount: number;
  envelopeCount: number;
  expectedMaskUvMaxX: number;
  expectedMaskUvMaxY: number;
  expectedMaskUvMinX: number;
  expectedMaskUvMinY: number;
  eyeExclusionTexels: number;
  faceOvalPointCount: number;
  softEdgeTexels: number;
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
    generationMethod: 'brow_landmark_ring_follow_v3';
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
  softEdgeTexels: number;
  localOnly: true;
  offDeviceUpload: false;
  longTermRawFrameStored: false;
  runtimeReady: boolean;
  anchorStabilizationMode: 'surround_anchor_eye_eyelid_temple_nose_face_oval_v2';
  browAnchorPointCount: number;
  browCorePointCount: number;
  browShapeBasePointCount: number;
  colorHex: string;
  coverage: number;
  eyeAnchorPointCount: number;
  eyeExclusionMode: 'upper_eyelid_expanded_eye_bounds_v2';
  expectedMaskUvMaxX: number;
  expectedMaskUvMaxY: number;
  expectedMaskUvMinX: number;
  expectedMaskUvMinY: number;
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
      generationMethod: 'brow_landmark_ring_follow_v3',
    },
    eyeExclusion: {
      enforced: true,
      mode: 'upper_eyelid_expanded_eye_bounds_v2',
    },
    runtimeApplyPayload,
    uvCoverageMetadata: {
      alphaChecksum: uvMask.alphaChecksum,
      alphaSum: uvMask.alphaSum,
      browCorePointCount: anchorSummary.browCorePointCount,
      browShapeBasePointCount: anchorSummary.browShapeBasePointCount,
      envelopeCount: envelopes.length,
      expectedMaskUvMaxX: uvMask.expectedMaskUvMaxX,
      expectedMaskUvMaxY: uvMask.expectedMaskUvMaxY,
      expectedMaskUvMinX: uvMask.expectedMaskUvMinX,
      expectedMaskUvMinY: uvMask.expectedMaskUvMinY,
      eyeExclusionTexels: uvMask.eyeExclusionTexels,
      faceOvalPointCount: anchorSummary.faceOvalPointCount,
      softEdgeTexels: uvMask.softEdgeTexels,
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
    maskFeatherUvNormalized: 0.05,
    softEdgeTexels: mask.softEdgeTexels,
    localOnly: true,
    offDeviceUpload: false,
    longTermRawFrameStored: false,
    runtimeReady: false,
    anchorStabilizationMode: 'surround_anchor_eye_eyelid_temple_nose_face_oval_v2',
    browAnchorPointCount: anchorSummary.browAnchorPointCount,
    browCorePointCount: anchorSummary.browCorePointCount,
    browShapeBasePointCount: anchorSummary.browShapeBasePointCount,
    colorHex: controls.colorHex,
    coverage: clamp01(controls.coverage),
    eyeAnchorPointCount: anchorSummary.eyeAnchorPointCount,
    eyeExclusionMode: 'upper_eyelid_expanded_eye_bounds_v2',
    expectedMaskUvMaxX: mask.expectedMaskUvMaxX,
    expectedMaskUvMaxY: mask.expectedMaskUvMaxY,
    expectedMaskUvMinX: mask.expectedMaskUvMinX,
    expectedMaskUvMinY: mask.expectedMaskUvMinY,
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
  expectedMaskUvMaxX: number;
  expectedMaskUvMaxY: number;
  expectedMaskUvMinX: number;
  expectedMaskUvMinY: number;
  positiveTexels: number;
  rawRgbaBase64: string;
  softEdgeTexels: number;
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
        const localFill = clamp01(
          desiredSamples / (BROW_SUPERSAMPLE_GRID * BROW_SUPERSAMPLE_GRID),
        );
        const desiredAlpha = Math.round(localFill * 255);
        // Confine hair strands to the dense body: fade them out with the fill so
        // individual strokes do not fringe past the brow edge (that fringing is
        // what made the soft outer layer look bumpy).
        const strand = Math.round(
          clamp01(desiredSamples > 0 ? strandSamples / desiredSamples : 0) *
            localFill *
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
  let softEdgeTexels = 0;
  let alphaSum = 0;
  let alphaChecksum = 0;
  let expectedMaskUvMinX = 1;
  let expectedMaskUvMinY = 1;
  let expectedMaskUvMaxX = 0;
  let expectedMaskUvMaxY = 0;
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
      const column = texelIndex % resolution;
      const row = Math.floor(texelIndex / resolution);
      const u = (column + 0.5) / resolution;
      const v = (row + 0.5) / resolution;
      expectedMaskUvMinX = Math.min(expectedMaskUvMinX, u);
      expectedMaskUvMinY = Math.min(expectedMaskUvMinY, v);
      expectedMaskUvMaxX = Math.max(expectedMaskUvMaxX, u);
      expectedMaskUvMaxY = Math.max(expectedMaskUvMaxY, v);
    }
    if (alpha > 8 && alpha < 247) {
      softEdgeTexels += 1;
    }
  }

  return {
    alphaChecksum,
    alphaSum,
    eyeExclusionTexels,
    expectedMaskUvMaxX,
    expectedMaskUvMaxY,
    expectedMaskUvMinX,
    expectedMaskUvMinY,
    height: resolution,
    positiveTexels,
    rawRgbaBase64: encodeBase64(raw),
    softEdgeTexels,
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

  if (envelopes.length === 1) {
    const fallback = mirrorEnvelopeAcrossFaceCenter(
      envelopes[0],
      faceOval,
      noseBridge,
      frameWidth,
    );
    if (fallback) {
      envelopes.push(fallback);
    }
  }

  return envelopes;
}

function mirrorEnvelopeAcrossFaceCenter(
  envelope: BrowEnvelope,
  faceOvalPoints: E7Point2D[],
  noseBridgePoints: E7Point2D[],
  frameWidth: number,
): BrowEnvelope | null {
  const noseAnchor = centroid(noseBridgePoints);
  const faceBounds = bounds(faceOvalPoints);
  const faceCenterX =
    noseAnchor?.x ?? (faceBounds ? (faceBounds[0] + faceBounds[2]) * 0.5 : null);
  if (faceCenterX === null) {
    return null;
  }

  const flipPoint = (point: E7Point2D): E7Point2D => ({
    x: clamp(2 * faceCenterX - point.x, 0, frameWidth - 1),
    y: point.y,
  });
  const flipRect = (
    rect: [number, number, number, number],
  ): [number, number, number, number] => [
    clamp(2 * faceCenterX - rect[2], 0, frameWidth - 1),
    rect[1],
    clamp(2 * faceCenterX - rect[0], 0, frameWidth - 1),
    rect[3],
  ];
  const polygon = envelope.polygon.map(flipPoint);

  return {
    ...envelope,
    cleanupPolygon: envelope.cleanupPolygon.map(flipPoint),
    eyeExclusionBounds: flipRect(envelope.eyeExclusionBounds),
    fillBounds: bounds(polygon) ?? flipRect(envelope.fillBounds),
    polygon,
    side: envelope.side === 'left' ? 'right' : 'left',
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
  const direction = side === 'left' ? 1 : -1;
  const faceDirectionSlope = estimateFaceDirectionSlope(
    noseBridgeAnchor,
    templeAnchor,
  );
  let minX = clamp(browMinX, 0, frameWidth - 1);
  let maxX = clamp(browMaxX, 0, frameWidth - 1);
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
  const topPad = Math.max(browHeight * 0.18, eyelidHeight * 0.07);
  // Generous bottom room so the descending tail (past the arch peak) is not
  // clamped flat; the eye guard below remains the hard safety line.
  const bottomPad = Math.max(browHeight * 0.4, eyelidHeight * 0.14);
  const topY = clamp(browMinY - topPad, 0, frameHeight - 1);
  const eyeGuardTop = Math.min(eyeMinY, lidMinY) - eyelidHeight * 0.12;
  const bottomY = clamp(
    Math.min(browMaxY + bottomPad, eyeGuardTop),
    topY + Math.max(1, browHeight * 0.42),
    frameHeight - 1,
  );
  const centerX = (minX + maxX) * 0.5;
  const height = Math.max(1, bottomY - topY);
  // head = inner end (toward nose), tail = outer end (toward temple). Keep the
  // full measured length and extend the tail slightly past the detected end —
  // Korean-style brows finish with a drawn-out tail, and the MediaPipe ring
  // usually stops short of the visible one.
  const browHeadX = side === 'left' ? minX : maxX;
  const browTailX = side === 'left' ? maxX : minX;
  const innerX = browHeadX + direction * browWidth * 0.015;
  const outerX = browTailX + direction * browWidth * 0.04;

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
  const polygonBounds = bounds(polygon) ?? [minX, topY, maxX, bottomY];
  const cleanupMargin = Math.max(4, browHeight * 0.2);
  const cleanupMinX = clamp(polygonBounds[0] - cleanupMargin, 0, frameWidth - 1);
  const cleanupMaxX = clamp(polygonBounds[2] + cleanupMargin, 0, frameWidth - 1);
  const cleanupTopY = clamp(polygonBounds[1] - cleanupMargin, 0, frameHeight - 1);
  const cleanupBottomY = clamp(
    polygonBounds[3] + cleanupMargin,
    0,
    frameHeight - 1,
  );
  const cleanupPolygon = [
    {x: cleanupMinX, y: cleanupTopY},
    {x: cleanupMaxX, y: cleanupTopY},
    {x: cleanupMaxX, y: cleanupBottomY},
    {x: cleanupMinX, y: cleanupBottomY},
  ];

  return {
    anchorMetadata: {
      browCorePointCount: browPoints.length,
      browPointCount: browAnchorPoints.length,
      browShapeBasePointCount: shapeBasePoints.length,
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
      clamp(Math.min(eyeMinY, lidMinY) - eyelidHeight * 0.12, 0, frameHeight - 1),
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
      summary.browCorePointCount += metadata.browCorePointCount;
      summary.browShapeBasePointCount += metadata.browShapeBasePointCount;
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
      browCorePointCount: 0,
      browShapeBasePointCount: 0,
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

  const measuredShape =
    ringShape ??
    ((t: number) => {
      // No usable landmark ring: fall back to a flat band inside the envelope.
      const upperY = topY + height * 0.34;
      const lowerY = bottomY - height * 0.18;
      void t;
      return {lowerY, upperY};
    });

  return buildSmoothBrowEnvelopePolygon({
    appearanceShape,
    bottomY,
    direction,
    frameHeight,
    frameWidth,
    innerX,
    measuredShape,
    outerX,
    shapeId,
    stabilizePoint,
    topY,
  });
}

// Landmarks decide only WHERE the brow sits (head/tail anchors, measured
// thickness, measured arch). The visible outline is a makeup-style smooth
// envelope: an analytic centerline plus a thickness profile, sampled densely.
// This keeps head -> body -> arch -> tail flowing as one curve and removes the
// per-vertex MediaPipe jitter that made the older ring-following outline lumpy.
function buildSmoothBrowEnvelopePolygon({
  appearanceShape,
  bottomY,
  direction,
  frameHeight,
  frameWidth,
  innerX,
  measuredShape,
  outerX,
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
  measuredShape: (t: number) => {lowerY: number; upperY: number};
  outerX: number;
  shapeId: BrowShapeId;
  stabilizePoint: (point: E7Point2D) => E7Point2D;
  topY: number;
}): E7Point2D[] {
  const height = Math.max(1, bottomY - topY);
  const measure = (t: number) => {
    const ring = measuredShape(t);
    const appearance = appearanceShape?.(t);
    if (!appearance) {
      return ring;
    }
    return {
      lowerY: lerp(ring.lowerY, appearance.lowerY, 0.4),
      upperY: lerp(ring.upperY, appearance.upperY, 0.4),
    };
  };

  // Robust anchors: head/tail brow CENTERS set the natural baseline and tilt.
  // The mask is a constant-thickness band centered on the brow; only the arch
  // (how much the band curves up toward the peak) differs between shapes, so
  // 일자/세미아치/아치 read as different SHAPES at the same thickness.
  const headMeasure = measure(0);
  const tailMeasure = measure(1);
  const headCenterY = (headMeasure.upperY + headMeasure.lowerY) * 0.5;
  const tailCenterY = (tailMeasure.upperY + tailMeasure.lowerY) * 0.5;
  const thicknessSamples: number[] = [];
  let measuredArchRise = 0;
  let measuredArchPeakT = 0.62;
  for (let step = 0; step <= 24; step += 1) {
    const t = step / 24;
    const sample = measure(t);
    thicknessSamples.push(Math.max(1, sample.lowerY - sample.upperY));
    const chordCenterY = lerp(headCenterY, tailCenterY, t);
    const rise = chordCenterY - sample.upperY;
    if (rise > measuredArchRise) {
      measuredArchRise = rise;
      measuredArchPeakT = t;
    }
  }
  const sortedThickness = [...thicknessSamples].sort((first, second) => first - second);
  const medianThickness = sortedThickness[Math.floor(sortedThickness.length / 2)] ?? height * 0.3;

  // Thickness is the SAME across shapes (only the curve differs). Full coverage:
  // the band must hide the real brow underneath, otherwise it reads as a small
  // sticker floating on top of visible hairs.
  const bodyThickness = clamp(medianThickness * 1.12, height * 0.12, height * 0.6);
  // Sit high enough on the brow that the band covers the body without dropping
  // below it. Straight brows have no arch to raise their middle, so they need a
  // larger lift or they read as sitting under the real brow (device feedback).
  const verticalLift = medianThickness * (shapeId === 'straight' ? 0.34 : 0.18);
  // Per-shape curve: arch height at the peak, then a tail that DESCENDS below
  // the head->tail chord past the peak (눈썹 산 기준 하강) — natural Korean brow
  // finishes lower than the arch, even for 일자.
  const archScale = shapeId === 'straight' ? 0 : shapeId === 'slim-tail' ? 1 : 0.5;
  const archPeakT = clamp(measuredArchPeakT, 0.54, 0.7);
  const archMagnitude = archScale * (medianThickness * 0.55 + measuredArchRise * 0.35);
  const tailDropMagnitude =
    medianThickness *
    (shapeId === 'straight' ? 0.22 : shapeId === 'slim-tail' ? 0.9 : 0.55);

  const archProfile = (t: number) => {
    const sigma = 0.3;
    const d = (t - archPeakT) / sigma;
    return Math.exp(-0.5 * d * d);
  };
  const tailDropProfile = (t: number) => smoothstep(archPeakT, 1, t);
  // Thickness profile is shape-independent: soft head, late tail taper so the
  // tail stays visible while it descends, finishing in a sharp tip.
  const thicknessProfile = (t: number) => {
    const headRamp = lerp(0.7, 1, smoothstep(0, 0.12, t));
    const tailRamp = 1 - smoothstep(0.62, 1, t) * 0.84;
    const bodyRamp = 0.94 + 0.06 * Math.sin(Math.PI * t);
    return clamp(headRamp * tailRamp * bodyRamp, 0.07, 1);
  };

  const sampleCount = 48;
  const upperCurve: E7Point2D[] = [];
  const lowerCurve: E7Point2D[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    const x = lerp(innerX, outerX, t);
    const centerY =
      lerp(headCenterY, tailCenterY, t) -
      archMagnitude * archProfile(t) +
      tailDropMagnitude * tailDropProfile(t) -
      verticalLift;
    const width = bodyThickness * thicknessProfile(t);
    upperCurve.push({x, y: centerY - width * 0.5});
    lowerCurve.push({x, y: centerY + width * 0.5});
  }

  // Extend the tail past the last sample into a sharp tip that keeps
  // descending, so head->body->arch->tail finishes as one sleek stroke.
  const tailUpper = upperCurve[sampleCount - 1];
  const tailLower = lowerCurve[sampleCount - 1];
  const tailPoint = {
    x: outerX + direction * height * (shapeId === 'slim-tail' ? 0.09 : 0.06),
    y: (tailUpper.y + tailLower.y) * 0.5 + tailDropMagnitude * 0.3,
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
      y: clamp(point.y, topY, Math.min(bottomY, frameHeight - 1)),
    }));
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
  const {t} = browLocalCoordinates(point, envelope);
  // Solid fill: no vertical gradient / soft outer layer at all. Device feedback
  // (repeated): the soft outer band renders bumpy and asymmetric on the sparse
  // ARFace mesh and hurts naturalness, so the brow is a clean defined shape and
  // the only softening is the polygon anti-alias edge plus a tight shader
  // feather. Head/tail keep a longitudinal taper so the ends are not blunt.
  const headFade = lerp(0.74, 1, smoothstep(0, 0.09, t));
  const tailFade = lerp(1, 0.55, smoothstep(0.7, 1, t));
  return clamp01(headFade * tailFade);
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
