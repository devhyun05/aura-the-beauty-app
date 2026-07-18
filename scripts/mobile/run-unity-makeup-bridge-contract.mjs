import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-unity-makeup-bridge-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const testPath = join(
  repoRoot,
  'apps/mobile/src/features/ar/services/unityMakeupBridge.test.ts',
);
const bridgePath = join(
  repoRoot,
  'apps/mobile/src/features/ar/services/unityMakeupBridge.ts',
);
const lipRendererPath = join(
  repoRoot,
  'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LipRenderer.cs',
);

const lipRendererSource = readFileSync(lipRendererPath, 'utf8');

assert.doesNotMatch(
  lipRendererSource,
  /EnableSnap|ComputeOuterSnap|TrySampleColor|Snap(?:InRange|OutRange|Steps|MinDrop|Ema|EmaCorner)|_outer(?:Ptmp|Dtmp|RawTmp|OffEma)|_snapPrimed/,
  '립 외곽은 카메라 색상 경계 스냅 없이 정본 랜드마크 경계만 사용해야 한다',
);

const graftFaceRoot = join(
  repoRoot,
  'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face',
);
const unityResourcesRoot = join(
  repoRoot,
  'apps/unity/MakeupAR/Assets/Resources',
);
const bootstrapSource = readFileSync(join(graftFaceRoot, 'ARBootstrap.cs'), 'utf8');
const makeupControllerSource = readFileSync(
  join(graftFaceRoot, 'MakeupController.cs'),
  'utf8',
);
const irisRendererSource = readFileSync(join(graftFaceRoot, 'IrisRenderer.cs'), 'utf8');
const eyeshadowShaderSource = readFileSync(
  join(unityResourcesRoot, 'Eyeshadow.shader'),
  'utf8',
);
const stencilGuideRendererSource = readFileSync(
  join(graftFaceRoot, 'StencilGuideRenderer.cs'),
  'utf8',
);
const lowerLidRendererSource = readFileSync(
  join(graftFaceRoot, 'LowerLidRenderer.cs'),
  'utf8',
);
const makeupQueuesSource = readFileSync(join(graftFaceRoot, 'MakeupQueues.cs'), 'utf8');
const lowerLidShaderSource = readFileSync(
  join(unityResourcesRoot, 'LowerLid.shader'),
  'utf8',
);
const faceMakeupShaderSource = readFileSync(
  join(unityResourcesRoot, 'FaceMakeup.shader'),
  'utf8',
);
const stencilBridgeTypesSource = readFileSync(
  join(repoRoot, 'apps/mobile/src/features/ar/stencil/src/bridge/types.ts'),
  'utf8',
);
const bridgeMessagesSource = readFileSync(
  join(
    repoRoot,
    'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs',
  ),
  'utf8',
);

assert.equal(
  existsSync(join(graftFaceRoot, 'AegyoRenderer.cs')) ||
    existsSync(join(unityResourcesRoot, 'Aegyo.shader')),
  false,
  '정본에 없는 애교살 전용 렌더 패스가 존재하면 안 된다',
);
for (const [name, source] of [
  ['ARBootstrap', bootstrapSource],
  ['MakeupController', makeupControllerSource],
  ['IrisRenderer', irisRendererSource],
  ['StencilGuideRenderer', stencilGuideRendererSource],
]) {
  assert.doesNotMatch(source, /AegyoRenderer/, `${name}가 전용 애교살 렌더러를 구동하면 안 된다`);
}
assert.match(
  makeupQueuesSource,
  /LowerLash\s*=\s*3008[\s\S]*Iris\s*=\s*3009[\s\S]*Eyeliner\s*=\s*3010[\s\S]*LipLiner\s*=\s*3022/,
  '메이크업 합성 큐는 ARwithFable 정본 순서를 따라야 한다',
);
assert.doesNotMatch(makeupQueuesSource, /\bAegyo\s*=/, '별도 애교살 렌더 큐가 있으면 안 된다');
assert.match(
  irisRendererSource,
  /StyleAngleDeg\s*=\s*\{\s*28f,\s*-22f,\s*0f\s*\}[\s\S]*Mathf\.Clamp\(p\.eyeshadowShape,\s*0,\s*3\)/,
  '아이라이너 3종·아이쉐도 4종 범위는 ARwithFable 정본과 같아야 한다',
);
assert.doesNotMatch(
  irisRendererSource + eyeshadowShaderSource,
  /EyelinerStyleCount|EyeshadowShapeCount|EyeshadowBell|EyeshadowShapeWeight|EyeshadowTailAnatomicalX/,
  '정본에 없는 아이라이너·아이쉐도 확장 렌더 분기가 남아 있으면 안 된다',
);
assert.match(
  lowerLidRendererSource,
  /ApplyParams\(\s*float aegyoIntensity/,
  '애교살 파라미터는 정본 LowerLidRenderer가 소유해야 한다',
);
assert.match(
  lowerLidRendererSource,
  /SetAegyoTextureFromFile/,
  '애교살 텍스처는 정본 LowerLidRenderer가 소유해야 한다',
);
assert.match(
  lowerLidShaderSource,
  /float shAmt\s*=\s*valley[^;]*_AegyoIntensity[\s\S]*fixed3 pigHi\s*=\s*1\.0\s*-\s*\(1\.0\s*-\s*feed\)/,
  '애교살 능선과 골은 정본 LowerLid 셰이더 프로파일을 사용해야 한다',
);
assert.match(
  faceMakeupShaderSource,
  /#include "Foundation\.cginc"[\s\S]*FoundationTextureParams\([\s\S]*FoundationTarget\([\s\S]*FoundationSoftClip\([\s\S]*FoundationBlend\(/,
  '파운데이션은 ARwithFable 정본 Foundation.cginc 색 파이프라인을 사용해야 한다',
);
assert.match(
  makeupControllerSource,
  /case "applyFilter":[\s\S]*ClearForkRecipeOverlays\(\);[\s\S]*ApplyTo\(_material, msg\.filter\)/,
  'flat 정본 필터를 적용하기 전 RNBridge/E3 fork 레시피 오버레이를 비워야 한다',
);
assert.match(
  makeupControllerSource,
  /void ClearForkRecipeOverlays\(\)[\s\S]*FindFirstObjectByType<global::E3RegionMaskOverlay>\(\)[\s\S]*ClearRecipesAndHideOverlays\(\)/,
  '스크린스페이스 파운데이션과 비전 립 경계는 flat 정본 필터 경로에 남아 있으면 안 된다',
);

function bodyBetween(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `계약 시작점을 찾을 수 없다: ${startPattern}`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `계약 끝점을 찾을 수 없다: ${endPattern}`);
  return rest.slice(0, end);
}

const tsFilterBody = bodyBetween(
  stencilBridgeTypesSource,
  /export interface FilterParams\s*\{/,
  /\n\}/,
);
const csFilterBody = bodyBetween(
  bridgeMessagesSource,
  /public class FilterParams\s*\{/,
  /\n\s*\[Serializable\]\s*\n\s*public class LensLayerParams/,
);
const tsFilterFields = new Set(
  [...tsFilterBody.matchAll(/^\s{2}([A-Za-z_]\w*)\??:/gm)].map(match => match[1]),
);
const csFilterFields = new Set(
  [...csFilterBody.matchAll(/^\s*public\s+(?:string|float|int|bool)\s+([A-Za-z_]\w*)\b/gm)]
    .map(match => match[1]),
);
const serializedTsFilterFields = new Set(
  [...tsFilterFields].filter(field => !field.endsWith('Imported')),
);
assert.deepEqual(
  [...serializedTsFilterFields].sort(),
  [...csFilterFields].sort(),
  'RN FilterParams와 C# JsonUtility FilterParams 필드는 완전히 같은 이름이어야 한다',
);
for (const forkOnlyField of [
  'aegyoMode',
  'aegyoShadowIntensity',
  'aegyoRendererVersion',
  'highlightZoneVersion',
  'eyelinerLowerColor',
  'eyelinerLowerStyle',
  'eyelinerLowerShimmer',
]) {
  assert.equal(
    tsFilterFields.has(forkOnlyField) || csFilterFields.has(forkOnlyField),
    false,
    `정본에 없는 FilterParams 필드를 제거해야 한다: ${forkOnlyField}`,
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const reactNativeStubDir = join(outDir, 'node_modules/react-native');
mkdirSync(reactNativeStubDir, {recursive: true});
writeFileSync(
  join(reactNativeStubDir, 'index.js'),
  `
class NativeEventEmitter {
  addListener() {
    return { remove() {} };
  }
}

const NativeModules = {
  UnityMakeupBridge: {},
};

module.exports = {
  NativeEventEmitter,
  NativeModules,
};
`,
);

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--esModuleInterop',
  '--skipLibCheck',
  '--outDir',
  outDir,
  testPath,
  bridgePath,
]);

run(process.execPath, [join(outDir, 'features/ar/services/unityMakeupBridge.test.js')], {
  env: {
    ...process.env,
    NODE_PATH: join(outDir, 'node_modules'),
  },
});
