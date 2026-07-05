const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'usage: node validate_generated_brow_package.js <compiled-browGenerateCore.js> <frame.png> <mediapipe_face_landmarks.json> <arface_export.json> <appearance_regions.json> <output-dir>',
  );
  process.exit(2);
}

if (process.argv.length !== 8) {
  usage();
}

const [
  ,
  ,
  browCoreModulePath,
  framePath,
  landmarksPath,
  arFaceExportPath,
  appearanceRegionsPath,
  outputDir,
] = process.argv;

function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, {recursive: true});
}

function bounds(points) {
  if (!points.length) {
    return null;
  }

  return points.reduce(
    (accumulator, point) => ({
      maxX: Math.max(accumulator.maxX, point.x),
      maxY: Math.max(accumulator.maxY, point.y),
      minX: Math.min(accumulator.minX, point.x),
      minY: Math.min(accumulator.minY, point.y),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
    },
  );
}

function polygonPoints(points) {
  return points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

function svgRect(rect, color, dash = false) {
  const [minX, minY, maxX, maxY] = rect;
  return `<rect x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${(maxX - minX).toFixed(1)}" height="${(maxY - minY).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.1"${dash ? ' stroke-dasharray="5 6"' : ''}/>`;
}

function channelBounds(raw, width, height, channel, threshold) {
  let minColumn = width;
  let minRow = height;
  let maxColumn = -1;
  let maxRow = -1;
  let count = 0;

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const value = raw[(row * width + column) * 4 + channel];
      if (value <= threshold) {
        continue;
      }

      count += 1;
      minColumn = Math.min(minColumn, column);
      minRow = Math.min(minRow, row);
      maxColumn = Math.max(maxColumn, column);
      maxRow = Math.max(maxRow, row);
    }
  }

  if (count === 0) {
    return null;
  }

  return {
    count,
    maxColumn,
    maxRow,
    minColumn,
    minRow,
  };
}

function summarizeEnvelope(envelope) {
  return {
    anchorMetadata: envelope.anchorMetadata,
    cleanupBounds: bounds(envelope.cleanupPolygon),
    cleanupPointCount: envelope.cleanupPolygon.length,
    eyeExclusionBounds: envelope.eyeExclusionBounds,
    fillBounds: bounds(envelope.polygon),
    fillPointCount: envelope.polygon.length,
    side: envelope.side,
  };
}

function browHairStrokeSvg(envelope) {
  const envelopeBounds = bounds(envelope.polygon);
  if (!envelopeBounds) {
    return '';
  }

  const direction = envelope.side === 'left' ? 1 : -1;
  const width = Math.max(1, envelopeBounds.maxX - envelopeBounds.minX);
  const height = Math.max(1, envelopeBounds.maxY - envelopeBounds.minY);
  const strokes = [];
  const count = 54;
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const arch = Math.sin(Math.PI * t);
    const tail = Math.max(0, Math.min(1, (t - 0.55) / 0.45));
    const head = Math.max(0, Math.min(1, (0.28 - t) / 0.28));
    const x = envelopeBounds.minX + width * t;
    const centerY = envelopeBounds.minY + height * (0.68 - arch * 0.2 + tail * 0.1);
    const length = height * (0.34 + (1 - tail) * 0.22 + head * 0.28);
    const lift = height * (0.26 + arch * 0.1 - tail * 0.06);
    const startX = x - direction * length * (0.42 + head * 0.18);
    const startY = centerY + height * (0.12 + head * 0.1);
    const endX = x + direction * length * (0.58 - tail * 0.2);
    const endY = centerY - lift;
    const c1X = startX + direction * length * 0.28;
    const c1Y = startY - height * (0.08 + head * 0.08);
    const c2X = endX - direction * length * 0.22;
    const c2Y = endY + height * (0.08 + tail * 0.04);
    const opacity = 0.24 + arch * 0.24 + head * 0.1 - tail * 0.08;
    const strokeWidth = 0.52 + arch * 0.22;
    strokes.push(
      `<path d="M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${c1X.toFixed(1)} ${c1Y.toFixed(1)}, ${c2X.toFixed(1)} ${c2Y.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}" fill="none" stroke="#1B120E" stroke-opacity="${Math.max(0.12, opacity).toFixed(2)}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round"/>`,
    );
  }
  return strokes.join('\n');
}

function serviceEnvelopeSvg(envelope) {
  const polygon = polygonPoints(envelope.polygon);
  const clipId = `browClip-${envelope.side}`;
  return `<g>
<defs>
  <clipPath id="${clipId}">
    <polygon points="${polygon}"/>
  </clipPath>
</defs>
<polygon points="${polygon}" fill="#4A342B" fill-opacity="0.055" filter="url(#browFeather)"/>
<polygon points="${polygon}" fill="#4A342B" fill-opacity="0.12"/>
<g clip-path="url(#${clipId})">
${browHairStrokeSvg(envelope)}
</g>
</g>`;
}

ensureDir(outputDir);

const {buildGeneratedBrowMaskUnityPayload, buildGeneratedBrowPackage} = require(path.resolve(
  browCoreModulePath,
));
const landmarkExport = readJson(landmarksPath);
const arFaceExport = readJson(arFaceExportPath);
const appearanceRegions = readJson(appearanceRegionsPath);

const namedRegions = {
  ...landmarkExport.namedRegions,
  leftEyebrowAppearance: appearanceRegions.leftEyebrowAppearance,
  rightEyebrowAppearance: appearanceRegions.rightEyebrowAppearance,
};

const controls = {
  cleanupStrength: 0,
  colorHex: '#4A342B',
  coverage: 0.9,
  enabled: true,
  intensity: 0.72,
  neutralizeStrength: 0,
  opacity: 0.72,
  shapeId: 'soft-arch',
  strandTextureAmount: 0.72,
};
const nativeResult = {
  arFaceExport: {
    capturePairId: arFaceExport.capturePairId,
    display: arFaceExport.display,
    indices: arFaceExport.indices,
    screenVertices: arFaceExport.screenVertices,
    uvs: arFaceExport.uvs,
  },
  arFaceExportPath,
  boundary: {
    coordinateSpace: 'frame_image_pixel_top_left',
    generationMethod: 'debug_saved_mediapipe_lip_boundary',
    innerPoints: landmarkExport.lipBoundary.innerPoints,
    outerPoints: landmarkExport.lipBoundary.outerPoints,
    source: 'mediapipe',
  },
  capturePairId: landmarkExport.capturePairId,
  captureSetId: landmarkExport.captureSetId,
  captureShotKind: landmarkExport.captureShotKind,
  faceLandmarks: {
    coordinateSpace: 'frame_image_pixel_top_left',
    landmarkCount: landmarkExport.landmarkCount,
    namedRegions,
    provider: 'mediapipe',
  },
  frameHeight: landmarkExport.frameHeight,
  framePath,
  frameWidth: landmarkExport.frameWidth,
  provider: 'mediapipe',
  status: 'ready',
};

const generatedPackage = buildGeneratedBrowPackage({
  controls,
  nativeResult,
});
const unityPayload = buildGeneratedBrowMaskUnityPayload(generatedPackage, controls, {
  controlRevision: 1,
  includeTexture: true,
});
const maskRaw = Buffer.from(unityPayload.maskRawRgbaBase64, 'base64');
const desiredMaskBounds = channelBounds(
  maskRaw,
  unityPayload.maskTextureWidth,
  unityPayload.maskTextureHeight,
  1,
  8,
);
const cleanupMaskBounds = channelBounds(
  maskRaw,
  unityPayload.maskTextureWidth,
  unityPayload.maskTextureHeight,
  0,
  8,
);
const summary = {
  anchorStabilizationMode: unityPayload.anchorStabilizationMode,
  browAnchorPointCount: unityPayload.browAnchorPointCount,
  captureSetId: generatedPackage.captureSetId,
  cleanupMaskBounds,
  colorHex: unityPayload.colorHex,
  desiredMaskBounds,
  enabled: unityPayload.enabled,
  envelopeCount: generatedPackage.browEnvelope.envelopes.length,
  envelopes: generatedPackage.browEnvelope.envelopes.map(summarizeEnvelope),
  eyeAnchorPointCount: unityPayload.eyeAnchorPointCount,
  eyeExclusionMode: unityPayload.eyeExclusionMode,
  generatedMaskId: generatedPackage.generatedMaskId,
  hasRawMask: typeof unityPayload.maskRawRgbaBase64 === 'string',
  maskTextureHeight: unityPayload.maskTextureHeight,
  maskTextureId: unityPayload.maskTextureId,
  maskTextureWidth: unityPayload.maskTextureWidth,
  maskVisible: unityPayload.maskVisible,
  opacity: unityPayload.opacity,
  provider: generatedPackage.provider,
  runtimeSchemaVersion: unityPayload.schemaVersion,
  shapeId: unityPayload.shapeId,
  strandTextureAmount: unityPayload.strandTextureAmount,
  surroundAnchorPointCount: unityPayload.surroundAnchorPointCount,
  uvCoverageMetadata: generatedPackage.uvCoverageMetadata,
  validationVisible: unityPayload.validationVisible,
  visible: unityPayload.visible,
};

const summaryPath = path.join(outputDir, 'generated_brow_package_summary_v4.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const frameBase64 = fs.readFileSync(framePath).toString('base64');
const envelopeSvg = generatedPackage.browEnvelope.envelopes
  .map(envelope => {
    const fill = `<polygon points="${polygonPoints(envelope.polygon)}" fill="#4A342B" fill-opacity="0.68" stroke="#FFD400" stroke-width="0.75" stroke-linejoin="round"/>`;
    const cleanup = `<polygon points="${polygonPoints(envelope.cleanupPolygon)}" fill="none" stroke="#FFD400" stroke-width="0.85" stroke-opacity="0.45" stroke-dasharray="5 6"/>`;
    const eye = svgRect(envelope.eyeExclusionBounds, '#22C7FF', true);
    return `${cleanup}\n${eye}\n${fill}`;
  })
  .join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${nativeResult.frameWidth}" height="${nativeResult.frameHeight}" viewBox="0 0 ${nativeResult.frameWidth} ${nativeResult.frameHeight}">
<style>.title{font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;fill:#FFD400;paint-order:stroke;stroke:#000;stroke-width:4px}.sub{font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:3px}</style>
<image href="data:image/png;base64,${frameBase64}" x="0" y="0" width="${nativeResult.frameWidth}" height="${nativeResult.frameHeight}"/>
${envelopeSvg}
<text class="title" x="24" y="42">Production generated brow package preview</text>
<text class="sub" x="24" y="68">yellow=actual TS envelope, blue=eye exclusion, brown=expected Unity fill at runtime opacity</text>
</svg>`;
const svgPath = path.join(outputDir, 'generated_brow_package_preview_v4.svg');
fs.writeFileSync(svgPath, svg);
const serviceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${nativeResult.frameWidth}" height="${nativeResult.frameHeight}" viewBox="0 0 ${nativeResult.frameWidth} ${nativeResult.frameHeight}">
<defs>
  <filter id="browFeather" x="-8%" y="-18%" width="116%" height="136%">
    <feGaussianBlur stdDeviation="1.45"/>
  </filter>
</defs>
<image href="data:image/png;base64,${frameBase64}" x="0" y="0" width="${nativeResult.frameWidth}" height="${nativeResult.frameHeight}"/>
${generatedPackage.browEnvelope.envelopes.map(serviceEnvelopeSvg).join('\n')}
</svg>`;
const serviceSvgPath = path.join(outputDir, 'generated_brow_service_preview_v4.svg');
fs.writeFileSync(serviceSvgPath, serviceSvg);

console.log(
  JSON.stringify(
    {
      desiredMaskBounds,
      envelopeCount: summary.envelopeCount,
      generatedMaskId: summary.generatedMaskId,
      hasRawMask: summary.hasRawMask,
      paths: {
        serviceSvg: serviceSvgPath,
        summary: summaryPath,
        svg: svgPath,
      },
      positiveTexels: summary.uvCoverageMetadata.positiveTexels,
      visible: summary.visible,
    },
    null,
    2,
  ),
);
