import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
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
