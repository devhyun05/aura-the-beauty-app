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
