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
};

const BROW_UV_MASK_RESOLUTION = 512;
const BROW_SUPERSAMPLE_GRID = 2;
const UV_ALPHA_CHECKSUM_MOD = 2147483647;

export const DEFAULT_GENERATED_BROW_CONTROLS: GeneratedBrowControls = {
  cleanupStrength: 0.28,
  colorHex: '#4A342B',
  coverage: 0.9,
  enabled: false,
  intensity: 0.72,
  neutralizeStrength: 0.18,
  opacity: 0.72,
  shapeId: 'soft-arch',
  strandTextureAmount: 0.58,
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
    leftBrow: regions.leftBrow,
    leftEye: regions.leftEye,
    leftTemple: regions.leftTemple,
    leftUpperEyelid: regions.leftUpperEyelid,
    faceOval: regions.faceOval,
    noseBridge: regions.noseBridge,
    rightBrow: regions.rightBrow,
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
      'neutralize_strength_is_runtime_metadata_for_tone_lift',
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
  const payload: BrowRuntimeApplyPayload & Record<string, unknown> = {
    ...generatedPackage.runtimeApplyPayload,
    cleanupStrength: clamp01(controls.cleanupStrength),
    color: controls.colorHex,
    colorHex: controls.colorHex,
    coverage: clamp01(controls.coverage),
    enabled: controls.enabled,
    finish: 'hair-stroke-brow',
    intensity: clamp01(controls.intensity),
    maskOpacity: clamp01(controls.opacity),
    maskVisible: controls.enabled,
    neutralizeStrength: clamp01(controls.neutralizeStrength),
    opacity: clamp01(controls.opacity),
    preserveDetail: true,
    sample: 'natural_brow',
    shapeId: controls.shapeId,
    strandTextureAmount: clamp01(controls.strandTextureAmount),
    texture: 'natural_brow',
    textureAmount: clamp01(controls.strandTextureAmount),
    validationColor: controls.colorHex,
    validationColorHex: controls.colorHex,
    validationOpacity: clamp01(controls.opacity),
    validationVisible: controls.enabled,
    visible: controls.enabled,
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
    cleanupStrength: clamp01(controls.cleanupStrength),
    neutralizeStrength: clamp01(controls.neutralizeStrength),
    upperEyelidAnchorPointCount: anchorSummary.upperEyelidAnchorPointCount,
    texture: 'natural_brow',
    finish: 'hair-stroke-brow',
    preserveDetail: true,
    maskVisible: controls.enabled,
    validationVisible: controls.enabled,
    visible: controls.enabled,
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
              desiredSamples += 1;
              strandSamples += browStrandDensity(screenPoint, envelope.side, controls);
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
        const cleanupAlpha = Math.round(
          (cleanupSamples / (BROW_SUPERSAMPLE_GRID * BROW_SUPERSAMPLE_GRID)) * 255,
        );
        const strand = Math.round(
          clamp01(desiredSamples > 0 ? strandSamples / desiredSamples : 0) *
            255 *
            clamp01(controls.strandTextureAmount),
        );
        raw[rawIndex] = cleanupAlpha;
        raw[rawIndex + 1] = desiredAlpha;
        raw[rawIndex + 2] = Math.max(desiredAlpha, strand);
        raw[rawIndex + 3] = cleanupAlpha;
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
    leftBrow: normalizeLandmarkRegion(regions.leftEyebrow),
    leftEye: normalizeLandmarkRegion(regions.leftEye),
    leftTemple: normalizeLandmarkRegion(regions.leftTemple),
    leftUpperEyelid: normalizeLandmarkRegion(
      regions.leftUpperEyelid ?? regions.leftEye,
    ),
    noseBridge: normalizeLandmarkRegion(
      regions.noseBridge ?? regions.noseCrest ?? regions.medianLine ?? regions.nose,
    ),
    rightBrow: normalizeLandmarkRegion(regions.rightEyebrow),
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
  leftEye,
  leftTemple,
  leftUpperEyelid,
  faceOval,
  noseBridge,
  rightBrow,
  rightEye,
  rightTemple,
  rightUpperEyelid,
  shapeId,
}: {
  frameHeight: number;
  frameWidth: number;
  faceOval: E7Point2D[];
  leftBrow: E7Point2D[];
  leftEye: E7Point2D[];
  leftTemple: E7Point2D[];
  leftUpperEyelid: E7Point2D[];
  noseBridge: E7Point2D[];
  rightBrow: E7Point2D[];
  rightEye: E7Point2D[];
  rightTemple: E7Point2D[];
  rightUpperEyelid: E7Point2D[];
  shapeId: BrowShapeId;
}): BrowEnvelope[] {
  return [
    buildSingleBrowEnvelope({
      browPoints: leftBrow,
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
      browPoints: rightBrow,
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
}

function buildSingleBrowEnvelope({
  browPoints,
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
  browPoints: E7Point2D[];
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
  const browBounds = bounds(browPoints);
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
  const anchoredBrowBounds = expandBrowBoundsWithSurroundAnchors({
    browMaxX,
    browMinX,
    eyeWidth,
    faceBounds,
    noseBridgeAnchor,
    side,
    templeAnchor,
  });
  const shapeScale =
    shapeId === 'slim-tail' ? 0.78 : shapeId === 'straight' ? 0.92 : 1;
  const xPad = Math.max(
    browWidth * (shapeId === 'slim-tail' ? 0.14 : 0.24),
    eyelidWidth * 0.035,
  );
  const topPad = Math.max(browHeight * 0.85, eyelidHeight * 0.26);
  const bottomPad = Math.max(browHeight * 0.58, eyelidHeight * 0.16);
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
  const eyeGuardTop = Math.min(eyeMinY, lidMinY) - eyelidHeight * 0.22;
  const bottomY = clamp(
    Math.min(browMaxY + bottomPad, eyeGuardTop),
    topY + Math.max(1, browHeight * 0.55),
    frameHeight - 1,
  );
  const centerX = (minX + maxX) * 0.5;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, bottomY - topY);
  const archLift =
    shapeId === 'straight' ? height * 0.04 : height * (side === 'left' ? 0.16 : 0.16);
  const tailDrop = shapeId === 'slim-tail' ? height * 0.18 : height * 0.08;
  const innerX = centerX - direction * width * 0.5 * shapeScale;
  const outerX = centerX + direction * width * 0.5 * shapeScale;

  const stabilizePoint = (point: E7Point2D) =>
    stabilizePointToFaceDirection(point, centerX, height, faceDirectionSlope);
  const polygon = [
    {x: innerX, y: topY + height * 0.42},
    {x: centerX - direction * width * 0.18, y: topY + height * 0.16 - archLift},
    {x: centerX + direction * width * 0.2, y: topY + height * 0.12 - archLift * 0.6},
    {x: outerX, y: topY + height * 0.34 + tailDrop},
    {x: outerX, y: bottomY - height * 0.08},
    {x: centerX, y: bottomY},
    {x: innerX, y: bottomY - height * 0.02},
  ].map(stabilizePoint).map(point => ({
    x: clamp(point.x, 0, frameWidth - 1),
    y: clamp(point.y, 0, frameHeight - 1),
  }));
  const cleanupPadX = Math.max(xPad * 1.18, eyelidWidth * 0.05);
  const cleanupMinX = clamp(anchoredBrowBounds.minX - cleanupPadX, 0, frameWidth - 1);
  const cleanupMaxX = clamp(anchoredBrowBounds.maxX + cleanupPadX, 0, frameWidth - 1);
  const cleanupTopY = clamp(
    browMinY - Math.max(topPad * 0.72, eyelidHeight * 0.18),
    0,
    frameHeight - 1,
  );
  const cleanupBottomY = clamp(
    Math.min(
      browMaxY + Math.max(bottomPad * 1.25, browHeight * 0.86),
      Math.min(eyeMinY, lidMinY) - eyelidHeight * 0.1,
    ),
    cleanupTopY + Math.max(1, browHeight * 0.72),
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
      browPointCount: browPoints.length,
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
    (point.x - centerX) * faceDirectionSlope * 0.46,
    -envelopeHeight * 0.16,
    envelopeHeight * 0.16,
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
  side: BrowEnvelope['side'],
  controls: GeneratedBrowControls,
) {
  const direction = side === 'left' ? 1 : -1;
  const diagonal = point.x * 0.08 * direction + point.y * 0.12;
  const primary = Math.sin(diagonal) * 0.5 + 0.5;
  const secondary = Math.sin(diagonal * 2.7 + 1.3) * 0.5 + 0.5;
  const stroke = primary > 0.62 ? 1 : primary > 0.46 ? 0.5 : 0;
  return clamp01((stroke * 0.72 + secondary * 0.28) * controls.intensity);
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
