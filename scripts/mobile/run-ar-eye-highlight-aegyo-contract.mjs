import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const outDir = mkdtempSync(join(tmpdir(), 'aura-ar-eye-highlight-aegyo-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const contractTest = join(
  srcRoot,
  'features/ar/stencil/src/composer/eyeHighlightAegyoContract.test.ts',
);
const args = process.argv.slice(2);
const mobileOnly = args.includes('--mobile-only');
const sectionIndex = args.indexOf('--section');
const section = sectionIndex >= 0 ? args[sectionIndex + 1] : null;

const unityRoot = join(repoRoot, 'apps/unity/MakeupAR/Assets');
const read = relative => readFileSync(join(unityRoot, relative), 'utf8');
const readMaybe = relative =>
  existsSync(join(unityRoot, relative)) ? read(relative) : '';
const mustHave = (source, marker, message) =>
  assert.ok(source.includes(marker), message ?? `missing marker: ${marker}`);
const mustNotHave = (source, marker, message) =>
  assert.ok(!source.includes(marker), message ?? `stale marker: ${marker}`);

function checkBridge() {
  const bridge = read('Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs');
  for (const field of [
    'highlightCheekIntensity',
    'highlightNoseBridgeIntensity',
    'highlightNoseTipIntensity',
    'highlightBrowBoneIntensity',
    'highlightCupidIntensity',
    'eyelinerLowerStyle',
    'eyelinerLowerFinish',
    'eyelinerLowerShimmer',
    'aegyoMode',
    'aegyoShadowIntensity',
    'aegyoRendererVersion',
  ]) {
    mustHave(bridge, `public float ${field}`, `Unity bridge field ${field} is missing`);
  }
}

function shapeWindow(center, width, x) {
  const distance = Math.abs(x - center) / width;
  return Math.max(0, 1 - distance * distance);
}

function tailFade(x) {
  const t = Math.max(0, Math.min(1, (x - 1) / 0.28));
  return 1 - t * t * (3 - 2 * t);
}

function shapeWeight(shape, vertical, x) {
  const family = shape <= 2 ? 0 : shape <= 5 ? 1 : shape <= 8 ? 2 : shape;
  const center = shape % 3 === 1 ? 0.52 : shape % 3 === 2 ? 0.84 : 0.18;
  const horizontal = shape <= 8 ? shapeWindow(center, family === 2 ? 0.2 : 0.42, x) : 1;
  const verticalWeight = family === 0
    ? 1 - Math.abs(vertical - 0.45)
    : family === 1
      ? shapeWindow(0.48, 0.48, vertical)
      : family === 2
        ? shapeWindow(0.4, 0.28, vertical)
        : 1;
  const usesTail = [2, 5, 8, 10, 11].includes(shape);
  const tailGate = x <= 1 || usesTail ? 1 : 0;
  return Math.max(0, horizontal * verticalWeight * tailFade(x) * tailGate);
}

function checkEyeshadow() {
  const iris = read('Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs');
  const shader = read('Resources/Eyeshadow.shader');
  mustHave(iris, 'const int EyeshadowShapeCount = 12;');
  mustHave(iris, 'const int EyeshadowTailSubdiv = 6;');
  mustHave(iris, 'EyeshadowTailAnatomicalX = 1.28f');
  mustHave(shader, 'float EyeshadowShapeWeight(');
  assert.ok(
    shader.split('EyeshadowShapeWeight(').length >= 4,
    'single and layered eyeshadow paths must share the shape helper',
  );
  const anatomicalXAtTail = 1.28;
  assert.ok(anatomicalXAtTail > 1, 'tail must extend beyond the outer corner');
  assert.equal(tailFade(anatomicalXAtTail), 0, 'tail tip alpha must be zero');
  assert.ok(shapeWeight(5, 0.48, 1.08) > 0, 'main outer must use the extension');
  assert.ok(shapeWeight(0, 0.48, 1.08) < 0.05, 'base full must not paint the tail');
}

function checkEyeliner() {
  const iris = read('Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs');
  const lower = read('Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs');
  const shader = read('Resources/LowerLid.shader');
  mustHave(iris, 'const int EyelinerStyleCount = 6;');
  mustHave(lower, 'LowerLinerStyleId');
  mustHave(lower, 'LowerLinerFinishId');
  mustHave(lower, 'LowerLinerShimmerId');
  mustHave(shader, '_LowerLinerStyle');
  mustHave(shader, '_LowerLinerFinish');
  mustHave(shader, '_LowerLinerShimmer');
  mustHave(shader, 'LowerLinerHorizontalMask');
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lowerShadowMask(shape, along) {
  const edge = smoothstep(0, 0.08, along) * (1 - smoothstep(0.92, 1, along));
  if (shape < 0.5) return edge;
  if (shape < 1.5) return edge * (1 - smoothstep(0.22, 0.5, along));
  if (shape < 2.5) {
    return edge * smoothstep(0.18, 0.4, along) * (1 - smoothstep(0.6, 0.82, along));
  }
  if (shape < 3.5) return edge * smoothstep(0.5, 0.78, along);
  return edge * (0.55 + (1 - 0.55) * smoothstep(0.2, 0.86, along));
}

function checkLowerEyeIndependence() {
  const bridge = read('Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs');
  const controller = read('Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs');
  const lower = read('Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs');
  const shader = read('Resources/LowerLid.shader');
  mustHave(bridge, 'public int eyeshadowLowerShape = 0;');
  mustHave(bridge, 'public string eyelinerLowerColor = "";');
  mustHave(lower, 'LowerShadowShapeId');
  mustHave(shader, '_LowerShadowShape');
  mustHave(shader, 'LowerShadowHorizontalMask');
  mustHave(controller, 'string.IsNullOrEmpty(p.eyelinerLowerColor)');
  assert.ok(lowerShadowMask(1, 0.18) > lowerShadowMask(1, 0.82));
  assert.ok(lowerShadowMask(2, 0.5) > lowerShadowMask(2, 0.15));
  assert.ok(lowerShadowMask(3, 0.82) > lowerShadowMask(3, 0.18));
  assert.ok(lowerShadowMask(4, 0.82) > lowerShadowMask(4, 0.18));
}

function checkHighlighter() {
  const masks = read('Scripts/MediaPipeGraft/ARwithFable/Face/MaskGenerator.cs');
  const controller = read('Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs');
  const shader = read('Resources/FaceMakeup.shader');
  for (const marker of [
    'HighlightCheekRegion',
    'HighlightNoseBridgeRegion',
    'HighlightNoseTipRegion',
    'HighlightBrowBoneRegion',
    'HighlightCupidRegion',
  ]) mustHave(masks, marker);
  for (const marker of [
    'HighlightCheekIntensityId',
    'HighlightNoseBridgeIntensityId',
    'HighlightNoseTipIntensityId',
    'HighlightBrowBoneIntensityId',
    'HighlightCupidIntensityId',
  ]) mustHave(controller, marker);
  mustHave(shader, 'float zonePeak =');
  mustHave(shader, 'float zoneHighlight =');
  mustHave(shader, 'zonePeak > 1e-5');
}

function checkAegyo() {
  const aegyo = readMaybe('Scripts/MediaPipeGraft/ARwithFable/Face/AegyoRenderer.cs');
  const aegyoShader = readMaybe('Resources/Aegyo.shader');
  const lower = read('Scripts/MediaPipeGraft/ARwithFable/Face/LowerLidRenderer.cs');
  const lowerShader = read('Resources/LowerLid.shader');
  const controller = read('Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs');
  const bootstrap = read('Scripts/MediaPipeGraft/ARwithFable/Face/ARBootstrap.cs');
  const iris = read('Scripts/MediaPipeGraft/ARwithFable/Face/IrisRenderer.cs');
  const stencil = read('Scripts/MediaPipeGraft/ARwithFable/Face/StencilGuideRenderer.cs');
  mustHave(aegyo, 'class AegyoRenderer');
  mustHave(aegyo, 'public bool NeedsEyeMask');
  mustHave(aegyo, 'TryGetAegyoFitHandle');
  mustHave(aegyoShader, 'AegyoVerticalProfile');
  mustHave(aegyoShader, '_AegyoMode');
  mustNotHave(lower, 'SetAegyoTextureFromFile');
  mustNotHave(lower, 'AegyoIntensityId');
  mustNotHave(lowerShader, '_AegyoIntensity');
  mustHave(controller, 'AegyoRenderer.Instance.ApplyParams');
  mustHave(controller, 'aegyoRendererVersion >= 1f');
  mustHave(bootstrap, 'AddComponent<AegyoRenderer>()');
  mustHave(iris, 'AegyoRenderer.Instance.NeedsEyeMask');
  mustHave(stencil, 'AegyoRenderer.Instance');

  const queues = read('Scripts/MediaPipeGraft/ARwithFable/Face/MakeupQueues.cs');
  const entries = [...queues.matchAll(/public const int (\w+) = (\d+);/g)]
    .map(([, name, value]) => [name, Number(value)]);
  const values = entries.map(([, value]) => value);
  assert.equal(new Set(values).size, values.length, 'makeup render queues must be unique');
  const byName = Object.fromEntries(entries);
  assert.ok(
    byName.LowerLid < byName.Aegyo &&
      byName.Aegyo < byName.LowerLash &&
      byName.LowerLash < byName.Iris &&
      byName.Iris < byName.Eyeliner,
    'eye render queues must preserve LowerLid < Aegyo < LowerLash < Iris < Eyeliner',
  );
}

const result = spawnSync(
  process.execPath,
  [
    tscPath,
    '--ignoreConfig',
    '--module',
    'commonjs',
    '--target',
    'ES2020',
    '--esModuleInterop',
    '--skipLibCheck',
    '--rootDir',
    srcRoot,
    '--outDir',
    outDir,
    contractTest,
  ],
  {cwd: repoRoot, stdio: 'inherit'},
);

if (result.status !== 0) process.exit(result.status ?? 1);

const testResult = spawnSync(
  process.execPath,
  [
    join(
      outDir,
      'features/ar/stencil/src/composer/eyeHighlightAegyoContract.test.js',
    ),
  ],
  {cwd: repoRoot, stdio: 'inherit'},
);

if (testResult.status !== 0) process.exit(testResult.status ?? 1);

if (!mobileOnly) {
  checkBridge();
  if (section == null || section === 'eyeshadow') checkEyeshadow();
  if (section == null || section === 'eyeliner') checkEyeliner();
  if (section == null || section === 'lower-eye') checkLowerEyeIndependence();
  if (section == null || section === 'highlighter') checkHighlighter();
  if (section == null || section === 'aegyo') checkAegyo();
}

console.log('AR eye, highlighter, and aegyo runner passed');
