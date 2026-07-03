import {
  DEFAULT_GENERATED_BROW_CONTROLS,
  buildGeneratedBrowMaskUnityPayload,
  buildGeneratedBrowPackage,
} from './browGenerateCore';
import type {
  E7ArFaceExport,
  E7NativeBoundaryResult,
  E7NativeFaceLandmarkRegion,
  E7Point2D,
} from './personalizedGenerate/e7PersonalizedGeneratePipeline';

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
  leftEyebrow: region(
    points([
      [488, 178],
      [512, 164],
      [552, 156],
      [603, 160],
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
expectGreaterThan(
  generatedPackage.uvCoverageMetadata.positiveTexels,
  0,
  'generated brow positive texels',
);
expectGreaterThan(
  generatedPackage.uvCoverageMetadata.strandChecksum,
  0,
  'generated brow strand texture channel',
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
expectEqual(
  screenLeftEnvelope.polygon.length,
  screenRightEnvelope.polygon.length,
  'mirrored brow polygon point count',
);
screenLeftEnvelope.polygon.forEach((leftPoint, index) => {
  const normalizedLeft = normalizePointToBounds(leftPoint, screenLeftEnvelope.fillBounds);
  const normalizedRight = normalizePointToBounds(
    screenRightEnvelope.polygon[index],
    screenRightEnvelope.fillBounds,
  );
  expectClose(
    normalizedLeft.x,
    1 - normalizedRight.x,
    0.025,
    `mirrored brow polygon x ${index}`,
  );
  expectClose(normalizedLeft.y, normalizedRight.y, 0.025, `mirrored brow polygon y ${index}`);
});
expectLessThan(
  screenLeftEnvelope.fillBounds[3],
  screenLeftEnvelope.eyeExclusionBounds[1],
  'screen-left generated brow stays above eye exclusion',
);
expectLessThan(
  screenRightEnvelope.fillBounds[3],
  screenRightEnvelope.eyeExclusionBounds[1],
  'screen-right generated brow stays above eye exclusion',
);
expectLessThan(
  screenLeftEnvelope.fillBounds[3],
  screenLeftSourceBrowBounds[3],
  'screen-left generated brow bottom is lifted above raw brow body',
);
expectLessThan(
  screenRightEnvelope.fillBounds[3],
  screenRightSourceBrowBounds[3],
  'screen-right generated brow bottom is lifted above raw brow body',
);
expectGreaterThan(
  payload.surroundAnchorPointCount,
  70,
  'generated brow surround anchor count',
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
expectEqual(payload.neutralizeStrength, 0, 'generated brow neutralize stays disabled');
expectEqual(payload.intensity, 1, 'generated brow max color intensity boost');
expectEqual(payload.opacity, 1, 'generated brow max opacity boost');
expectEqual(payload.strandTextureAmount, 1, 'generated brow max strand texture boost');
expectEqual(payload.debugMode, 0, 'generated brow default debug mode');
expectEqual(payload.debugShowLeftRight, false, 'generated brow default left/right debug');
expectEqual(payload.debugExaggerate, false, 'generated brow default exaggeration debug');

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
