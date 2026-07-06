import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-personal-color-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');

const coreDir = join(
  repoRoot,
  'apps/mobile/src/features/personal-color/services/personalColorCore',
);

const sources = [
  'contracts.ts',
  'constants.ts',
  'colorMath.ts',
  'axisModel.ts',
  'toneClassifier.ts',
  'palette.ts',
  'engine.ts',
  'fixtureInventory.ts',
  'colorLightingGreenlight.ts',
  'personalColorRepeatability.ts',
];
const tests = [
  'colorMath.test.ts',
  'axisModel.test.ts',
  'toneClassifier.test.ts',
  'engine.test.ts',
  'colorLightingGreenlight.test.ts',
  'personalColorRepeatability.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--esModuleInterop',
  '--strict',
  '--skipLibCheck',
  '--outDir',
  outDir,
  ...sources.map(f => join(coreDir, f)),
  ...tests.map(f => join(coreDir, f)),
]);

for (const test of tests) {
  run(process.execPath, [join(outDir, test.replace(/\.ts$/, '.js'))]);
}
