import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
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
