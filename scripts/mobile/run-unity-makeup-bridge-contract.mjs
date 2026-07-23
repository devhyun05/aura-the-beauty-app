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
const nativeViewSource = readFileSync(
  join(
    repoRoot,
    'apps/mobile/src/features/ar/components/UnityMakeupNativeView.tsx',
  ),
  'utf8',
);
const iosBridgeSource = readFileSync(
  join(repoRoot, 'apps/mobile/ios/AURA/UnityMakeupBridge.m'),
  'utf8',
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
const eyeshadowShapeSource = readFileSync(
  join(unityResourcesRoot, 'EyeshadowShape.cginc'),
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

assert.match(
  nativeViewSource,
  /export type UnityMakeupRuntimeMode = 'live' \| 'still';[\s\S]*runtimeMode = 'live'/,
  'Unity native view는 live 기본값과 still 표시 모드를 타입으로 노출해야 한다',
);
assert.match(
  iosBridgeSource,
  /RCT_EXPORT_VIEW_PROPERTY\(runtimeMode, NSString\)/,
  'iOS Unity view manager가 runtimeMode prop을 내보내야 한다',
);
assert.match(
  iosBridgeSource,
  /if \(_unityViewOwner != container\)[\s\S]*ignored stale unity container runtime mode update[\s\S]*visible-container-mode-changed/,
  '이전 Unity container의 늦은 prop 갱신이 현재 singleton 소유자의 모드를 바꾸면 안 된다',
);
assert.match(
  iosBridgeSource,
  /if \(_applicationIsActive && hasVisibleOwner\)[\s\S]*_visibleRuntimeMode isEqualToString:@"still"[\s\S]*runtimeMode = @"live";/,
  '보이는 container는 live/still 모드를 직접 선택하고 still에서 렌더 루프를 유지해야 한다',
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
  /StyleAngleDeg\s*=\s*\{\s*28f,\s*-22f,\s*0f,\s*0f,\s*24f,\s*-18f\s*\}[\s\S]*StyleTailLen\s*=\s*\{\s*0\.45f,\s*0\.4f,\s*0\.7f,\s*1\.4f,\s*1\.2f,\s*1\.1f\s*\}/,
  '아이라이너 6종 각도·꼬리 길이 범위는 ARwithFable 정본과 같아야 한다',
);
assert.match(
  irisRendererSource,
  /Mathf\.Clamp\(layer\.shape,\s*0,\s*11\)[\s\S]*Mathf\.Clamp\(p\.eyeshadowShape,\s*0,\s*11\)/,
  '멀티밴드와 단일 아이쉐도 모두 12종 shape 범위를 사용해야 한다',
);
assert.match(
  eyeshadowShaderSource,
  /#include "EyeshadowShape\.cginc"[\s\S]*EsEvalShape\([\s\S]*EsExtensionGate\(/,
  '아이쉐도 셰이더는 공용 12종 shape 프로파일과 확장 게이트를 사용해야 한다',
);
assert.match(
  eyeshadowShapeSource,
  /void\s+EsEvalShape\([\s\S]*float\s+EsExtensionGate\(/,
  '공용 아이쉐도 12종 shape 구현이 누락되면 안 된다',
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
  /tex2D\(_AegyoProfile[\s\S]*float hiAmt\s*=\s*aegyoProf\.r[^;]*_AegyoIntensity[\s\S]*float shAmt\s*=\s*aegyoProf\.g[^;]*_AegyoIntensity[\s\S]*fixed3 pigHi\s*=\s*1\.0\s*-\s*\(1\.0\s*-\s*feed\)/,
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
  /void ClearForkRecipeOverlays\(\)[\s\S]*Type\.GetType\("E3RegionMaskOverlay, Assembly-CSharp"\)[\s\S]*GetMethod\("ClearRecipesAndHideOverlays"\)[\s\S]*clearMethod\.Invoke/,
  '스크린스페이스 파운데이션과 비전 립 경계는 flat 정본 필터 경로에 남아 있으면 안 된다',
);
assert.doesNotMatch(
  makeupControllerSource,
  /global::E3RegionMaskOverlay/,
  'MediaPipe graft asmdef는 기본 Assembly-CSharp 타입을 직접 참조하면 안 된다',
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
  // JsonUtility serializes instance fields only. Contract constants document
  // valid ranges but are not payload fields, so exclude both static and const.
  [...csFilterBody.matchAll(/^[ \t]*public[ \t]+(?!static\b|const\b)[A-Za-z_]\w*(?:\[\])?[ \t]+([A-Za-z_]\w*)\b[^\n;]*;/gm)]
    .map(match => match[1]),
);
const compileOnlyTsFilterFields = new Set([
  'eyeshadowSurface',
  'highlightZone',
  'highlightZoneWeight',
]);
const serializedTsFilterFields = new Set(
  [...tsFilterFields].filter(
    field => !field.endsWith('Imported') && !compileOnlyTsFilterFields.has(field),
  ),
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
  'eyelinerLowerStyle',
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
