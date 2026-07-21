import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-feature-profile-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const srcDir = join(repoRoot, 'apps/mobile/src');

// 순수(RN 무의존) 진입 파일만 나열한다. tsc가 타입 import를 따라가
// shared/contracts/faceFeatureProfile.ts, face-geometry/types.ts,
// regionVisualsBuilder.ts(순수)까지 함께 컴파일한다.
const entries = [
  'features/face-analysis/services/faceFeatureProfileDerive.test.ts',
  'features/face-analysis/services/faceFeatureProfileBuilder.test.ts',
  'features/face-analysis/services/visualWeightMap.test.ts',
  'features/face-report/visualWeightPresentation.test.ts',
  'features/face-report/regionFeatureDescriptors.test.ts',
  'features/ar/services/deriveFitDeltas.test.ts',
  'features/ar/services/personalFitService.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module', 'commonjs',
  '--target', 'ES2020',
  '--esModuleInterop',
  '--strict',
  '--skipLibCheck',
  '--rootDir', srcDir,
  '--outDir', outDir,
  ...entries.map(file => join(srcDir, file)),
]);

run(process.execPath, [
  join(outDir, 'features/face-analysis/services/faceFeatureProfileDerive.test.js'),
]);
run(process.execPath, [
  join(outDir, 'features/face-analysis/services/faceFeatureProfileBuilder.test.js'),
]);
run(process.execPath, [
  join(outDir, 'features/face-analysis/services/visualWeightMap.test.js'),
]);
run(process.execPath, [
  join(outDir, 'features/face-report/visualWeightPresentation.test.js'),
]);
run(process.execPath, [
  join(outDir, 'features/face-report/regionFeatureDescriptors.test.js'),
]);
run(process.execPath, [
  join(outDir, 'features/ar/services/deriveFitDeltas.test.js'),
]);
run(process.execPath, [
  join(outDir, 'features/ar/services/personalFitService.test.js'),
]);
