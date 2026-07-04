import {
  DEFAULT_GENERATED_BROW_CONTROLS,
  buildGeneratedBrowMaskUnityPayload,
  buildGeneratedBrowPackage,
} from './browGenerateCore';
import {summarizeGeneratedBrowRuntimeDiagnostics} from './browRuntimeDiagnostics';
import type {
  E7ArFaceExport,
  E7NativeBoundaryResult,
  E7NativeFaceLandmarkRegion,
  E7Point2D,
} from './personalizedGenerate/e7PersonalizedGeneratePipeline';

const UPSTREAM_EYE_BROW_RING_POINT_COUNT_PER_SIDE = 10;

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectTruthy(value: unknown, label: string) {
  if (!value) {
    throw new Error(`${label}: expected truthy value`);
  }
}

function expectGreaterThan(actual: number, expected: number, label: string) {
  if (!(actual > expected)) {
    throw new Error(`${label}: expected > ${expected}, received ${actual}`);
  }
}

function expectGreaterThanOrEqual(actual: number, expected: number, label: string) {
  if (!(actual >= expected)) {
    throw new Error(`${label}: expected >= ${expected}, received ${actual}`);
  }
}

function expectLessThan(actual: number, expected: number, label: string) {
  if (!(actual < expected)) {
    throw new Error(`${label}: expected < ${expected}, received ${actual}`);
  }
}

function expectClose(actual: number, expected: number, epsilon: number, label: string) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function region(points: E7Point2D[]): E7NativeFaceLandmarkRegion {
  return {
    imagePoints: points,
    pointCount: points.length,
    status: 'available',
  };
}

function points(values: readonly [number, number][]): E7Point2D[] {
  return values.map(([x, y]) => ({x, y}));
}

function centerX(bounds: readonly [number, number, number, number]) {
  return (bounds[0] + bounds[2]) * 0.5;
}

function boundsOfPoints(points: readonly E7Point2D[]): [number, number, number, number] {
  return points.reduce(
    (nextBounds, point) => [
      Math.min(nextBounds[0], point.x),
      Math.min(nextBounds[1], point.y),
      Math.max(nextBounds[2], point.x),
      Math.max(nextBounds[3], point.y),
    ],
    [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ] as [number, number, number, number],
  );
}

function regionPoints(regionValue: E7NativeFaceLandmarkRegion, label: string): E7Point2D[] {
  if (!regionValue.imagePoints) {
    throw new Error(`${label}: expected imagePoints`);
  }
  return regionValue.imagePoints;
}

function normalizePointToBounds(
  point: E7Point2D,
  bounds: readonly [number, number, number, number],
) {
  const width = Math.max(1, bounds[2] - bounds[0]);
  const height = Math.max(1, bounds[3] - bounds[1]);
  return {
    x: (point.x - bounds[0]) / width,
    y: (point.y - bounds[1]) / height,
  };
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/\s/g, '');
  const bytes: number[] = [];

  for (let index = 0; index < clean.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(clean[index] ?? 'A');
    const second = BASE64_ALPHABET.indexOf(clean[index + 1] ?? 'A');
    const thirdChar = clean[index + 2] ?? '=';
    const fourthChar = clean[index + 3] ?? '=';
    const third = thirdChar === '=' ? 0 : BASE64_ALPHABET.indexOf(thirdChar);
    const fourth = fourthChar === '=' ? 0 : BASE64_ALPHABET.indexOf(fourthChar);

    bytes.push((first << 2) | (second >> 4));
    if (thirdChar !== '=') {
      bytes.push(((second & 15) << 4) | (third >> 2));
    }
    if (fourthChar !== '=') {
      bytes.push(((third & 3) << 6) | fourth);
    }
  }

  return new Uint8Array(bytes);
}

function summarizeGeneratedBrowRgbaChannels(raw: Uint8Array) {
  let redActiveTexels = 0;
  let greenAlphaActiveTexels = 0;
  let greenAlphaMismatchTexels = 0;
  let greenAlphaSoftEdgeTexels = 0;
  let strandActiveTexels = 0;

  for (let rawIndex = 0; rawIndex + 3 < raw.length; rawIndex += 4) {
    const red = raw[rawIndex];
    const green = raw[rawIndex + 1];
    const blue = raw[rawIndex + 2];
    const alpha = raw[rawIndex + 3];

    if (red > 8) {
      redActiveTexels += 1;
    }
    if (Math.max(green, alpha) > 8) {
      greenAlphaActiveTexels += 1;
    }
    if (Math.max(green, alpha) > 8 && Math.max(green, alpha) < 247) {
      greenAlphaSoftEdgeTexels += 1;
    }
    if (green !== alpha) {
      greenAlphaMismatchTexels += 1;
    }
    if (blue > 8) {
      strandActiveTexels += 1;
    }
  }

  return {
    greenAlphaActiveTexels,
    greenAlphaMismatchTexels,
    greenAlphaSoftEdgeTexels,
    redActiveTexels,
    strandActiveTexels,
  };
}

const frameWidth = 800;
const frameHeight = 600;
const arFaceExport: E7ArFaceExport = {
  capturePairId: 'pair_brow_contract',
  indices: [0, 1, 2, 0, 2, 3],
  screenVertices: [
    [0, 0],
    [frameWidth, 0],
    [frameWidth, frameHeight],
    [0, frameHeight],
  ],
  uvs: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ],
};

const namedRegions = {
  faceOval: region(
    points([
      [400, 70],
      [540, 95],
      [650, 180],
      [700, 310],
      [660, 440],
      [540, 535],
      [400, 565],
      [260, 535],
      [140, 440],
      [100, 310],
      [150, 180],
      [260, 95],
    ]),
  ),
  // intentionally more arched than the right ring so per-side
  // asymmetric shape following can be asserted below
  leftEyebrow: region(
    points([
      [488, 178],
      [512, 164],
      [552, 148],
      [603, 154],
      [650, 181],
      [646, 198],
      [604, 192],
      [556, 186],
      [514, 186],
      [486, 190],
    ]),
  ),
  leftEyebrowSurroundAnchors: region(
    points([
      [474, 176],
      [488, 164],
      [512, 154],
      [552, 146],
      [603, 150],
      [642, 166],
      [662, 183],
      [653, 202],
      [610, 205],
      [556, 199],
      [510, 199],
      [480, 195],
    ]),
  ),
  leftEye: region(
    points([
      [500, 251],
      [515, 238],
      [542, 230],
      [575, 229],
      [608, 238],
      [630, 252],
      [610, 266],
      [575, 273],
      [542, 270],
      [515, 263],
    ]),
  ),
  leftTemple: region(
    points([
      [665, 165],
      [684, 210],
      [698, 260],
      [702, 318],
      [692, 374],
      [670, 426],
    ]),
  ),
  leftUpperEyelid: region(
    points([
      [500, 251],
      [515, 238],
      [542, 230],
      [575, 229],
      [608, 238],
      [630, 252],
    ]),
  ),
  noseBridge: region(
    points([
      [400, 195],
      [401, 225],
      [402, 255],
      [402, 285],
      [401, 315],
      [400, 345],
    ]),
  ),
  rightEyebrow: region(
    points([
      [150, 181],
      [197, 160],
      [248, 156],
      [288, 164],
      [312, 178],
      [314, 190],
      [286, 186],
      [244, 186],
      [196, 192],
      [154, 198],
    ]),
  ),
  rightEyebrowSurroundAnchors: region(
    points([
      [138, 183],
      [158, 166],
      [197, 150],
      [248, 146],
      [288, 154],
      [312, 164],
      [326, 176],
      [320, 195],
      [290, 199],
      [244, 199],
      [190, 205],
      [147, 202],
    ]),
  ),
  rightEye: region(
    points([
      [170, 252],
      [192, 238],
      [225, 229],
      [258, 230],
      [285, 238],
      [300, 251],
      [285, 263],
      [258, 270],
      [225, 273],
      [190, 266],
    ]),
  ),
  rightTemple: region(
    points([
      [135, 165],
      [116, 210],
      [102, 260],
      [98, 318],
      [108, 374],
      [130, 426],
    ]),
  ),
  rightUpperEyelid: region(
    points([
      [170, 252],
      [192, 238],
      [225, 229],
      [258, 230],
      [285, 238],
      [300, 251],
    ]),
  ),
};

const nativeResult: E7NativeBoundaryResult = {
  arFaceExport,
  arFaceExportPath: 'Documents/e7-reference-atlas/pair_brow_contract/arface_export.json',
  capturePairId: 'pair_brow_contract',
  captureSetId: 'full-face-capture-set-brow-contract',
  captureShotKind: 'neutral',
  faceLandmarks: {
    coordinateSpace: 'frame_image_pixel_top_left',
    landmarkCount: 478,
    namedRegions,
    provider: 'mediapipe',
  },
  frameHeight,
  framePath: 'Documents/e7-reference-atlas/pair_brow_contract/frame.png',
  frameWidth,
  provider: 'mediapipe',
  status: 'ready',
};

expectEqual(
  regionPoints(namedRegions.leftEyebrow, 'left eyebrow source').length,
  UPSTREAM_EYE_BROW_RING_POINT_COUNT_PER_SIDE,
  'screen-left generated brow keeps the reference eyebrow ring point count',
);
expectEqual(
  regionPoints(namedRegions.rightEyebrow, 'right eyebrow source').length,
  UPSTREAM_EYE_BROW_RING_POINT_COUNT_PER_SIDE,
  'screen-right generated brow keeps the reference eyebrow ring point count',
);

const controls = {
  ...DEFAULT_GENERATED_BROW_CONTROLS,
  colorHex: '#17120F',
  enabled: true,
  intensity: 0.93,
  opacity: 0.95,
  shapeId: 'soft-arch' as const,
  strandTextureAmount: 0.97,
};

const generatedPackage = buildGeneratedBrowPackage({controls, nativeResult});
const payload = buildGeneratedBrowMaskUnityPayload(generatedPackage, controls, {
  controlRevision: 7,
  includeTexture: true,
});
const envelopes = generatedPackage.browEnvelope.envelopes;

expectEqual(
  payload.schemaVersion,
  'e7-generated-brow-mask-runtime-payload-v0',
  'generated brow payload schema',
);
expectEqual(payload.maskTextureEncoding, 'raw_rgba_base64', 'generated brow texture encoding');
expectTruthy(payload.maskRawRgbaBase64, 'generated brow raw texture payload');
expectEqual(payload.maskTextureWidth, 512, 'generated brow mask texture width');
expectEqual(payload.maskTextureHeight, 512, 'generated brow mask texture height');
expectEqual(
  generatedPackage.browEnvelope.generationMethod,
  'brow_landmark_ring_follow_v3',
  'generated brow landmark-following envelope method',
);
expectGreaterThan(
  payload.maskFeatherUvNormalized,
  0,
  'generated brow Unity feather replaces reference GaussianBlur',
);
const rawRgba = decodeBase64(payload.maskRawRgbaBase64 ?? '');
const rawChannelSummary = summarizeGeneratedBrowRgbaChannels(rawRgba);
expectEqual(
  rawRgba.length,
  512 * 512 * 4,
  'generated brow raw texture byte count',
);
expectGreaterThan(
  rawChannelSummary.redActiveTexels,
  0,
  'generated brow red channel carries the real-brow neutralize region',
);
expectGreaterThan(
  rawChannelSummary.redActiveTexels,
  rawChannelSummary.greenAlphaActiveTexels,
  'neutralize region (red) is larger than the makeup fill (green) so the real brow is covered beyond the shape',
);
expectGreaterThan(
  rawChannelSummary.greenAlphaActiveTexels,
  0,
  'generated brow green/alpha mask channel has active texels',
);
expectGreaterThan(
  rawChannelSummary.greenAlphaSoftEdgeTexels,
  0,
  'generated brow green/alpha mask channel has soft-edge texels',
);
expectEqual(
  rawChannelSummary.greenAlphaMismatchTexels,
  0,
  'generated brow green and alpha mask channels stay in sync',
);
expectGreaterThan(
  rawChannelSummary.strandActiveTexels,
  0,
  'generated brow blue strand channel has active texels',
);
expectGreaterThan(
  generatedPackage.uvCoverageMetadata.positiveTexels,
  0,
  'generated brow positive texels',
);
expectGreaterThan(
  generatedPackage.uvCoverageMetadata.softEdgeTexels,
  0,
  'generated brow UV metadata tracks soft feathered edge texels',
);
expectGreaterThanOrEqual(
  generatedPackage.uvCoverageMetadata.expectedMaskUvMinX,
  0,
  'generated brow expected UV min x stays in range',
);
expectGreaterThanOrEqual(
  generatedPackage.uvCoverageMetadata.expectedMaskUvMinY,
  0,
  'generated brow expected UV min y stays in range',
);
expectLessThan(
  generatedPackage.uvCoverageMetadata.expectedMaskUvMaxX,
  1,
  'generated brow expected UV max x stays in range',
);
expectLessThan(
  generatedPackage.uvCoverageMetadata.expectedMaskUvMaxY,
  1,
  'generated brow expected UV max y stays in range',
);
expectGreaterThan(
  generatedPackage.uvCoverageMetadata.expectedMaskUvMaxX,
  generatedPackage.uvCoverageMetadata.expectedMaskUvMinX,
  'generated brow expected UV x bounds have positive area',
);
expectGreaterThan(
  generatedPackage.uvCoverageMetadata.expectedMaskUvMaxY,
  generatedPackage.uvCoverageMetadata.expectedMaskUvMinY,
  'generated brow expected UV y bounds have positive area',
);
expectEqual(
  payload.expectedMaskUvMinX,
  generatedPackage.uvCoverageMetadata.expectedMaskUvMinX,
  'generated brow payload carries expected UV min x',
);
expectEqual(
  payload.expectedMaskUvMinY,
  generatedPackage.uvCoverageMetadata.expectedMaskUvMinY,
  'generated brow payload carries expected UV min y',
);
expectEqual(
  payload.expectedMaskUvMaxX,
  generatedPackage.uvCoverageMetadata.expectedMaskUvMaxX,
  'generated brow payload carries expected UV max x',
);
expectEqual(
  payload.expectedMaskUvMaxY,
  generatedPackage.uvCoverageMetadata.expectedMaskUvMaxY,
  'generated brow payload carries expected UV max y',
);
expectEqual(
  payload.softEdgeTexels,
  generatedPackage.uvCoverageMetadata.softEdgeTexels,
  'generated brow payload carries soft feathered edge texels',
);
expectGreaterThan(
  generatedPackage.uvCoverageMetadata.strandChecksum,
  0,
  'generated brow strand texture channel',
);
expectEqual(
  generatedPackage.uvCoverageMetadata.browCorePointCount,
  20,
  'generated brow UV metadata tracks MediaPipe brow core ring points',
);
expectEqual(
  generatedPackage.uvCoverageMetadata.browShapeBasePointCount,
  20,
  'generated brow UV metadata tracks reference brow shape-base ring points',
);
expectEqual(envelopes.length, 2, 'generated brow envelope count');
expectGreaterThan(envelopes[0].polygon.length, 10, 'first brow shape-corrected polygon');
expectGreaterThan(envelopes[1].polygon.length, 10, 'second brow shape-corrected polygon');
const [screenLeftEnvelope, screenRightEnvelope] = [...envelopes].sort(
  (first, second) => centerX(first.fillBounds) - centerX(second.fillBounds),
);
const [screenLeftSourceBrowBounds, screenRightSourceBrowBounds] = [
  boundsOfPoints(regionPoints(namedRegions.leftEyebrow, 'left eyebrow source')),
  boundsOfPoints(regionPoints(namedRegions.rightEyebrow, 'right eyebrow source')),
].sort((first, second) => centerX(first) - centerX(second));
(
  [
    [screenLeftEnvelope, screenLeftSourceBrowBounds, 'screen-left'],
    [screenRightEnvelope, screenRightSourceBrowBounds, 'screen-right'],
  ] as const
).forEach(([envelope, ringBounds, sideLabel]) => {
  const ringWidth = Math.max(1, ringBounds[2] - ringBounds[0]);
  expectLessThan(
    Math.abs(envelope.fillBounds[0] - ringBounds[0]),
    ringWidth * 0.12,
    `${sideLabel} generated brow head follows its own ring x bounds`,
  );
  expectLessThan(
    Math.abs(envelope.fillBounds[2] - ringBounds[2]),
    ringWidth * 0.12,
    `${sideLabel} generated brow tail follows its own ring x bounds`,
  );
  const ringHeight = Math.max(1, ringBounds[3] - ringBounds[1]);
  const ringCenterY = (ringBounds[1] + ringBounds[3]) * 0.5;
  const envelopeCenterY = (envelope.fillBounds[1] + envelope.fillBounds[3]) * 0.5;
  // The mask is a smooth makeup envelope sitting on the brow band: it should be
  // centered near the brow (slightly lifted is intended) rather than tracing the
  // exact landmark ring.
  expectLessThan(
    Math.abs(envelopeCenterY - ringCenterY),
    ringHeight * 0.6,
    `${sideLabel} generated brow stays centered on the brow band`,
  );
  expectLessThan(
    envelope.fillBounds[1],
    ringCenterY,
    `${sideLabel} generated brow top reaches into the brow body`,
  );
  expectGreaterThan(
    envelope.fillBounds[3],
    ringCenterY - ringHeight * 0.5,
    `${sideLabel} generated brow lower edge stays on the brow, not floating above`,
  );
  expectLessThan(
    envelope.fillBounds[3],
    envelope.eyeExclusionBounds[1],
    `${sideLabel} generated brow stays above eye exclusion`,
  );
});
expectGreaterThan(
  Math.abs(screenLeftEnvelope.fillBounds[1] - screenRightEnvelope.fillBounds[1]),
  3,
  'per-side generated brow keeps asymmetric arch heights instead of mirroring',
);
expectGreaterThan(
  payload.surroundAnchorPointCount,
  70,
  'generated brow surround anchor count',
);
expectEqual(
  payload.browCorePointCount,
  20,
  'generated brow payload carries MediaPipe brow core ring points',
);
expectEqual(
  payload.browShapeBasePointCount,
  20,
  'generated brow payload carries reference brow shape-base ring points',
);
expectEqual(
  payload.anchorStabilizationMode,
  'surround_anchor_eye_eyelid_temple_nose_face_oval_v2',
  'generated brow stabilization mode',
);
expectEqual(
  payload.eyeExclusionMode,
  'upper_eyelid_expanded_eye_bounds_v2',
  'generated brow eye exclusion mode',
);
expectEqual(payload.eyeAnchorPointCount, 20, 'generated brow eye anchor count');
expectGreaterThan(
  payload.upperEyelidAnchorPointCount,
  10,
  'generated brow upper eyelid anchor count',
);
expectEqual(payload.cleanupStrength, 0, 'generated brow cleanup stays disabled');
expectGreaterThan(
  payload.neutralizeStrength,
  0,
  'generated brow neutralize is enabled so the shader can cover the real brow',
);
expectEqual(payload.intensity, 1, 'generated brow max color intensity boost');
expectEqual(payload.opacity, 1, 'generated brow max opacity boost');
expectEqual(payload.strandTextureAmount, 1, 'generated brow max strand texture boost');
expectEqual(payload.debugMode, 0, 'generated brow default debug mode');
expectEqual(payload.debugShowLeftRight, false, 'generated brow default left/right debug');
expectEqual(payload.debugExaggerate, false, 'generated brow default exaggeration debug');

const runtimeDiagnostic = summarizeGeneratedBrowRuntimeDiagnostics({
  applied: true,
  applyTrigger: 'runtime_sample',
  browAnchorPointCount: payload.browAnchorPointCount,
  browCorePointCount: payload.browCorePointCount,
  browShapeBasePointCount: payload.browShapeBasePointCount,
  maskTextureSampleChannel: 'generated_brow_green_alpha',
  maskTriangles: 118,
  maskUvBoundsAvailable: true,
  maskUvMaxX: 0.62,
  maskUvMaxY: 0.48,
  maskUvMinX: 0.31,
  maskUvMinY: 0.35,
  maskUvSplitMode: 'face_local_x_sign',
  expectedMaskUvMaxX: payload.expectedMaskUvMaxX,
  expectedMaskUvMaxY: payload.expectedMaskUvMaxY,
  expectedMaskUvMinX: payload.expectedMaskUvMinX,
  expectedMaskUvMinY: payload.expectedMaskUvMinY,
  runtimeReady: true,
  softEdgeTexels: payload.softEdgeTexels,
  stabilizationDeadZoneMeters: 0.00055,
  stabilizationSnapDistanceMeters: 0.0065,
  stabilityMode: 'generated_brow_arface_uv_deadband_fast_follow',
  status: 'ready',
  surroundAnchorPointCount: payload.surroundAnchorPointCount,
  trackingState: 'Tracking',
  uvAvailable: true,
});
expectEqual(runtimeDiagnostic.status, 'ready', 'generated brow runtime diagnostic ready state');
expectTruthy(
  runtimeDiagnostic.detailText.includes('core 20') &&
    runtimeDiagnostic.detailText.includes('base 20') &&
    runtimeDiagnostic.detailText.includes('trigger runtime_sample') &&
    runtimeDiagnostic.detailText.includes('uv 0.31,0.35,0.62,0.48') &&
    runtimeDiagnostic.detailText.includes('exp ') &&
    runtimeDiagnostic.detailText.includes('stab generated_brow_arface_uv_deadband_fast_follow') &&
    runtimeDiagnostic.detailText.includes('dead 0.00055') &&
    runtimeDiagnostic.detailText.includes('snap 0.00650') &&
    runtimeDiagnostic.detailText.includes('sample generated_brow_green_alpha'),
  'generated brow runtime diagnostic exposes attachment evidence',
);

const disabledControls = {
  ...controls,
  debugExaggerate: true,
  debugMode: 5 as const,
  debugShowLeftRight: true,
  enabled: false,
};
const disabledPayload = buildGeneratedBrowMaskUnityPayload(
  generatedPackage,
  disabledControls,
  {
    includeTexture: false,
  },
);

expectEqual(disabledPayload.enabled, false, 'disabled generated brow enabled flag');
expectEqual(disabledPayload.visible, false, 'disabled generated brow visible flag');
expectEqual(disabledPayload.maskVisible, false, 'disabled generated brow mask visibility');
expectEqual(
  disabledPayload.validationVisible,
  false,
  'disabled generated brow validation visibility',
);
expectEqual(
  disabledPayload.debugMode,
  0,
  'disabled generated brow clears debug mode',
);
expectEqual(
  disabledPayload.debugShowLeftRight,
  false,
  'disabled generated brow clears left/right debug',
);
expectEqual(
  disabledPayload.debugExaggerate,
  false,
  'disabled generated brow clears debug exaggeration',
);
expectEqual(
  disabledPayload.maskRawRgbaBase64,
  undefined,
  'disabled generated brow can omit raw texture payload',
);

const zeroStrengthPayload = buildGeneratedBrowMaskUnityPayload(
  generatedPackage,
  {
    ...controls,
    intensity: 0,
    opacity: 0,
    strandTextureAmount: 0,
  },
  {
    includeTexture: false,
  },
);

expectEqual(zeroStrengthPayload.intensity, 0, 'zero generated brow intensity stays zero');
expectEqual(zeroStrengthPayload.opacity, 0, 'zero generated brow opacity stays zero');
expectEqual(
  zeroStrengthPayload.strandTextureAmount,
  0,
  'zero generated brow strand texture stays zero',
);
