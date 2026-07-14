import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-geometry-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');

// 공통 소스 루트: tsc 는 이 루트 기준 디렉터리 구조를 outDir 에 보존한다.
const featuresDir = join(repoRoot, 'apps/mobile/src/features');

const sources = [
  'face-geometry/types.ts',
  'face-geometry/services/faceGeometryCore/landmarkIndices.ts',
  'face-geometry/services/faceGeometryCore/faceGeometryMath.ts',
  'face-analysis/services/stillAnalysisWait.ts',
];
const tests = [
  'face-geometry/services/faceGeometryCore/faceGeometryMath.test.ts',
  'face-geometry/services/faceGeometryRuntimeEvidence.test.ts',
  'face-analysis/services/stillAnalysisWait.test.ts',
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
  ...sources.map(f => join(featuresDir, f)),
  ...tests.map(f => join(featuresDir, f)),
]);

for (const test of tests) {
  run(process.execPath, [join(outDir, test.replace(/\.ts$/, '.js'))]);
}
