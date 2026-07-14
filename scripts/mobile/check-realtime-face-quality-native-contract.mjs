import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const nativePath = 'apps/mobile/ios/AURA/AURARealtimeFaceCaptureView.m';
const source = readFileSync(resolve(repoRoot, nativePath), 'utf8');

function expect(condition, message) {
  if (!condition) {
    throw new Error(`[aura:realtime-quality-native] ${message}`);
  }
}

function expectSource(pattern, message) {
  expect(pattern.test(source), `${nativePath}: ${message}`);
}

for (const field of [
  'faceWidthRatio',
  'faceAreaRatio',
  'exposureMean',
  'shadowRatio',
  'highlightRatio',
  'blurScore',
]) {
  expectSource(new RegExp(`@"${field}"`), `missing imageQuality.${field}`);
}

expectSource(
  /payload\[@"imageQuality"\]\s*=\s*imageQuality/,
  'quality metrics are not attached to the top-level native event',
);
expectSource(
  /AURARealtimeFaceQualityMetrics\(imageBuffer,\s*primaryFace,\s*orientation\)/,
  'quality metrics do not use the same frame, primary Vision face, and EXIF orientation',
);
expectSource(
  /@"faceCount":\s*@\(faces\.count\)/,
  'existing top-level Vision faceCount contract is missing',
);
expectSource(
  /kCVPixelBufferPixelFormatTypeKey:\s*@\(kCVPixelFormatType_32BGRA\)/,
  'video output is no longer pinned to 32BGRA',
);
expectSource(
  /CVPixelBufferLockBaseAddress\(pixelBuffer,\s*kCVPixelBufferLock_ReadOnly\)/,
  'pixel buffer is not read-locked',
);
expectSource(
  /CVPixelBufferUnlockBaseAddress\(pixelBuffer,\s*kCVPixelBufferLock_ReadOnly\)/,
  'pixel buffer is not unlocked',
);
expectSource(
  /AURARealtimeQualitySampleMaxEdge\s*=\s*512/,
  'ROI sample max edge changed without updating the native contract',
);
expectSource(
  /AURARealtimeQualitySampleMaxPixels\s*=\s*65536/,
  'ROI sample pixel cap changed without updating the native contract',
);

expectSource(
  /kCGImagePropertyOrientationRight:[\s\S]*?CGPointMake\(point\.y,\s*1\.0 - point\.x\)/,
  'Right EXIF inverse transform is missing',
);
expectSource(
  /kCGImagePropertyOrientationLeft:[\s\S]*?CGPointMake\(1\.0 - point\.y,\s*point\.x\)/,
  'Left EXIF inverse transform is missing',
);
expectSource(
  /const CGFloat top = 1\.0 - CGRectGetMaxY\(box\)/,
  'Vision lower-left bbox is not converted to top-left coordinates',
);

function rawPointFromOrientedTopLeft({x, y}, orientation) {
  if (orientation === 'right') return {x: y, y: 1 - x};
  if (orientation === 'left') return {x: 1 - y, y: x};
  return {x, y};
}

function rawRectFromVisionBox({x, y, width, height}, orientation) {
  const left = x;
  const right = x + width;
  const top = 1 - y - height;
  const bottom = 1 - y;
  const raw = [
    {x: left, y: top},
    {x: right, y: top},
    {x: left, y: bottom},
    {x: right, y: bottom},
  ].map(point => rawPointFromOrientedTopLeft(point, orientation));
  const xs = raw.map(point => point.x);
  const ys = raw.map(point => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function expectNear(actual, expected, label) {
  expect(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`);
}

const fixture = {x: 0.2, y: 0.3, width: 0.4, height: 0.5};
const leftRaw = rawRectFromVisionBox(fixture, 'left');
expectNear(leftRaw.x, 0.3, 'left raw x');
expectNear(leftRaw.y, 0.2, 'left raw y');
expectNear(leftRaw.width, 0.5, 'left raw width');
expectNear(leftRaw.height, 0.4, 'left raw height');
const rightRaw = rawRectFromVisionBox(fixture, 'right');
expectNear(rightRaw.x, 0.2, 'right raw x');
expectNear(rightRaw.y, 0.4, 'right raw y');
expectNear(rightRaw.width, 0.5, 'right raw width');
expectNear(rightRaw.height, 0.4, 'right raw height');
expectNear(fixture.width * fixture.height, leftRaw.width * leftRaw.height, 'area invariance');

function sampleGrid(width, height) {
  const maxEdge = 512;
  const maxPixels = 65536;
  let stride = Math.max(Math.ceil(width / maxEdge), Math.ceil(height / maxEdge), 1);
  while (Math.ceil(width / stride) * Math.ceil(height / stride) > maxPixels) stride += 1;
  return {columns: Math.ceil(width / stride), rows: Math.ceil(height / stride)};
}

for (const [width, height] of [[4032, 3024], [1280, 720], [640, 640], [1, 1]]) {
  const grid = sampleGrid(width, height);
  expect(grid.columns <= 512 && grid.rows <= 512, `${width}x${height} exceeds max sample edge`);
  expect(grid.columns * grid.rows <= 65536, `${width}x${height} exceeds sample pixel cap`);
}

console.log('[aura:realtime-quality-native] PASS — ROI transform, payload shape, and sample bounds verified');
